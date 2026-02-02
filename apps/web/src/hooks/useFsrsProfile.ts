/* eslint-disable @typescript-eslint/no-explicit-any */
// NOTE: We use `any` type assertions for RPC/table calls that are not yet in generated database.types.ts
// After regenerating types with `supabase gen types`, these can be removed.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSupabaseAuth } from './useSync';

// ============================================================
// Types - aligned with subject-aware FSRS profile schema
// ============================================================

export interface FsrsProfile {
    profile_id: string | null;
    subject_id: string | null;
    subject_name: string | null;
    subject_color: string | null;
    is_inherited: boolean;
    is_global: boolean;
    name: string | null;
    notes: string | null;
    retention_target: number;
    daily_review_cap: number | null;
    style: 'conservative' | 'balanced' | 'aggressive';
    weights: number[] | null;
    weights_schema_version: string;
    source: 'preset' | 'manual' | 'optimized' | 'imported';
    preset_id: string | null;
    is_optimized: boolean;
    optimization_confidence: number | null;
    last_optimized_at: string | null;
    version: number;
    has_custom_profile: boolean;
    question_count?: number;
    updated_at?: string;
}

export interface FsrsPreset {
    id: string;
    name: string;
    description: string | null;
    retention_target: number;
    style: 'conservative' | 'balanced' | 'aggressive';
    weights: number[];
    weights_schema_version: string;
    recommended_for: string[] | null;
    display_order: number;
}

export interface UpdateFsrsProfileParams {
    subject_id?: string | null;
    name?: string;
    notes?: string;
    retention_target?: number;
    daily_review_cap?: number | null;
    style?: 'conservative' | 'balanced' | 'aggressive';
    weights?: number[];
    preset_id?: string;
}

// Style to preset_id mapping (for legacy UI compatibility)
const STYLE_TO_PRESET: Record<string, string> = {
    conservative: 'conservative',
    balanced: 'balanced',
    aggressive: 'aggressive',
};

export function useFsrsProfile(subjectId?: string | null) {
    const queryClient = useQueryClient();
    const { userId, isAuthenticated } = useSupabaseAuth();

    // Fetch active profile using RPC (subject-specific or global fallback)
    const {
        data: profile,
        isLoading,
        error,
        refetch: refetchProfile,
    } = useQuery({
        queryKey: ['fsrs-profile', subjectId ?? 'global'],
        queryFn: async (): Promise<FsrsProfile | null> => {
            if (!isAuthenticated || !userId) return null;

            // Call RPC with subject_id parameter
            const { data, error } = await (supabase.rpc as any)('get_user_fsrs_profile', {
                p_subject_id: subjectId || null
            });

            if (error) {
                console.error('[useFsrsProfile] RPC error:', error);
                throw error;
            }

            // The RPC returns a single row or a table
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return null;

            // Map database row to interface
            const style = row.style as 'conservative' | 'balanced' | 'aggressive';
            return {
                profile_id: row.profile_id || null,
                subject_id: row.subject_id || null,
                subject_name: row.subject_name || null,
                subject_color: row.subject_color || null,
                is_inherited: row.is_inherited ?? false,
                is_global: !row.subject_id,
                name: row.name || null,
                notes: row.notes || null,
                retention_target: row.retention_target,
                daily_review_cap: row.daily_review_cap,
                style,
                weights: row.weights,
                weights_schema_version: row.weights_schema_version || 'fsrs_v5',
                source: row.source,
                preset_id: row.preset_id || STYLE_TO_PRESET[style] || 'balanced',
                is_optimized: row.is_optimized ?? false,
                optimization_confidence: row.optimization_confidence ?? null,
                last_optimized_at: row.last_optimized_at || null,
                version: row.version ?? 1,
                has_custom_profile: row.has_custom_profile ?? (row.source !== 'preset'),
            };
        },
        enabled: isAuthenticated,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    // List all profiles for the user (global + subject overrides)
    const {
        data: profileList,
        isLoading: isListLoading,
        refetch: refetchList,
    } = useQuery({
        queryKey: ['fsrs-profiles-list'],
        queryFn: async (): Promise<FsrsProfile[]> => {
            if (!isAuthenticated || !userId) return [];

            const { data, error } = await (supabase.rpc as any)('list_user_fsrs_profiles');

            if (error) {
                console.error('[useFsrsProfile] List RPC error:', error);
                throw error;
            }

            return (data ?? []).map((row: any) => ({
                profile_id: row.profile_id || null,
                subject_id: row.subject_id || null,
                subject_name: row.subject_name || null,
                subject_color: row.subject_color || null,
                is_inherited: false,
                is_global: row.is_global ?? !row.subject_id,
                name: row.name || null,
                notes: null,
                retention_target: row.retention_target,
                daily_review_cap: row.daily_review_cap,
                style: row.style as 'conservative' | 'balanced' | 'aggressive',
                weights: null, // Omitted for list view
                weights_schema_version: 'fsrs_v5',
                source: row.source,
                preset_id: row.preset_id || null,
                is_optimized: row.is_optimized ?? false,
                optimization_confidence: null,
                last_optimized_at: null,
                version: row.version ?? 1,
                has_custom_profile: true,
                question_count: row.question_count ?? 0,
                updated_at: row.updated_at || null,
            }));
        },
        enabled: isAuthenticated,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    // Update profile using RPC
    const updateMutation = useMutation({
        mutationFn: async (params: UpdateFsrsProfileParams) => {
            const { data, error } = await (supabase.rpc as any)('update_user_fsrs_profile', {
                p_subject_id: params.subject_id || null,
                p_retention_target: params.retention_target,
                p_daily_review_cap: params.daily_review_cap,
                p_style: params.style,
                p_weights: params.weights ? params.weights : null,
                p_preset_id: params.preset_id,
                p_name: params.name,
                p_notes: params.notes,
            });

            if (error) {
                console.error('[useFsrsProfile] Update error:', error);
                throw error;
            }

            return data;
        },
        onSuccess: (_data, variables) => {
            // Invalidate specific profile and list
            queryClient.invalidateQueries({ queryKey: ['fsrs-profile', variables.subject_id ?? 'global'] });
            queryClient.invalidateQueries({ queryKey: ['fsrs-profiles-list'] });
            // Also invalidate global if we updated a subject (inheritance chain)
            if (variables.subject_id) {
                queryClient.invalidateQueries({ queryKey: ['fsrs-profile', 'global'] });
            }
        },
    });

    // Delete subject profile (reset to global inheritance)
    const deleteMutation = useMutation({
        mutationFn: async (deleteSubjectId: string) => {
            const { data, error } = await (supabase.rpc as any)('delete_subject_fsrs_profile', {
                p_subject_id: deleteSubjectId
            });

            if (error) {
                console.error('[useFsrsProfile] Delete error:', error);
                throw error;
            }

            return data;
        },
        onSuccess: (_data, deleteSubjectId) => {
            queryClient.invalidateQueries({ queryKey: ['fsrs-profile', deleteSubjectId] });
            queryClient.invalidateQueries({ queryKey: ['fsrs-profiles-list'] });
        },
    });

    // Fetch presets
    const { data: presets } = useQuery({
        queryKey: ['fsrs-presets'],
        queryFn: async (): Promise<FsrsPreset[]> => {
            const { data, error } = await (supabase.from as any)('fsrs_presets')
                .select('*')
                .order('display_order', { ascending: true });

            if (error) {
                console.error('[useFsrsProfile] Presets fetch error:', error);
                throw error;
            }

            return (data ?? []).map((row: any) => ({
                id: row.id,
                name: row.name,
                description: row.description,
                retention_target: row.retention_target,
                style: row.style,
                weights: row.weights,
                weights_schema_version: row.weights_schema_version,
                recommended_for: row.recommended_for,
                display_order: row.display_order ?? 0,
            }));
        },
        staleTime: 1000 * 60 * 30, // 30 minutes (system data rarely changes)
    });

    return {
        // Single profile (subject-aware)
        profile,
        isLoading,
        error,
        refetchProfile,

        // Profile list (global + subject overrides)
        profileList,
        isListLoading,
        refetchList,

        // Presets
        presets,

        // Mutations
        updateProfile: updateMutation.mutate,
        updateProfileAsync: updateMutation.mutateAsync,
        isUpdating: updateMutation.isPending,
        updateError: updateMutation.error,

        deleteSubjectProfile: deleteMutation.mutate,
        deleteSubjectProfileAsync: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
    };
}
