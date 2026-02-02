import React, { useMemo, useState, useEffect, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../app/state/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useActiveView } from '../app/hooks/useActiveView';
import { useInView } from 'react-intersection-observer';
import { v2Api } from '../app/api/views';

import {
    ArrowUpDown,
    Activity, RefreshCw, Edit3, Trash2, CheckCircle2, Layers, Search, Clock, X, Calendar, Archive
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { questionKeys } from '../queries/keys';
import { useQuestionBankFetch } from '../hooks/useQuestionBankFetch';
import { useQuestionBankParams } from '../hooks/useQuestionBankParams';
import { QuestionInspector } from '../components/questions/QuestionInspector';
import type { InspectorMode, InspectorQuestion } from '../components/questions/QuestionInspector';
import { MarkdownRenderer, prefetchContent } from '../components/LatexRenderer';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { DeleteConfirmModal } from './manage/DeleteConfirmModal';
import { GlassSelect } from '../components/ui/GlassSelect';
import { ActiveFiltersBar } from '../components/ui/ActiveFiltersBar';
import { type FilterChipType } from '../components/ui/FilterChip';
import { cn } from '../app/utils/cn';
import { DifficultyBadge } from '../components/ui/DifficultyBadge';
import { EntityBadge } from '../components/ui/EntityBadge';
import { usePrefersReducedMotion } from '../app/hooks/usePrefersReducedMotion';

/** 
 * QuestionBank — Premium Knowledge Repository
 * V4.0 Clean Data Layer Architecture
 */

// --- Types ---
type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionType = 'choice' | 'fill_blank' | 'short_answer';

interface AugmentedQuestion {
    id: string;
    title: string;
    content: string;
    contentPreview: string;
    explanation?: string | null;
    correct_answer?: any;
    hints?: any;
    metadata?: any;
    wrong_answer?: string | null;
    question_type: QuestionType;
    difficulty: Difficulty;
    subject_id?: string;
    subject_name?: string;
    subject_color?: string;
    tags: { id?: string; name: string; color?: string }[];
    // FSRS Meta (optional fields from backend/augmentation)
    state?: number;
    due?: string;
    review_count?: number;
    mastery?: number;
    stability?: number;
    _isOverdue?: boolean;
    _isDueToday?: boolean;
    content_hash?: string;
    last_synced_hash?: string;
    updated_at?: string;
}

// --- Constants & Layers ---
const Z_INDEX = {
    HEADER: 'z-50',
    INSPECTOR: 'z-[200]',
    BATCH_DOCK: 'z-[1000]',
    SIDEBAR: 'z-30'
};

const UI_CONFIG = {
    DEBOUNCE_DELAY: 500,
    ANIMATION_STAGGER: 100,
    ANIMATION_LIMIT: 20, // idx % 20 for stagger
    PREFETCH_STAGGER: 150,
    PREFETCH_INITIAL_DELAY: 500
};

// --- Visual Components ---
// DifficultyBadge is now imported from shared components

const normalizeQuestionData = (q: any): Partial<InspectorQuestion> => {
    if (!q) return {};

    let hints = q.hints;
    if (typeof hints === 'string' && hints.startsWith('{')) {
        try { hints = JSON.parse(hints); } catch (e) { console.error('Failed to parse hints:', e); }
    }

    let correctAnswer = q.correct_answer;
    if (typeof correctAnswer === 'string' && correctAnswer.startsWith('{')) {
        try { correctAnswer = JSON.parse(correctAnswer); } catch (e) { console.error('Failed to parse correct_answer:', e); }
    }

    let metadata = q.metadata;
    if (typeof metadata === 'string' && metadata.startsWith('{')) {
        try { metadata = JSON.parse(metadata); } catch (e) { console.error('Failed to parse metadata:', e); }
    }

    return {
        ...q,
        hints: hints || {},
        correct_answer: correctAnswer || {},
        metadata: metadata || {}
    };
};

const QuestionStateBadge = React.memo<{ q: AugmentedQuestion }>(function QuestionStateBadge({ q }) {
    const { t } = useTranslation();
    const textStyle = "text-[8px] font-black uppercase tracking-widest leading-none";
    const containerStyle = "flex items-center gap-1.5 px-2 py-1 rounded-lg border shadow-sm shrink-0 whitespace-nowrap";

    // Priority: Overdue > Due Today > New
    if (q._isOverdue) {
        const daysOverdue = q.due ? Math.floor((Date.now() - new Date(q.due).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        return (
            <div
                className={cn(containerStyle, "bg-error/10 text-error border-error/20 motion-safe:animate-pulse-subtle")}
                aria-label={t('library.status.overdue_days', { count: daysOverdue })}
            >
                <Clock size={10} strokeWidth={3} aria-hidden="true" />
                <span className={textStyle}>-{daysOverdue}d</span>
            </div>
        );
    }

    if (q._isDueToday) {
        return (
            <div
                className={cn(containerStyle, "bg-warning/10 text-warning border-warning/20")}
                aria-label={t('library.status.due')}
            >
                <Calendar size={10} strokeWidth={3} aria-hidden="true" />
                <span className={textStyle}>{t('library.status.due')}</span>
            </div>
        );
    }

    if (q.state === 0) {
        return (
            <div
                className={cn(containerStyle, "bg-primary/10 text-primary border-primary/20")}
                aria-label={t('library.status.new')}
            >
                <Activity size={10} strokeWidth={3} aria-hidden="true" />
                <span className={textStyle}>{t('library.status.new')}</span>
            </div>
        );
    }

    // Default: Show dynamic metrics - stability or next due
    const stability = q.stability ?? 0;
    const dueDate = q.due ? new Date(q.due) : null;
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    // Show stability if available, otherwise show days until due
    if (stability > 0) {
        return (
            <div className={cn(containerStyle, "bg-success/5 text-success/80 border-success/10")}>
                <span className={cn(textStyle, "opacity-50")}>S:</span>
                <span className={textStyle}>{stability.toFixed(0)}d</span>
            </div>
        );
    }

    if (daysUntilDue !== null && daysUntilDue > 0) {
        return (
            <div className={cn(containerStyle, "bg-base-content/5 text-base-content/50 border-base-content/5")}>
                <Calendar size={10} strokeWidth={2} className="opacity-50" />
                <span className={textStyle}>+{daysUntilDue}d</span>
            </div>
        );
    }

    // Fallback: show review count
    const reviews = q.review_count ?? 0;
    return (
        <div className={cn(containerStyle, "bg-base-content/5 text-base-content/40 border-base-content/5")}>
            <RefreshCw size={9} strokeWidth={2} className="opacity-50" />
            <span className={textStyle}>{reviews}x</span>
        </div>
    );
});


// --- Sub-components ---

const QuestionCard = React.memo(({
    question,
    idx,
    isActive,
    isSelected,
    isFocused,
    isSelectMode,
    isJumping,
    filters,
    handleCardClick,
    handleCardHover,
    setFilters
}: {
    question: AugmentedQuestion;
    idx: number;
    isActive: boolean;
    isSelected: boolean;
    isFocused: boolean;
    isSelectMode: boolean;
    isJumping: boolean;
    filters: any;
    handleCardClick: (id: string, e: React.MouseEvent) => void;
    handleCardHover: (q: AugmentedQuestion) => void;
    setFilters: (f: any) => void;
}) => {
    const { t } = useTranslation();
    return (
        <div
            id={`question-${question.id}`}
            role="option"
            aria-selected={isActive}
            tabIndex={isFocused ? 0 : -1}
            data-question-id={question.id}
            onClick={e => handleCardClick(question.id, e)}
            onMouseEnter={() => handleCardHover(question)}
            style={{ '--idx': idx % UI_CONFIG.ANIMATION_LIMIT } as React.CSSProperties}
            className={cn(
                "q-card p-5 rounded-2xl border transition-all duration-400 cursor-pointer group relative overflow-hidden flex flex-col min-h-[200px] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isActive
                    ? "active bg-primary/[0.03] border-primary/40 shadow-lg ring-1 ring-primary/10 scale-[1.01] z-10"
                    : "bg-base-100 border-base-content/[0.06] hover:bg-base-content/[0.02] hover:border-base-content/[0.12] hover:shadow-md",
                isFocused && "ring-2 ring-primary/60 bg-primary/[0.01]",
                isSelected && "ring-2 ring-primary ring-inset bg-primary/[0.02]",
                isJumping && "is-jumping"
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="flex flex-wrap justify-between items-start gap-2 mb-4 relative z-10">
                <div className="flex flex-wrap items-center gap-2 max-w-[70%]">
                    {isSelectMode && (
                        <div
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={t('library.select_question', { title: question.title })}
                            className={cn(
                                "w-11 h-11 flex items-center justify-center -ml-2 -mt-2", // Increased touch target
                                isSelected ? "bg-primary/10 rounded-full" : ""
                            )}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                isSelected ? "bg-primary border-primary scale-110 shadow-lg shadow-primary/20" : "border-base-content/10 bg-base-content/5"
                            )}>
                                {isSelected && <X size={14} className="text-white" strokeWidth={4} />}
                            </div>
                        </div>
                    )}
                    <DifficultyBadge level={question.difficulty} />
                    <EntityBadge
                        name={question.subject_name || "General"}
                        color={question.subject_color}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (question.subject_id) {
                                setFilters({ subjectId: question.subject_id });
                            }
                        }}
                        className={cn(
                            "max-w-[120px]",
                            filters.subjectId === question.subject_id && "ring-2 ring-primary/40"
                        )}
                        interactive
                    />
                </div>
                <QuestionStateBadge q={question} />
            </div>

            <div className="flex-1 relative z-10 py-3">
                <h4 className="text-[15px] font-black leading-snug tracking-tight text-base-content group-hover:text-primary transition-colors">
                    <MarkdownRenderer content={question.title} density="compact" />
                </h4>
                <div className="mt-2 text-[13px] text-base-content/80 leading-relaxed [&_.katex]:text-[12px]">
                    <MarkdownRenderer content={question.contentPreview} density="compact" />
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-base-content/[0.03] flex flex-wrap gap-1.5 relative z-10">
                {(question.tags || []).slice(0, 4).map((tag: any, i: number) => {
                    const isTagActive = filters.tags.includes(tag.name);
                    return (
                        <EntityBadge
                            key={i}
                            name={tag.name}
                            color={tag.color}
                            showHash
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isTagActive) {
                                    setFilters({ tags: [...filters.tags, tag.name] });
                                }
                            }}
                            className={cn(
                                isTagActive ? "ring-2 ring-primary/40 opacity-100" : "opacity-60"
                            )}
                            interactive
                        />
                    );
                })}
            </div>
        </div>
    );
});


export const QuestionBank: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    useActiveView('v:question_list');
    useActiveView('v:asset'); // Load subjects and tags for sidebar

    const { filters, activeId, setFilters, setActiveId } = useQuestionBankParams();

    // --- Realtime & Revalidation ---
    const queryClient = useQueryClient();
    const isQuestionListStale = useAppStore(s => !!s.stale['v:question_list']);

    // Listen for stale signals (from Realtime or other views)
    useEffect(() => {
        if (isQuestionListStale) {
            console.log('[QuestionBank] Question list is stale, invalidating queries...');
            queryClient.invalidateQueries({ queryKey: questionKeys.all });
            // The scheduler will eventually clear the stale flag after it finishes its own background fetch.
            // By invalidating here, we ensure the UI reflected the "new" truth immediately.
        }
    }, [isQuestionListStale, queryClient]);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useQuestionBankFetch({
        q: filters.q,
        archived: filters.status === 'archived' ? 'true' : 'false',
        sort: filters.sort as any,
    });

    // --- Search & Filtering State ---
    const [localSearch, setLocalSearch] = useState(filters.q);
    // 🚀 PERFORMANCE: Use deferred values to keep UI responsive even during complex filtering.
    const deferredSearch = useDeferredValue(localSearch);
    const deferredSubjectIds = useDeferredValue(filters.subjectIds);
    const deferredTags = useDeferredValue(filters.tags);
    const deferredType = useDeferredValue(filters.type);
    const deferredDifficulty = useDeferredValue(filters.difficulty);

    // --- Data ---
    const rawQuestions: AugmentedQuestion[] = useMemo(() => {
        const pages = data?.pages || [];
        const allItems = pages.flatMap(page => page.items || []);

        // 🚀 DEDUPLICATION: Ensure unique IDs to prevent React key conflicts and state swapping.
        // During infinite scroll, concurrent updates can cause items to appear in multiple "pages".
        const uniqueMap = new Map<string, AugmentedQuestion>();
        allItems.forEach(item => {
            if (item?.id) uniqueMap.set(item.id, item);
        });

        return Array.from(uniqueMap.values());
    }, [data]);

    // 🚀 PREMIUM: Local-First Multi-Filter Engine
    // This provides the legendary "Snappiness" of V1 while supporting V2's scalable backend.
    const questions = useMemo(() => {
        let result = rawQuestions;

        // 1. Local Search Filter
        if (deferredSearch && deferredSearch.length > 0) {
            const search = deferredSearch.toLowerCase();
            result = result.filter(q =>
                q.title.toLowerCase().includes(search) ||
                q.content.toLowerCase().includes(search) ||
                (q.explanation && q.explanation.toLowerCase().includes(search)) ||
                q.subject_name?.toLowerCase().includes(search) ||
                q.tags?.some(t => t.name.toLowerCase().includes(search))
            );
        }

        // 2 & 3. Global Entity Filter (Subject OR Tag - Satisfy ANY)
        const hasSubjectFilters = deferredSubjectIds && deferredSubjectIds.length > 0;
        const hasTagFilters = deferredTags && deferredTags.length > 0;

        if (hasSubjectFilters || hasTagFilters) {
            result = result.filter(q => {
                const matchesSubject = hasSubjectFilters && q.subject_id && deferredSubjectIds.includes(q.subject_id);
                const matchesTag = hasTagFilters && deferredTags.some(targetTag =>
                    q.tags?.some(tag => tag.name === targetTag || tag.id === targetTag)
                );
                return (matchesSubject || matchesTag);
            });
        }

        // 4. Type Filter
        if (deferredType && deferredType !== 'all') {
            result = result.filter(q => q.question_type === deferredType);
        }

        // 5. Difficulty Filter
        if (deferredDifficulty && deferredDifficulty !== 'all') {
            result = result.filter(q => q.difficulty === deferredDifficulty);
        }

        return result;
    }, [rawQuestions, deferredSearch, deferredSubjectIds, deferredTags, deferredType, deferredDifficulty]);


    // Local UI State
    // Consolidated Selection State
    const [selection, setSelection] = useState({
        selectedIds: new Set<string>(),
        isSelectMode: false,
        lastAnchorId: null as string | null,
    });

    // Maintain refs for stable callback access
    const selectionRef = React.useRef(selection);
    useEffect(() => { selectionRef.current = selection; }, [selection]);

    const [inspectorMode, setInspectorMode] = useState<InspectorMode>('preview');
    const [showBulkInspector, setShowBulkInspector] = useState(false);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [isInternalSidebarCollapsed, setIsInternalSidebarCollapsed] = useState(false);
    const [jumpingId, setJumpingId] = useState<string | null>(null);

    const scrollToQuestion = useCallback((id: string, highlight = false) => {
        if (!id) return;
        // Use requestAnimationFrame for smoother timing
        requestAnimationFrame(() => {
            const element = document.querySelector(`[data-question-id="${id}"]`);
            if (element) {
                // Check if element is already largely in view to avoid unnecessary violent jumps
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });

                if (highlight) {
                    setJumpingId(id);
                    // Shorter highlight duration
                    setTimeout(() => setJumpingId(e => e === id ? null : e), 600);
                }
            }
        });
    }, []);

    // --- Sidebar-Inspector Auto Sync ---
    const isShowingInspector = !!activeId || showBulkInspector;
    // Sync sidebar state directly to derived value for instant layout feedback
    const isSidebarCollapsed = isInternalSidebarCollapsed || isShowingInspector;

    // Editor Logic
    const [draft, setDraft] = useState<Partial<InspectorQuestion>>({});
    const [isSaved, setIsSaved] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    // Delete Confirmation Modal State
    const [deleteModalState, setDeleteModalState] = useState<{
        isOpen: boolean;
        mode: 'single' | 'bulk';
        targetId?: string;
    }>({ isOpen: false, mode: 'single' });

    // Context Data - Optimized Selection
    // Step 1: Select raw assets object (stable reference from store)
    const assets = useAppStore(useShallow(s => s.entities.assets));

    // Derive subjects and tags with useMemo (prevents infinite loop)
    // Sort by questionCount DESC for better UX - most used items first
    const subjects = useMemo(
        () => Object.values(assets as Record<string, any>)
            .filter((a: any) => a.type === 'subject')
            .sort((a: any, b: any) => (b.questionCount || 0) - (a.questionCount || 0)) as { id: string; name: string; color?: string; }[],
        [assets]
    );
    const tags = useMemo(
        () => Object.values(assets as Record<string, any>)
            .filter((a: any) => a.type === 'tag')
            .sort((a: any, b: any) => (b.nodeCount || 0) - (a.nodeCount || 0)) as { id: string; name: string; color?: string; }[],
        [assets]
    );

    // Active Question Logic - Removed deferred value for instant response in the inspector
    const activeQuestion = useMemo((): AugmentedQuestion | null =>
        questions.find((question) => question.id === activeId) ?? null,
        [activeId, questions]);

    const prefersReducedMotion = usePrefersReducedMotion();

    // Infinite Scroll Intersection Observer
    const { ref: observerRef, inView } = useInView({ threshold: 0.1 });
    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);


    // Debounce: localSearch → URL (user typing)
    // Increased to 500ms since we have instant local search. 
    // This saves bandwidth/server load while typing rapidly.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== filters.q) {
                setFilters({ q: localSearch });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [localSearch, filters.q, setFilters]);

    // Reverse sync: URL → localSearch (external navigation, e.g., browser back/forward)
    useEffect(() => {
        if (filters.q !== localSearch) {
            setLocalSearch(filters.q);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.q]); // Intentionally omit localSearch to avoid sync loop

    // Update draft when active question changes
    useEffect(() => {
        if (activeQuestion) setDraft(normalizeQuestionData(activeQuestion));
        else setDraft({});
    }, [activeQuestion]);

    // --- Dirty Check ---
    const isDirty = useMemo(() => {
        if (!activeQuestion || !draft.id || draft.id !== activeQuestion.id) return false;

        const normalize = (v: any) => (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));

        // Fields shared between draft (InspectorQuestion) and activeQuestion (AugmentedQuestion)
        const fieldsToCheck = [
            'title', 'content', 'explanation', 'difficulty', 'question_type',
            'correct_answer', 'wrong_answer', 'hints', 'metadata'
        ] as const;
        return fieldsToCheck.some(f => normalize((draft as any)[f]) !== normalize(normalizeQuestionData(activeQuestion)[f]));
    }, [draft, activeQuestion]);


    // Dirty field keys for UnsavedChangesModal (translate at render time)
    const dirtyFieldKeys = useMemo(() => {
        if (!activeQuestion) return [];
        const normalized = normalizeQuestionData(activeQuestion) as any;
        const keys: string[] = [];
        if (draft.title !== normalized.title) keys.push('library.inspector.edit.label_title');
        if (draft.content !== normalized.content) keys.push('library.inspector.edit.label_content');
        if (JSON.stringify(draft.hints) !== JSON.stringify(normalized.hints)) keys.push('library.inspector.edit.hints_title');
        if (JSON.stringify(draft.correct_answer) !== JSON.stringify(normalized.correct_answer)) keys.push('library.inspector.edit.label_correct');
        return keys;
    }, [draft, activeQuestion]);

    // Translate dirty field keys for display
    const dirtyFields = useMemo(() => dirtyFieldKeys.map(key => t(key)), [dirtyFieldKeys, t]);

    // --- Filter Chip Handlers ---
    const handleRemoveFilter = useCallback((type: FilterChipType, value?: string) => {
        switch (type) {
            case 'search':
                setFilters({ q: '' });
                setLocalSearch('');
                break;
            case 'subject':
                if (value) {
                    setFilters({ subjectIds: filters.subjectIds.filter(id => id !== value) });
                } else {
                    setFilters({ subjectIds: [] });
                }
                break;
            case 'difficulty':
                setFilters({ difficulty: 'all' });
                break;
            case 'type':
                setFilters({ type: 'all' });
                break;
            case 'tag':
                if (value) {
                    setFilters({ tags: filters.tags.filter(t => t !== value) });
                }
                break;
        }
    }, [filters.tags, setFilters]);

    const handleClearAllFilters = useCallback(() => {
        setFilters({ q: '', subjectIds: [], difficulty: 'all', type: 'all', tags: [] });
        setLocalSearch('');
    }, [setFilters]);

    // Check if any filters are active
    const hasActiveFilters = !!(
        filters.q ||
        filters.subjectIds.length > 0 ||
        (filters.difficulty && filters.difficulty !== 'all') ||
        (filters.type && filters.type !== 'all') ||
        filters.tags.length > 0
    );

    // --- Handlers ---
    const handleCloseInspector = useCallback(() => {
        const action = () => { setActiveId(null); setShowBulkInspector(false); };
        if (isDirty) { setPendingAction(() => action); setShowUnsavedModal(true); } else action();
    }, [isDirty, setActiveId]);

    const handleCardClick = useCallback((id: string, e?: React.MouseEvent) => {
        const { isSelectMode, selectedIds, lastAnchorId } = selectionRef.current;
        const isShift = e?.shiftKey;
        const isCmd = e?.metaKey || e?.ctrlKey;

        if (isSelectMode || isCmd || isShift) {
            let next = new Set(selectedIds);
            let nextAnchorId = lastAnchorId;

            if (isShift && lastAnchorId) {
                const ids = questions.map(item => item.id);
                const a = ids.indexOf(lastAnchorId);
                const b = ids.indexOf(id);
                if (a >= 0 && b >= 0) {
                    const [s, end] = a < b ? [a, b] : [b, a];
                    ids.slice(s, end + 1).forEach(qid => next.add(qid));
                }
            } else {
                if (next.has(id)) next.delete(id);
                else { next.add(id); nextAnchorId = id; }
            }
            setSelection({
                selectedIds: next,
                isSelectMode: next.size > 0,
                lastAnchorId: nextAnchorId
            });
            return;
        }

        const action = () => {
            setActiveId(id);
            setInspectorMode('preview');
            setFocusedIndex(questions.findIndex(item => item.id === id));
        };
        if (isDirty && activeId !== id) { setPendingAction(() => action); setShowUnsavedModal(true); } else action();
    }, [questions, isDirty, activeId, setActiveId]);

    // 🚀 PREFETCH: Hover handler for pre-rendering content
    const handleCardHover = useCallback((question: AugmentedQuestion) => {
        // Prefetch content on hover for instant inspector opening
        if (question.content) {
            prefetchContent(question.content);
        }
        if (question.explanation) {
            prefetchContent(question.explanation);
        }
    }, []);

    // 🚀 PREFETCH: Pre-render adjacent questions for smooth keyboard navigation
    React.useEffect(() => {
        if (focusedIndex < 0 || !questions.length) return;

        // Prefetch prev/next questions
        const prevQ = questions[focusedIndex - 1];
        const nextQ = questions[focusedIndex + 1];

        if (prevQ?.content) prefetchContent(prevQ.content);
        if (nextQ?.content) prefetchContent(nextQ.content);
    }, [focusedIndex, questions]);

    // 🚀 PREFETCH: Proactively pre-render visible questions' full content
    // This ensures cache is warm before user clicks (not just hover)
    const prefetchedIdsRef = React.useRef(new Set<string>());
    React.useEffect(() => {
        if (!questions.length || isLoading) return;

        // Prefetch first 5 visible questions immediately
        const toPrefetch = questions.slice(0, 5).filter(q => !prefetchedIdsRef.current.has(q.id));

        if (toPrefetch.length > 0) {
            // Stagger prefetch to avoid blocking
            toPrefetch.forEach((q, idx) => {
                setTimeout(() => {
                    if (q.content) {
                        prefetchContent(q.content);
                        prefetchedIdsRef.current.add(q.id);
                    }
                }, idx * UI_CONFIG.ANIMATION_STAGGER); // 100ms stagger
            });
        }
    }, [questions, isLoading]);

    // 🚀 PREFETCH: When new page loads, prefetch those questions too
    React.useEffect(() => {
        if (!data?.pages) return;

        const latestPage = data.pages[data.pages.length - 1];
        if (!latestPage?.items) return;

        // Prefetch new page items with delay to not block UI
        const newItems = latestPage.items.filter((q: AugmentedQuestion) => !prefetchedIdsRef.current.has(q.id));

        newItems.slice(0, 3).forEach((q: AugmentedQuestion, idx: number) => {
            setTimeout(() => {
                if (q.content) {
                    prefetchContent(q.content);
                    prefetchedIdsRef.current.add(q.id);
                }
            }, UI_CONFIG.PREFETCH_INITIAL_DELAY + idx * UI_CONFIG.PREFETCH_STAGGER); // Start after 500ms, stagger 150ms
        });
    }, [data?.pages]);


    const handleSave = async () => {
        if (!activeId || !draft) return;
        try {
            const result = await v2Api.updateQuestion(activeId, draft as any);
            if (result.question) {
                // Update global store and trigger immediate revalidation
                useAppStore.getState().markStale('v:question_list', 'update', 10);

                // Directly invalidate TanStack Query for immediate UI feedback
                // Note: queryClient is defined via useQueryClient() at the top of the component
                queryClient.invalidateQueries({ queryKey: questionKeys.all });

                setIsSaved(true);
                setTimeout(() => { setIsSaved(false); setInspectorMode('preview'); }, 800);
            }
        } catch (err: any) {
            console.error('Save failed:', err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: err.message || t('library.errors.save_failed'),
            });
        }
    };

    // Opens delete confirmation modal for single question
    const handleDeleteRequest = (id?: string) => {
        const targetId = id || activeId;
        if (!targetId) return;
        setDeleteModalState({ isOpen: true, mode: 'single', targetId });
    };

    // Executes single delete after modal confirmation
    const handleDeleteConfirm = async () => {
        const targetId = deleteModalState.targetId;
        if (!targetId) return;
        try {
            await v2Api.deleteQuestion(targetId);
            if (targetId === activeId) handleCloseInspector();
            useAppStore.getState().markStale('v:question_list', 'delete', 10);
            queryClient.invalidateQueries({ queryKey: questionKeys.all });
        } catch (err: any) {
            console.error('Delete failed:', err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: err.message || t('library.errors.delete_failed'),
            });
        }
    };

    // Opens delete confirmation modal for bulk delete
    const handleBulkDeleteRequest = () => {
        if (selection.selectedIds.size === 0) return;
        setDeleteModalState({ isOpen: true, mode: 'bulk' });
    };

    // Executes bulk delete after modal confirmation
    const handleBulkDeleteConfirm = async () => {
        setIsBulkUpdating(true);
        try {
            await v2Api.bulkDeleteQuestions([...selection.selectedIds]);
            const count = selection.selectedIds.size;
            setSelection(s => ({ ...s, selectedIds: new Set(), isSelectMode: false }));
            useAppStore.getState().markStale('v:question_list', 'bulk_delete', 10);
            queryClient.invalidateQueries({ queryKey: questionKeys.all });
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'success',
                message: t('library.bulk.delete_success', { count }),
            });
        } catch (err: any) {
            console.error('Bulk delete failed:', err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: err.message || t('library.errors.bulk_delete_failed'),
            });
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const handleBulkUpdate = async (update: any) => {
        if (selection.selectedIds.size === 0) return;
        setIsBulkUpdating(true);
        try {
            await v2Api.bulkUpdateQuestions([...selection.selectedIds], update);
            const count = selection.selectedIds.size;
            setSelection(s => ({ ...s, selectedIds: new Set(), isSelectMode: false }));
            useAppStore.getState().markStale('v:question_list', 'bulk_update', 10);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'success',
                message: t('library.bulk.update_success', { count }),
            });
        } catch (err: any) {
            console.error('Bulk update failed:', err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: err.message || t('library.errors.bulk_update_failed'),
            });
        } finally {
            setIsBulkUpdating(false);
        }
    };


    // --- Center Active Question ---
    const lastScrolledId = React.useRef<string | null>(null);
    const isFirstOpen = React.useRef(true); // Track if this is the first time opening inspector
    useEffect(() => {
        if (isShowingInspector && activeId && activeId !== lastScrolledId.current) {
            lastScrolledId.current = activeId;
            // Only highlight (pulse animation) on first open, not on subsequent switches
            // This prevents duplicate animations (active state + jump pulse)
            const shouldHighlight = isFirstOpen.current;
            isFirstOpen.current = false;
            scrollToQuestion(activeId, shouldHighlight);
        } else if (!isShowingInspector) {
            lastScrolledId.current = null;
            isFirstOpen.current = true; // Reset for next inspector open
        }
    }, [activeId, isShowingInspector, questions.length, isLoading, scrollToQuestion]);

    // keyboard nav
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            // Priority: Check if the user is typing in any form of input
            const isEditable = e.target instanceof HTMLInputElement
                || e.target instanceof HTMLTextAreaElement
                || (e.target as HTMLElement).isContentEditable;

            if (isEditable) {
                // Allow Escape to escape focus
                if (e.key === 'Escape') (e.target as HTMLElement).blur();
                return;
            }

            if (e.key === 'j' || e.key === 'ArrowDown') {
                const nextIdx = Math.min(focusedIndex + 1, questions.length - 1);
                setFocusedIndex(nextIdx);
                const targetQuestion = questions[nextIdx];
                if (isShowingInspector && targetQuestion) handleCardClick(targetQuestion.id);
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                const nextIdx = Math.max(focusedIndex - 1, 0);
                setFocusedIndex(nextIdx);
                const targetQuestion = questions[nextIdx];
                if (isShowingInspector && targetQuestion) handleCardClick(targetQuestion.id);
            } else if (e.key === 'Escape') {
                if (selection.isSelectMode) { setSelection(s => ({ ...s, selectedIds: new Set(), isSelectMode: false })); }
                else handleCloseInspector();
            }

        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [focusedIndex, questions, isShowingInspector, selection.isSelectMode, handleCardClick, handleCloseInspector]);

    return (
        <div className="sea library-layout h-full w-full relative flex bg-base-100 isolate overflow-clip" data-inspector-open={isShowingInspector}>
            {/* Sidebar (Left) */}
            <aside
                className={cn(
                    "hidden lg:flex flex-col bg-base-content/[0.02] border-r border-base-content/5 transition-all duration-400 ease-emphasized overflow-hidden shrink-0",
                    Z_INDEX.SIDEBAR,
                    isSidebarCollapsed ? "w-0 opacity-0" : "w-72 opacity-100"
                )}
            >
                <div className="p-5 flex flex-col gap-6 h-full min-w-[288px]">
                    {/* Subjects Section */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-4 rounded-full bg-primary" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-base-content/40">{t('common.subjects')}</h3>
                            </div>
                            <span className="text-[9px] font-bold text-base-content/20 tabular-nums">
                                {subjects.length}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar max-h-[45vh]">
                            {/* All Subjects Button */}
                            <button
                                type="button"
                                onClick={() => setFilters({ q: '', subjectIds: [] })}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 group",
                                    (!filters.q && filters.subjectIds.length === 0)
                                        ? "bg-primary/10 border border-primary/20 shadow-sm shadow-primary/5"
                                        : "hover:bg-base-content/[0.04] border border-transparent"
                                )}
                            >
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300",
                                    (!filters.q && filters.subjectIds.length === 0)
                                        ? "bg-primary text-white shadow-md shadow-primary/30"
                                        : "bg-base-content/[0.06] text-base-content/40 group-hover:bg-base-content/10 group-hover:text-base-content/60"
                                )}>
                                    <Layers size={16} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 text-left">
                                    <span className={cn(
                                        "text-[11px] font-black uppercase tracking-wide transition-colors",
                                        (!filters.q && filters.subjectIds.length === 0) ? "text-primary" : "text-base-content/70 group-hover:text-base-content"
                                    )}>
                                        {t('library.filters.all_subjects')}
                                    </span>
                                </div>
                                <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded-lg tabular-nums transition-all",
                                    (!filters.q && filters.subjectIds.length === 0)
                                        ? "bg-primary/20 text-primary"
                                        : "bg-base-content/[0.05] text-base-content/30"
                                )}>
                                    {subjects.reduce((sum: number, s: any) => sum + (s.questionCount || 0), 0) || '—'}
                                </span>
                            </button>

                            {/* Subject List */}
                            {subjects.map((s: any) => {
                                const count = s.questionCount || 0;
                                const isSelected = filters.subjectIds.includes(s.id);
                                const isZeroCount = count === 0;

                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                            const next = isSelected
                                                ? filters.subjectIds.filter(id => id !== s.id)
                                                : [...filters.subjectIds, s.id];
                                            setFilters({ subjectIds: next, q: '' });
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 h-11 rounded-xl transition-all duration-300 group relative overflow-hidden",
                                            isSelected
                                                ? "bg-base-content/[0.08] shadow-sm"
                                                : "hover:bg-base-content/[0.04]",
                                            isZeroCount && !isSelected && "opacity-40 hover:opacity-70"
                                        )}
                                        aria-label={t('library.filters.subject_select', { name: s.name })}
                                        aria-pressed={isSelected}
                                    >
                                        {/* Left Color Bar */}
                                        <div
                                            className={cn(
                                                "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full transition-all duration-300",
                                                isSelected ? "h-6" : "h-0 group-hover:h-4"
                                            )}
                                            style={{ backgroundColor: s.color || '#888' }}
                                        />

                                        {/* Color Circle */}
                                        <div
                                            className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0",
                                                isSelected
                                                    ? "shadow-md"
                                                    : "opacity-80 group-hover:opacity-100 group-hover:scale-105"
                                            )}
                                            style={{
                                                backgroundColor: `${s.color || '#888'}20`,
                                                border: `1px solid ${s.color || '#888'}30`
                                            }}
                                        >
                                            <div
                                                className={cn(
                                                    "w-3.5 h-3.5 rounded-full transition-all duration-300",
                                                    isSelected && "scale-110"
                                                )}
                                                style={{
                                                    backgroundColor: s.color || '#888',
                                                    boxShadow: isSelected ? `0 2px 8px ${s.color || '#888'}50` : 'none'
                                                }}
                                            />
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 text-left min-w-0">
                                            <span className={cn(
                                                "text-[11px] font-bold truncate block transition-colors",
                                                isSelected
                                                    ? "text-base-content"
                                                    : "text-base-content/60 group-hover:text-base-content/90"
                                            )}>
                                                {s.name}
                                            </span>
                                        </div>

                                        {/* Count Badge */}
                                        <span
                                            className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums transition-all shrink-0",
                                                isSelected
                                                    ? "text-white"
                                                    : count > 0
                                                        ? "bg-base-content/[0.06] text-base-content/50"
                                                        : "text-base-content/20"
                                            )}
                                            style={isSelected ? {
                                                backgroundColor: s.color || '#888',
                                                boxShadow: `0 1px 4px ${s.color || '#888'}40`
                                            } : undefined}
                                        >
                                            {count > 0 ? count : '—'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-gradient-to-r from-transparent via-base-content/10 to-transparent" />

                    {/* Tags Section */}
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-4 rounded-full bg-secondary" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-base-content/40">{t('common.tags')}</h3>
                            </div>
                            <span className="text-[9px] font-bold text-base-content/20 tabular-nums">
                                {tags.length}
                            </span>
                        </div>

                        {tags.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-base-content/20 uppercase tracking-wider">
                                    {t('library.filters.no_tags')}
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5 overflow-y-auto custom-scrollbar flex-1 content-start p-1">
                                {tags.map((tag: any) => {
                                    const isSelected = filters.tags.includes(tag.name);
                                    const count = tag.nodeCount || 0;

                                    return (
                                        <EntityBadge
                                            key={tag.id}
                                            name={tag.name}
                                            color={tag.color}
                                            showHash
                                            interactive
                                            onClick={() => {
                                                const nextTags = isSelected
                                                    ? filters.tags.filter(t => t !== tag.name)
                                                    : [...filters.tags, tag.name];
                                                setFilters({ tags: nextTags });
                                            }}
                                            className={cn(
                                                "transition-all duration-300",
                                                isSelected ? "ring-2 ring-primary/40 shadow-sm" : "opacity-60 hover:opacity-100",
                                                count === 0 && !isSelected && "opacity-30"
                                            )}
                                        >
                                            {count > 0 && (
                                                <span className={cn(
                                                    "text-[8px] font-bold px-1.5 py-0.5 rounded-md tabular-nums transition-colors ml-1",
                                                    isSelected
                                                        ? "bg-white/20 text-inherit"
                                                        : "bg-base-content/[0.06] text-base-content/40"
                                                )}>
                                                    {count}
                                                </span>
                                            )}
                                        </EntityBadge>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Pane (Question List) */}
            <div className="library-pane flex flex-col flex-1 min-w-0 h-full relative z-10 transition-all duration-400 ease-emphasized">
                {/* Header */}
                <header className={cn("se-glass-nav shrink-0 sticky top-0 flex items-center justify-between gap-4 px-6 lg:px-10 h-16 border-b border-base-content/[0.05]", Z_INDEX.HEADER)}>
                    <div className="flex items-center gap-4 flex-1">
                        <button
                            onClick={() => setIsInternalSidebarCollapsed(!isInternalSidebarCollapsed)}
                            className="hidden lg:flex p-2 rounded-xl bg-base-content/5 border border-base-content/5 hover:bg-base-content/10 transition-colors"
                        >
                            <Layers size={14} className={cn("transition-transform duration-300", isSidebarCollapsed ? "rotate-90" : "rotate-0")} />
                        </button>

                        <div className="relative group flex-1 max-w-md h-11">
                            <Search className="absolute left-3.5 top-3.5 opacity-20 group-focus-within:opacity-100 group-focus-within:text-primary transition-all" size={14} />
                            <input
                                placeholder={t('library.search_placeholder')}
                                value={localSearch}
                                onChange={e => setLocalSearch(e.target.value)}
                                aria-label={t('library.search_placeholder')}
                                className="w-full h-full pl-10 pr-4 bg-base-content/[0.02] border border-base-content/[0.05] rounded-xl text-[11px] font-bold focus:bg-base-content/[0.05] focus:border-primary/30 focus:ring-4 focus:ring-primary/5 outline-none transition-all placeholder:opacity-30"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelection(s => ({ ...s, isSelectMode: !s.isSelectMode }))}
                                aria-label={selection.isSelectMode ? t('library.toolbar.exit_select') : t('library.toolbar.select_mode')}
                                className={cn(
                                    "h-11 px-4 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 border",
                                    selection.isSelectMode
                                        ? "bg-primary text-white border-primary shadow-[0_10px_20px_-5px_rgba(var(--color-primary-rgb),0.3)]"
                                        : "bg-base-content/[0.02] border-base-content/[0.05] opacity-60 hover:opacity-100 hover:bg-base-content/[0.05]"
                                )}
                            >
                                <CheckCircle2 size={14} strokeWidth={selection.isSelectMode ? 3 : 2} />
                                <span className="hidden sm:inline">{selection.isSelectMode ? t('library.toolbar.exit_select') : t('library.toolbar.select_mode')}</span>
                            </button>

                            <GlassSelect
                                value={filters.sort}
                                onChange={v => setFilters({ sort: v as any })}
                                size="sm"
                                icon={<ArrowUpDown size={14} />}
                                options={[
                                    { value: 'default', label: t('library.sort.smart') },
                                    { value: 'due_asc', label: t('library.sort.due_soonest') },
                                    { value: 'mastery_asc', label: t('library.sort.lowest_mastery') },
                                ]}
                            />
                        </div>
                    </div>
                </header>

                {/* Active Filters Bar */}
                <AnimatePresence>
                    {hasActiveFilters && (
                        <ActiveFiltersBar
                            filters={filters}
                            subjects={subjects as any}
                            tags={tags as any}
                            onRemoveFilter={handleRemoveFilter}
                            onClearAll={handleClearAllFilters}
                        />
                    )}
                </AnimatePresence>


                {/* List Container */}
                <div className="flex-1 min-h-0 bg-base-100 overflow-y-auto custom-scrollbar p-6">
                    {isLoading ? (
                        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                            {[...Array(9)].map((_, i) => (
                                <div
                                    key={i}
                                    style={{ animationDelay: `${i * UI_CONFIG.ANIMATION_STAGGER}ms` }}
                                    className="h-52 bg-base-content/[0.03] border border-base-content/[0.05] rounded-2xl motion-safe:animate-pulse shadow-sm"
                                />
                            ))}
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-6 py-20">
                            <div className="flex flex-col items-center opacity-30">
                                <Layers size={64} className="mb-4" />
                                <p className="font-black uppercase tracking-widest">{t('library.grid.empty')}</p>
                            </div>
                            {!filters.q && filters.subjectIds.length === 0 && filters.tags.length === 0 && (
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => navigate('/manage/import')}
                                        className="h-11 px-6 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-wider hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
                                    >
                                        <Layers size={14} /> {t('library.empty_cta_import', 'Import Questions')}
                                    </button>
                                    <button
                                        onClick={() => { setActiveId('new'); setInspectorMode('edit'); setDraft({}); }}
                                        className="h-11 px-6 rounded-xl bg-base-content/5 text-base-content font-black text-[10px] uppercase tracking-wider border border-base-content/5 hover:bg-base-content/10 transition-all flex items-center gap-2"
                                    >
                                        <Edit3 size={14} /> {t('library.empty_cta_create', 'Create Manually')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div
                            role="listbox"
                            aria-label={t('library.question_list')}
                            aria-activedescendant={activeId ? `question-${activeId}` : undefined}
                            className={cn(
                                "grid gap-6 transition-none", // Remove transition from container to prevent layout wobble
                                isShowingInspector ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                            )}
                        >
                            {questions.map((question, idx) => (
                                <QuestionCard
                                    key={question.id}
                                    question={question}
                                    idx={idx}
                                    isActive={activeId === question.id}
                                    isSelected={selection.selectedIds.has(question.id)}
                                    isFocused={focusedIndex === idx}
                                    isSelectMode={selection.isSelectMode}
                                    isJumping={jumpingId === question.id}
                                    filters={filters}
                                    handleCardClick={handleCardClick}
                                    handleCardHover={handleCardHover}
                                    setFilters={setFilters}
                                />
                            ))}
                        </div>
                    )}
                    <div ref={observerRef} className="h-20 flex items-center justify-center min-h-[5rem]">
                        {isFetchingNextPage && <RefreshCw className="motion-safe:animate-spin opacity-20" />}
                    </div>

                </div>
            </div>

            {/* Inspector (Primary Content Area) */}
            <div
                className={cn(
                    "fixed lg:relative inset-0 lg:inset-auto lg:z-10 transition-all duration-400 ease-emphasized h-full overflow-hidden flex flex-col bg-base-100 lg:bg-transparent shrink-0",
                    isShowingInspector
                        ? ["translate-x-0 opacity-100 w-full lg:w-[640px] xl:w-[840px] border-l border-base-content/[0.08] lg:shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.15)]", Z_INDEX.INSPECTOR]
                        : "translate-x-full opacity-0 lg:translate-x-0 lg:w-0 lg:border-none pointer-events-none"
                )}
            >
                <div className="h-full w-full lg:p-4 min-w-[320px] lg:min-w-[640px] xl:min-w-[840px]">
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                            key={showBulkInspector ? 'bulk' : 'single'}
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
                            transition={{
                                duration: 0.25,
                                ease: [0.2, 0.8, 0.2, 1]
                            }}
                            className="h-full w-full"
                        >
                            <QuestionInspector
                                width={800}
                                isDragging={false}
                                activeQuestion={activeQuestion as any}
                                isVisible={isShowingInspector}
                                isBulkMode={showBulkInspector}
                                selectedQuestions={rawQuestions.filter(item => selection.selectedIds.has(item.id)) as any}
                                onBulkUpdate={handleBulkUpdate}
                                availableSubjects={subjects}
                                availableTags={tags}
                                mode={inspectorMode}
                                setMode={setInspectorMode}
                                onClose={handleCloseInspector}
                                draft={draft as any}
                                setDraft={setDraft as any}
                                isDirty={isDirty}
                                isSaved={isSaved}
                                onSave={handleSave}
                                onDelete={handleDeleteRequest}
                                onQuickReview={(e, q) => { e.stopPropagation(); navigate(`/review?q=${q.id}`); }}
                                onNavigate={(dir) => {
                                    const nextIdx = dir === 'next'
                                        ? Math.min(focusedIndex + 1, questions.length - 1)
                                        : Math.max(focusedIndex - 1, 0);
                                    setFocusedIndex(nextIdx);
                                    const target = questions[nextIdx];
                                    if (target) handleCardClick(target.id);
                                }}
                                canNavigatePrev={focusedIndex > 0}
                                canNavigateNext={focusedIndex < questions.length - 1}
                                currentIndex={focusedIndex}
                                totalCount={questions.length}
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Batch Dock */}
            {selection.selectedIds.size > 0 && createPortal(
                <div className={cn("fixed bottom-8 left-1/2 -translate-x-1/2 animate-in slide-in-from-bottom-8", Z_INDEX.BATCH_DOCK)}>
                    <div className="se-glass-panel rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl border border-white/10">
                        <div className="flex flex-col border-r border-base-content/10 pr-6">
                            <span className="text-xl font-black text-primary leading-none">{selection.selectedIds.size}</span>
                            <span className="text-[9px] font-bold opacity-40 uppercase">{t('library.bulk.scope')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleBulkUpdate({ is_archived: true })}
                                disabled={isBulkUpdating}
                                aria-label={t('common.archive')}
                                className="h-11 px-4 rounded-xl bg-base-content/5 font-black text-[10px] uppercase hover:bg-base-content/10 transition-all flex items-center gap-2"
                                title={t('common.archive')}
                            >
                                <Archive size={14} className={isBulkUpdating ? "animate-spin" : ""} /> {t('common.archive')}
                            </button>

                            <button onClick={handleBulkDeleteRequest} aria-label={t('common.delete')} disabled={isBulkUpdating} className="h-11 px-4 rounded-xl bg-error/10 text-error font-black text-[10px] uppercase flex items-center gap-2 hover:bg-error hover:text-white transition-all">
                                <Trash2 size={14} /> {t('common.delete')}
                            </button>
                            <button onClick={() => setShowBulkInspector(true)} aria-label={t('library.bulk.edit')} className="h-11 px-4 rounded-xl bg-base-content/5 font-black text-[10px] uppercase hover:bg-base-content/10 transition-all flex items-center gap-2">
                                <Edit3 size={14} /> {t('library.bulk.edit')}
                            </button>
                            <button onClick={() => setSelection(s => ({ ...s, selectedIds: new Set(), isSelectMode: false }))} aria-label={t('common.actions.close')} className="w-11 h-11 rounded-full border border-base-content/10 flex items-center justify-center opacity-50 hover:opacity-100 hover:rotate-90 transition-all">
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <UnsavedChangesModal
                isOpen={showUnsavedModal}
                dirtyFields={dirtyFields}
                onSave={() => { handleSave(); setShowUnsavedModal(false); pendingAction?.(); }}
                onDiscard={() => { setShowUnsavedModal(false); pendingAction?.(); }}
                onCancel={() => { setShowUnsavedModal(false); setPendingAction(null); }}
            />

            <DeleteConfirmModal
                isOpen={deleteModalState.isOpen}
                onClose={() => setDeleteModalState({ isOpen: false, mode: 'single' })}
                onConfirm={deleteModalState.mode === 'bulk' ? handleBulkDeleteConfirm : handleDeleteConfirm}
                itemName={
                    deleteModalState.mode === 'bulk'
                        ? t('library.bulk.items_count', { count: selection.selectedIds.size })
                        : (activeQuestion?.title || t('library.question'))
                }
                itemType="question"
            />
        </div>
    );
};

export default QuestionBank;
