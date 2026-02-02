/**
 * SyncPage Database Hooks
 * Provides data fetching and mutations for the fork/sync functionality
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useState, useEffect } from 'react';

// ============================================================
// Types
// ============================================================

export type ForkSyncStatus = 'up_to_date' | 'outdated' | 'source_deleted';

export interface PublicQuestion {
    id: string;
    title: string;
    content: string;
    question_type: string;
    difficulty: 'easy' | 'medium' | 'hard' | null;
    subject_id: string | null;
    subject_name: string | null;
    subject_color: string | null;
    created_at: string;
    content_hash: string | null;
    // Aggregated fields
    fork_count: number;
    tags: string[];
    // User-specific
    my_fork_id: string | null;
}

export interface MyFork {
    id: string;
    title: string;
    content: string;
    forked_from: string;
    subject_id: string | null;
    subject_name: string | null;
    created_at: string;
    updated_at: string;
    content_hash: string | null;
    last_synced_hash: string | null;
    // Computed
    sync_status: ForkSyncStatus;
    diff_summary: {
        title_changed: boolean;
        content_changed: boolean;
        answer_changed: boolean;
    };
}

export interface SyncActivity {
    id: string;
    type: 'fork_success' | 'sync_success' | 'sync_failed' | 'source_updated';
    entity_name: string;
    entity_id: string;
    timestamp: string;
}

// ============================================================
// Auth Hook (Singleton pattern to prevent multiple subscriptions)
// ============================================================

// Global state to share across hook instances
const authStore = {
    userId: null as string | null,
    isLoading: true,
    initialized: false,
    listeners: new Set<() => void>(),

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        // Initialize on first subscription
        if (!this.initialized) {
            this.initialized = true;
            supabase.auth.getSession().then(({ data: { session } }) => {
                this.userId = session?.user?.id ?? null;
                this.isLoading = false;
                this.notify();
            });
            supabase.auth.onAuthStateChange((_event, session) => {
                const newUserId = session?.user?.id ?? null;
                if (this.userId !== newUserId) {
                    this.userId = newUserId;
                    this.notify();
                }
            });
        }
        return () => { this.listeners.delete(listener); };
    },

    notify() {
        this.listeners.forEach(fn => fn());
    },

    getSnapshot() {
        return { userId: this.userId, isLoading: this.isLoading };
    },
};

/**
 * Hook to track Supabase auth session state (shared singleton)
 */
export function useSupabaseAuth() {
    const [state, setState] = useState(() => authStore.getSnapshot());

    useEffect(() => {
        // Update state when store changes
        const unsubscribe = authStore.subscribe(() => {
            const newState = authStore.getSnapshot();
            setState(prev => {
                // Only update if values actually changed
                if (prev.userId === newState.userId && prev.isLoading === newState.isLoading) {
                    return prev;
                }
                return newState;
            });
        });
        // Sync initial state
        setState(authStore.getSnapshot());
        return unsubscribe;
    }, []);

    return {
        userId: state.userId,
        isAuthenticated: !!state.userId,
        isLoading: state.isLoading,
    };
}

// ============================================================
// Query Keys
// ============================================================

export const syncQueryKeys = {
    publicQuestions: (filters?: { search?: string; subjectId?: string }) =>
        ['sync', 'public', filters] as const,
    myForks: () => ['sync', 'myForks'] as const,
    activity: () => ['sync', 'activity'] as const,
    forkStatus: (id: string) => ['sync', 'forkStatus', id] as const,
};

// ============================================================
// Queries
// ============================================================

interface QueryOptions {
    enabled?: boolean;
}

/**
 * Fetch public questions available for forking
 * NOTE: Requires authenticated session due to RLS policy
 */
export function usePublicQuestions(filters?: { search?: string; subjectId?: string }, options?: QueryOptions) {
    return useQuery({
        queryKey: syncQueryKeys.publicQuestions(filters),
        queryFn: async (): Promise<PublicQuestion[]> => {
            // Base query: public questions (user_id IS NULL, not archived)
            let query = supabase
                .from('error_questions')
                .select(`
                    id,
                    title,
                    content,
                    question_type,
                    difficulty,
                    subject_id,
                    created_at,
                    content_hash,
                    subjects:subject_id (
                        name,
                        color
                    )
                `)
                .is('user_id', null)
                .eq('is_archived', false)
                .order('created_at', { ascending: false })
                .limit(50);

            // Apply search filter
            if (filters?.search) {
                query = query.ilike('title', `%${filters.search}%`);
            }

            // Apply subject filter
            if (filters?.subjectId) {
                query = query.eq('subject_id', filters.subjectId);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Get current user's forks to check if already forked
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id;

            let myForkIds: Record<string, string> = {};
            if (userId) {
                const { data: forks } = await supabase
                    .from('error_questions')
                    .select('id, forked_from')
                    .eq('user_id', userId)
                    .not('forked_from', 'is', null);

                if (forks) {
                    myForkIds = Object.fromEntries(
                        forks.map(f => [f.forked_from!, f.id])
                    );
                }
            }

            // Get fork counts for each public question
            const questionIds = data?.map(q => q.id) || [];

            let forkCountMap: Record<string, number> = {};
            if (questionIds.length > 0) {
                const { data: forkCounts } = await supabase
                    .from('error_questions')
                    .select('forked_from')
                    .in('forked_from', questionIds);

                forkCounts?.forEach(fc => {
                    if (fc.forked_from) {
                        forkCountMap[fc.forked_from] = (forkCountMap[fc.forked_from] || 0) + 1;
                    }
                });
            }

            // Get tags for questions
            let tagsMap: Record<string, string[]> = {};
            if (questionIds.length > 0) {
                const { data: questionTags } = await supabase
                    .from('error_question_tags')
                    .select('question_id, tags:tag_id(name)')
                    .in('question_id', questionIds);

                questionTags?.forEach(qt => {
                    if (!tagsMap[qt.question_id]) tagsMap[qt.question_id] = [];
                    if (qt.tags && 'name' in qt.tags) {
                        tagsMap[qt.question_id].push((qt.tags as { name: string }).name);
                    }
                });
            }

            return (data || []).map(q => ({
                id: q.id,
                title: q.title,
                content: q.content || '',
                question_type: q.question_type,
                difficulty: q.difficulty as 'easy' | 'medium' | 'hard' | null,
                subject_id: q.subject_id,
                subject_name: (q.subjects as { name: string } | null)?.name || null,
                subject_color: (q.subjects as { color: string } | null)?.color || null,
                created_at: q.created_at,
                content_hash: q.content_hash,
                fork_count: forkCountMap[q.id] || 0,
                tags: tagsMap[q.id] || [],
                my_fork_id: myForkIds[q.id] || null,
            }));
        },
        staleTime: 30_000, // 30 seconds
        enabled: options?.enabled ?? true,
    });
}

/**
 * Fetch user's forked questions with sync status
 * NOTE: Requires authenticated session
 */
export function useMyForks(options?: QueryOptions) {
    return useQuery({
        queryKey: syncQueryKeys.myForks(),
        queryFn: async (): Promise<MyFork[]> => {
            // Get user's forked questions
            const { data, error } = await supabase
                .from('error_questions')
                .select(`
                    id,
                    title,
                    content,
                    forked_from,
                    subject_id,
                    created_at,
                    updated_at,
                    content_hash,
                    last_synced_hash,
                    subjects:subject_id (
                        name
                    )
                `)
                .not('forked_from', 'is', null)
                .eq('is_archived', false)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            if (!data || data.length === 0) return [];

            // Get parent questions to check sync status
            const parentIds = data.map(d => d.forked_from).filter(Boolean) as string[];
            const { data: parents } = await supabase
                .from('error_questions')
                .select('id, title, content, correct_answer, content_hash')
                .in('id', parentIds);

            const parentMap = new Map(parents?.map(p => [p.id, p]));

            return data.map(fork => {
                const parent = parentMap.get(fork.forked_from!);

                let sync_status: ForkSyncStatus;
                let diff_summary = { title_changed: false, content_changed: false, answer_changed: false };

                if (!parent) {
                    sync_status = 'source_deleted';
                } else if (parent.content_hash === fork.last_synced_hash) {
                    sync_status = 'up_to_date';
                } else {
                    sync_status = 'outdated';
                    diff_summary = {
                        title_changed: parent.title !== fork.title,
                        content_changed: parent.content !== fork.content,
                        answer_changed: JSON.stringify(parent.correct_answer) !== JSON.stringify((fork as any).correct_answer),
                    };
                }

                return {
                    id: fork.id,
                    title: fork.title,
                    content: fork.content || '',
                    forked_from: fork.forked_from!,
                    subject_id: fork.subject_id,
                    subject_name: (fork.subjects as { name: string } | null)?.name || null,
                    created_at: fork.created_at,
                    updated_at: fork.updated_at,
                    content_hash: fork.content_hash,
                    last_synced_hash: fork.last_synced_hash,
                    sync_status,
                    diff_summary,
                };
            });
        },
        staleTime: 10_000, // 10 seconds
        enabled: options?.enabled ?? true,
    });
}

/**
 * Fetch user's sync activity from realtime_signals
 * NOTE: Requires authenticated session
 */
export function useSyncActivity(options?: QueryOptions) {
    return useQuery({
        queryKey: syncQueryKeys.activity(),
        queryFn: async (): Promise<SyncActivity[]> => {
            // Query realtime_signals for question-related events
            const { data, error } = await supabase
                .from('realtime_signals')
                .select('entity_key, op, payload, updated_at')
                .eq('topic', 'question')
                .order('updated_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            if (!data || data.length === 0) return [];

            // Get question titles for entity names
            const questionIds = data.map(d => d.entity_key).filter(Boolean);
            const { data: questions } = await supabase
                .from('error_questions')
                .select('id, title')
                .in('id', questionIds);

            const titleMap = new Map(questions?.map(q => [q.id, q.title]));

            return data.map((signal, idx) => {
                // Determine activity type based on payload
                const payload = signal.payload as Record<string, any> || {};
                let type: SyncActivity['type'] = 'sync_success';

                if (payload.reason === 'source_updated') {
                    type = 'source_updated';
                } else if (signal.op === 'UPSERT' && payload.forked_at) {
                    type = 'fork_success';
                } else if (signal.op === 'REFRESH') {
                    type = 'sync_success';
                }

                return {
                    id: `activity-${idx}-${signal.entity_key}`,
                    type,
                    entity_name: titleMap.get(signal.entity_key) || signal.entity_key.slice(0, 8) + '...',
                    entity_id: signal.entity_key,
                    timestamp: signal.updated_at,
                };
            });
        },
        staleTime: 5_000, // 5 seconds
        enabled: options?.enabled ?? true,
    });
}

// ============================================================
// Mutations
// ============================================================

/**
 * Fork a public question to user's private library
 */
export function useForkQuestion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (questionId: string): Promise<string> => {
            const { data, error } = await supabase
                .rpc('fork_question_to_private', { p_question_id: questionId });

            if (error) throw error;
            return data as string;
        },
        onSuccess: () => {
            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: ['sync', 'public'] });
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.myForks() });
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.activity() });
        },
    });
}

/**
 * Sync a forked question with its parent (pull updates)
 */
export function useSyncFork() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (questionId: string): Promise<void> => {
            const { error } = await supabase
                .rpc('sync_fork', { p_question_id: questionId });

            if (error) throw error;
        },
        onSuccess: () => {
            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.myForks() });
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.activity() });
        },
    });
}

/**
 * Sync all outdated forks at once
 */
export function useSyncAllForks() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (questionIds: string[]): Promise<{ success: string[]; failed: string[] }> => {
            const results = { success: [] as string[], failed: [] as string[] };

            for (const id of questionIds) {
                try {
                    const { error } = await supabase
                        .rpc('sync_fork', { p_question_id: id });

                    if (error) {
                        results.failed.push(id);
                    } else {
                        results.success.push(id);
                    }
                } catch {
                    results.failed.push(id);
                }
            }

            return results;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.myForks() });
            queryClient.invalidateQueries({ queryKey: syncQueryKeys.activity() });
        },
    });
}
