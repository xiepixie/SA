/* eslint-disable react-hooks/refs */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useActiveView } from '../app/hooks/useActiveView';
import { useAppStore } from '../app/state/useAppStore';
import { v2Api } from '../app/api/views';
import {
    CheckCircle2, Brain, ArrowLeft,
    Layers, Target, Zap, AlertTriangle,
    RotateCcw, Award, Flame,
    Hash, Clock, BookOpen, Search,
    Pin, PinOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QuestionRenderer } from '../components/review/QuestionRenderer';
import { ReviewStrategyPanel } from '../components/review/ReviewStrategyPanel';
import { sortCards } from '../app/utils/reviewSortUtils';
import type { ReviewSortMode } from '../app/utils/reviewSortUtils';
import { ReviewSkeleton } from '../components/layout/PageSkeletons';
import { cn } from '../app/utils/cn';
import { MarkdownRenderer } from '../components/LatexRenderer';
import { NotesPanel } from '../features/notes/components/NotesPanel';
import { FloatingNotes } from '../features/notes/components/FloatingNotes';
import { useReviewWizard } from '../features/review/hooks/useReviewWizard';
import { useReviewMutations } from '../features/review/hooks/useReviewMutations';
import { DeleteConfirmModal } from './manage/DeleteConfirmModal';
import { usePrefersReducedMotion } from '../app/hooks/usePrefersReducedMotion';

// --- Types & Constants ---
type Rating = 1 | 2 | 3 | 4;

interface SessionStats {
    ratings: Record<Rating, number>;
    totalTime: number;
    streak: number;
    maxStreak: number;
}



// Format exact due date for display - shows precise FSRS calculation results
// Returns a display function that uses i18n
const createFormatDueDate = (t: (key: string, options?: Record<string, any>) => string) => (date: Date): string => {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    // Within 1 hour: show minutes (e.g., "10分钟")
    if (diffMinutes < 60) {
        const count = Math.max(1, Math.round(diffMinutes));
        return t('review.interval.minutes', { count });
    }

    // Within 24 hours: show hours (e.g., "6小时")
    const diffHours = diffMinutes / 60;
    if (diffHours < 24) {
        const hours = Math.round(diffHours);
        return t('review.interval.hours', { count: hours });
    }

    // Calculate days difference
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Tomorrow
    if (diffDays === 1) {
        return t('review.interval.tomorrow', { month, day });
    }

    // Day after tomorrow
    if (diffDays === 2) {
        return t('review.interval.day_after_tomorrow', { month, day });
    }

    // Within a week: show date clearly (e.g., "2月5日")
    if (diffDays <= 7) {
        return t('review.interval.date_short', { month, day, count: diffDays });
    }

    // Beyond a week: show date with days count
    return t('review.interval.date_long', { month, day, count: diffDays });
};

interface IntervalInfo {
    interval: number; // in days
    dueDate: Date;
    display: string;
}

// Default intervals - will be replaced with actual FSRS calculations
const createDefaultIntervals = (t: (key: string, options?: Record<string, any>) => string): Record<string, IntervalInfo> => {
    const now = new Date();
    const formatDueDate = createFormatDueDate(t);
    return {
        again: { interval: 0.007, dueDate: new Date(now.getTime() + 10 * 60 * 1000), display: formatDueDate(new Date(now.getTime() + 10 * 60 * 1000)) },
        hard: { interval: 0.5, dueDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), display: formatDueDate(new Date(now.getTime() + 12 * 60 * 60 * 1000)) },
        good: { interval: 1, dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), display: formatDueDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)) },
        easy: { interval: 4, dueDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000), display: formatDueDate(new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)) }
    };
};

const SIDEBAR_CONSTRAINTS = {
    queue: { min: 240, max: 480 },
    notes: { min: 320, max: 640 }
};

const UI_CONFIG = {
    TRANSITION_DURATION: 'duration-300',
    TRANSITION_EASE: 'ease-out-expo',
    ANIMATION_STAGGER: 100
};

interface QuestionMeta {
    id: string; title: string; content: string; question_type: 'choice' | 'fill_blank' | 'short_answer';
    difficulty: 'easy' | 'medium' | 'hard'; subject_name?: string; subject_color?: string;
    tag_names?: string[]; explanation?: string; correct_answer_text?: string;
    correct_answer?: any; hints?: any;
}

interface CardMeta {
    card_id: string; question_id: string; state: number; stability: number; difficulty: number;
    due: string; last_review?: string; created_at?: string;
}

// --- UI Sub-Components ---
const ReviewQueueList: React.FC<{
    cards: CardMeta[];
    questions: Record<string, QuestionMeta>;
    currentIndex: number;
    completedIndices: Set<number>;
    searchQuery: string;
    onSearchChange: (val: string) => void;
    onSelect: (index: number) => void;
    onToggleCollapse?: () => void;
    isCollapsed?: boolean;
    indexMapping?: number[];  // Maps filteredCards index to dueCards index
}> = ({ cards, questions, currentIndex, completedIndices, searchQuery, onSearchChange, onSelect, onToggleCollapse, isCollapsed = false, indexMapping }) => {
    const { t } = useTranslation(['review', 'common']);
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-base-content/5 flex flex-col gap-4 shrink-0 transition-all bg-base-100/50 backdrop-blur-md">
                <div className="flex items-center justify-between group/header">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Layers size={16} />
                        </div>
                        <div>
                            <h3 className="text-[12px] font-black uppercase tracking-wider text-base-content/80 leading-none">
                                {t('review.queue.title', 'Question List')}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-bold text-base-content/40">{cards.length} items</span>
                            </div>
                        </div>
                    </div>

                    {onToggleCollapse && (
                        <button
                            onClick={onToggleCollapse}
                            className="btn btn-ghost btn-xs btn-square opacity-0 group-hover/header:opacity-100 transition-opacity"
                            title={isCollapsed ? t('common:common.actions.pin_sidebar', 'Pin Sidebar') : t('common:common.actions.collapse', 'Unpin Sidebar')}
                        >
                            {isCollapsed ? (
                                <Pin size={16} className="text-base-content/40 hover:text-primary transition-colors" />
                            ) : (
                                <PinOff size={16} className="text-base-content/40 hover:text-primary transition-colors" />
                            )}
                        </button>
                    )}
                </div>

                {!isCollapsed && (
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/20 group-focus-within:text-primary transition-colors" />
                        <input
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder={t('import.preview.search_ph', 'Search...')}
                            className="w-full h-9 bg-base-content/5 border border-base-content/5 rounded-xl pl-9 pr-3 text-[11px] font-bold outline-none focus:bg-base-content/10 focus:border-primary/20 transition-all text-base-content placeholder:opacity-40"
                        />
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {cards.map((card, filteredIdx) => {
                    const question = questions[card.question_id];
                    const originalIdx = indexMapping ? indexMapping[filteredIdx] : filteredIdx;
                    const isCurrent = originalIdx === currentIndex;
                    const isCompleted = completedIndices.has(originalIdx);

                    return (
                        <button
                            key={card.card_id}
                            onClick={() => onSelect(originalIdx)}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 group",
                                isCurrent
                                    ? "bg-primary text-primary-content shadow-premium-md translate-x-1"
                                    : "hover:bg-base-content/5 text-base-content/60"
                            )}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border transition-colors",
                                isCurrent
                                    ? "bg-white/20 border-white/20"
                                    : isCompleted
                                        ? "bg-success/10 border-success/20 text-success"
                                        : "bg-base-content/5 border-base-content/5"
                            )}>
                                {isCompleted ? <CheckCircle2 size={14} /> : originalIdx + 1}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <div className={cn(
                                    "text-xs font-bold truncate",
                                    isCurrent ? "text-primary-content" : "text-base-content/80"
                                )}>
                                    <MarkdownRenderer
                                        content={question?.title || t('common:common.untitled', 'Untitled')}
                                        density="compact"
                                        showTexBadge={false}
                                        className="prose-none"
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={cn(
                                        "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                                        isCurrent ? "bg-white/20 text-primary-content" : "bg-base-content/5 text-base-content/30"
                                    )}>
                                        {question?.question_type ? String(t(`common:common.type.${question.question_type}`)) : 'N/A'}
                                    </span>
                                    {question?.subject_name && (
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: question.subject_color }} />
                                            <span className={cn("text-[8px] font-bold truncate", isCurrent ? "text-primary-content/64" : "text-base-content/30")}>
                                                {question.subject_name}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const SessionStatsPanel: React.FC<{ stats: SessionStats; total: number; current: number }> = ({ stats, total, current }) => {
    const { t } = useTranslation(['review', 'common']);
    const accuracy = stats.ratings[3] + stats.ratings[4];
    const reviewed = Object.values(stats.ratings).reduce((a, b) => a + b, 0);
    return (
        <div
            className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest"
            role="status"
            aria-live="polite"
        >
            <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/5 border border-base-content/5"
                aria-label={t('review.progress_count', { current, total })}
            >
                <Hash size={12} className="text-primary" />
                <span className="text-base-content/60">{current}</span>
                <span className="text-base-content/20">/</span>
                <span className="text-base-content/40">{total}</span>
            </div>
            {reviewed > 0 && (
                <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/5 border border-success/10 text-success/80"
                    aria-label={t('review.stats.accuracy_desc', { accuracy: Math.round((accuracy / reviewed) * 100) })}
                >
                    <Target size={12} />
                    <span>{Math.round((accuracy / reviewed) * 100)}%</span>
                </div>
            )}
            {stats.streak > 1 && (
                <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/5 border border-warning/10 text-warning/80"
                    aria-label={t('review.stats.streak_desc', { count: stats.streak })}
                >
                    <Flame size={12} className="motion-safe:animate-pulse" />
                    <span>{stats.streak}</span>
                </div>
            )}
        </div>
    );
};

export const ReviewSession: React.FC = () => {
    const { t } = useTranslation(['review', 'common', 'notes']);
    const navigate = useNavigate();
    const prefersReducedMotion = usePrefersReducedMotion();
    useActiveView('v:due_list');

    // Global App Store
    const entities = useAppStore(s => s.entities);
    const commit = useAppStore(s => s.commit);
    const markStale = useAppStore(s => s.markStale);
    const { cardsPulse, questions } = entities;
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingMode] = useState(false);

    const rawCards = useMemo(() => Object.values(cardsPulse)
        .filter((c: any) => !!(c.card_id || c.id))
        .map((c: any) => ({ ...c, card_id: c.card_id || c.id })) as CardMeta[], [cardsPulse]);

    const [localSortMode, setLocalSortMode] = useState<ReviewSortMode>(() =>
        (localStorage.getItem('review_sort_mode') as ReviewSortMode) || 'optimal'
    );

    const dueCards = useMemo(() => sortCards(rawCards, localSortMode), [rawCards, localSortMode]);

    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) return dueCards;
        const query = searchQuery.toLowerCase();
        return dueCards.filter(card => {
            const q = questions[card.question_id];
            if (!q) return false;
            return (
                q.title?.toLowerCase().includes(query) ||
                q.subject_name?.toLowerCase().includes(query) ||
                q.content?.toLowerCase().includes(query)
            );
        });
    }, [dueCards, searchQuery, questions]);

    const wizard = useReviewWizard(dueCards);
    const { step, currentIndex, completedIndices, userAnswer, visibleHints, activeNotesTab, showNotesPanel, isStrategyConfirmed, actions } = wizard;

    // Create index mapping: filteredCards index -> dueCards index
    const filteredToOriginalIndex = useMemo(() => {
        if (!searchQuery.trim()) return dueCards.map((_, i) => i);
        const mapping: number[] = [];
        dueCards.forEach((card, originalIdx) => {
            const q = questions[card.question_id];
            if (q) {
                const query = searchQuery.toLowerCase();
                const matches = (
                    q.title?.toLowerCase().includes(query) ||
                    q.subject_name?.toLowerCase().includes(query) ||
                    q.content?.toLowerCase().includes(query)
                );
                if (matches) {
                    mapping.push(originalIdx);
                }
            }
        });
        return mapping;
    }, [dueCards, searchQuery, questions]);
    const { submitReview } = useReviewMutations();

    const currentCard = useMemo(() => dueCards[currentIndex], [dueCards, currentIndex]);
    const currentQuestion = useMemo(() => currentCard ? (questions[currentCard.question_id] as QuestionMeta) : null, [currentCard, questions]);
    const viewState = step === 'STUDYING' ? 'QUESTION' : 'ANSWER';

    const cardStartTime = useRef<number>(Date.now());
    const [sessionStats, setSessionStats] = useState<SessionStats>({ ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, totalTime: 0, streak: 0, maxStreak: 0 });
    const [hasStartedSession, setHasStartedSession] = useState(false);

    // Create i18n-aware interval formatting
    const formatDueDate = useMemo(() => createFormatDueDate(t), [t]);
    const defaultIntervals = useMemo(() => createDefaultIntervals(t), [t]);
    const [nextIntervals, setNextIntervals] = useState<Record<string, IntervalInfo>>(defaultIntervals);

    const [isFloatingNoteOpen, setIsFloatingNoteOpen] = useState(false);
    const [pinnedNoteId, setPinnedNoteId] = useState<string | null>(null);

    const activeNoteQuestionId = pinnedNoteId || currentQuestion?.id;

    // --- Resizable Sidebar State ---
    const reviewUi = useAppStore(s => s.reviewUi);
    const updateReviewUi = useAppStore(s => s.updateReviewUi);

    const [isResizingQueue, setIsResizingQueue] = useState(false);
    const [isSidebarHovered, setIsSidebarHovered] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleSidebarEnter = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (reviewUi.isQueueCollapsed) {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsSidebarHovered(true);
            }, 150); // 150ms delay to prevent accidental trigger
        }
    };

    const handleSidebarLeave = () => {
        if (!reviewUi.isQueueCollapsed) return;
        hoverTimeoutRef.current = setTimeout(() => {
            setIsSidebarHovered(false);
        }, 300); // 300ms delay before hiding to improve UX
    };

    const [isResizingNotes, setIsResizingNotes] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);

    const tempQueueWidth = useRef(reviewUi.queueWidth);
    const tempNotesWidth = useRef(reviewUi.notesWidth);

    const handleStartResizingQueue = (e: React.MouseEvent | React.TouchEvent) => {
        setIsResizingQueue(true);
        if ('preventDefault' in e) e.preventDefault();
    };

    const handleStartResizingNotes = (e: React.MouseEvent | React.TouchEvent) => {
        setIsResizingNotes(true);
        if ('preventDefault' in e) e.preventDefault();
    };

    useEffect(() => {
        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

            if (isResizingQueue) {
                tempQueueWidth.current = Math.max(SIDEBAR_CONSTRAINTS.queue.min, Math.min(SIDEBAR_CONSTRAINTS.queue.max, clientX));
                // Direct DOM update for performance
                const el = document.getElementById('review-queue-sidebar');
                if (el) el.style.width = `${tempQueueWidth.current}px`;
            }
            if (isResizingNotes) {
                tempNotesWidth.current = Math.max(SIDEBAR_CONSTRAINTS.notes.min, Math.min(SIDEBAR_CONSTRAINTS.notes.max, window.innerWidth - clientX));
                // Direct DOM update for performance
                const el = document.getElementById('review-notes-sidebar');
                if (el) el.style.width = `${tempNotesWidth.current}px`;
            }
        };

        const handleEnd = () => {
            if (isResizingQueue) updateReviewUi({ queueWidth: tempQueueWidth.current });
            if (isResizingNotes) updateReviewUi({ notesWidth: tempNotesWidth.current });
            setIsResizingQueue(false);
            setIsResizingNotes(false);
        };

        if (isResizingQueue || isResizingNotes) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isResizingQueue, isResizingNotes, updateReviewUi]);

    const toggleQueue = () => updateReviewUi({ isQueueCollapsed: !reviewUi.isQueueCollapsed });
    const toggleNotesLocal = () => {
        actions.toggleNotes();
        updateReviewUi({ isNotesCollapsed: !showNotesPanel });
    };

    // --- Selectors: Strategy Stats ---
    const strategyStats = useMemo(() => {
        const now = new Date();
        return {
            total: rawCards.length,
            overdue: rawCards.filter(c => new Date(c.due) < now).length,
            weak: rawCards.filter(c => (c.difficulty || 0) > 7).length
        };
    }, [rawCards]);

    // Loading State - Improved: Use stale state to detect if data has been fetched
    // This fixes the infinite loading issue when the due list is empty
    const isStale = useAppStore(s => !!s.stale['v:due_list']);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    useEffect(() => {
        // Mark as complete when:
        // 1. We have cards (original logic), OR
        // 2. The view is no longer stale AND we have checked at least once
        if (rawCards.length > 0) {
            setInitialLoadComplete(true);
        } else if (!isStale && !initialLoadComplete) {
            // Data fetch completed but queue is empty - still mark as complete
            const timer = setTimeout(() => setInitialLoadComplete(true), 100);
            return () => clearTimeout(timer);
        }
    }, [rawCards.length, isStale, initialLoadComplete]);

    const isLoading = !initialLoadComplete || isLoadingMode;
    const isEmpty = initialLoadComplete && !isLoadingMode && rawCards.length === 0 && !hasStartedSession;
    const showStrategy = !isLoading && !isEmpty && !isStrategyConfirmed && !hasStartedSession && rawCards.length > 0;
    const isCompleted = hasStartedSession && rawCards.length > 0 && completedIndices.size === rawCards.length;

    // Handlers
    // --- Interval Pre-fetching ---
    useEffect(() => {
        if (!currentCard || isCompleted) return;

        // Reset intervals for the new card to avoid flickering previous data
        setNextIntervals({});

        const fetchPreview = async () => {
            try {
                const baseDate = currentCard.last_review ? new Date(currentCard.last_review) : (currentCard.created_at ? new Date(currentCard.created_at) : new Date());
                const daysElapsed = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24)));
                const preview = await v2Api.previewReview({
                    card_id: currentCard.card_id,
                    stability: currentCard.stability || 0,
                    difficulty: currentCard.difficulty || 5,
                    days_elapsed: daysElapsed,
                    subject_id: currentCard.subject_id || undefined
                });

                const now = new Date();
                const createIntervalInfo = (intervalDays: number): IntervalInfo => {
                    const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
                    return {
                        interval: intervalDays,
                        dueDate,
                        display: formatDueDate(dueDate)
                    };
                };

                setNextIntervals({
                    again: createIntervalInfo(preview.intervals.again || 0),
                    hard: createIntervalInfo(preview.intervals.hard || 0),
                    good: createIntervalInfo(preview.intervals.good || 0),
                    easy: createIntervalInfo(preview.intervals.easy || 0)
                });
            } catch (err: any) {
                console.error('[Review] Interval pre-fetch failed:', err);
                // Fail silently as this is a background optimization, 
                // but console it for debugging.
            }
        };

        fetchPreview();
    }, [currentCard, isCompleted, formatDueDate]);

    const handleReveal = useCallback(() => {
        if (viewState !== 'QUESTION' || !currentCard) return;
        actions.revealAnswer();
    }, [viewState, currentCard, actions]);

    const handleRate = useCallback((rating: Rating) => {
        if (!currentCard) return;

        // 1. Capture current context for background task
        const targetCard = { ...currentCard };
        const durationMs = Date.now() - cardStartTime.current;
        const baseDate = targetCard.last_review ? new Date(targetCard.last_review) : (targetCard.created_at ? new Date(targetCard.created_at) : new Date());
        const daysElapsed = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24)));

        // 2. Optimistic UI: Update state immediately
        setHasStartedSession(true);
        setSessionStats(prev => {
            const isGood = rating >= 3;
            const newStreak = isGood ? prev.streak + 1 : 0;
            return {
                ...prev,
                ratings: { ...prev.ratings, [rating]: prev.ratings[rating] + 1 },
                streak: newStreak,
                maxStreak: Math.max(prev.maxStreak, newStreak)
            };
        });

        // 3. Fluid Transition: Move to next question immediately
        actions.rateSuccess();
        cardStartTime.current = Date.now();

        // 4. Background Communication: Ensure it's robust and idempotent
        submitReview.mutate({
            card_id: targetCard.card_id,
            rating,
            stability: targetCard.stability || 0,
            difficulty: targetCard.difficulty || 5,
            days_elapsed: daysElapsed,
            duration_ms: durationMs,
            client_request_id: `rev_${targetCard.card_id}_${Date.now()}` // Idempotency key
        }, {
            onSuccess: (result) => {
                // Background cache update
                commit({
                    type: 'entity_patch',
                    slice: 'cardsPulse',
                    id: targetCard.card_id,
                    patch: {
                        state: result.new_state.state,
                        stability: result.new_state.stability,
                        difficulty: result.new_state.difficulty,
                        due: result.new_state.due
                    },
                    updatedAt: new Date().toISOString(),
                    seq: Date.now()
                });
                markStale('v:due_list', 'review', 90);
            },
            onError: (err: any) => {
                console.error('[Review] Background submission failed:', err);
                useAppStore.getState().pushEffect({
                    type: 'toast',
                    level: 'error',
                    message: t('review.errors.submit_failed', 'Background sync failed. Progress may be lost.'),
                });
            }
        });
    }, [currentCard, actions, commit, markStale, t, submitReview]);

    const handleExit = useCallback(() => {
        if (completedIndices.size > 0 && completedIndices.size < dueCards.length) {
            setShowExitModal(true);
            return;
        }
        navigate('/dashboard');
    }, [navigate, completedIndices.size, dueCards.length]);

    // Keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isCompleted) return;
            const isEditable =
                document.activeElement instanceof HTMLInputElement ||
                document.activeElement instanceof HTMLTextAreaElement ||
                document.activeElement instanceof HTMLSelectElement ||
                (document.activeElement as HTMLElement)?.isContentEditable ||
                !!document.activeElement?.closest('[contenteditable="true"]');

            if (isEditable) {
                if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
                return;
            }
            if (viewState === 'QUESTION' && (e.key === ' ' || e.key === 'Enter')) { handleReveal(); e.preventDefault(); }
            else if (viewState === 'ANSWER' && ['1', '2', '3', '4'].includes(e.key)) { handleRate(parseInt(e.key) as Rating); }
            else if (e.key === 'h' || e.key === 'H') { actions.revealHint(); }
            else if (e.key === 'ArrowUp') {
                if (currentIndex > 0) actions.nextQuestion(currentIndex - 1);
            }
            else if (e.key === 'ArrowDown') {
                if (currentIndex < dueCards.length - 1) actions.nextQuestion(currentIndex + 1);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewState, handleReveal, handleRate, isCompleted, actions]);

    const backButtonRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (isEmpty) {
            backButtonRef.current?.focus();
        }
    }, [isEmpty]);

    if (isLoading) return <ReviewSkeleton />;
    if (isEmpty) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-base-200">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
                <CheckCircle2 size={40} />
            </div>
            <h1 className="text-2xl font-black mb-2">{t('review.empty_title', 'All Caught Up!')}</h1>
            <p className="text-base-content/50 mb-8 max-w-sm text-center font-medium leading-relaxed">{t('review.empty_desc', 'You have no items due for review right now. Knowledge is sticking!')}</p>
            <button
                ref={backButtonRef}
                autoFocus
                onClick={() => navigate('/dashboard')}
                className="btn btn-primary btn-wide rounded-2xl gap-2 focus-visible:ring-offset-2"
            >
                <ArrowLeft size={18} /> {t('common:common.actions.back_to_dashboard', 'Back to Dashboard')}
            </button>
        </div>
    );

    if (showStrategy) return (
        <div className="h-full w-full flex flex-col bg-transparent overflow-y-auto custom-scrollbar relative">
            {/* Soft decorative background circles - subtle and doesn't break layout */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] -mr-64 -mt-64 rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 blur-[120px] -ml-64 -mb-64 rounded-full pointer-events-none" />

            <motion.div
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={prefersReducedMotion ? { duration: 0.1 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-6xl mx-auto px-6 py-6 md:px-10 md:py-8 lg:px-12 relative z-10 space-y-8"
            >
                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-3 opacity-40 hover:opacity-100 transition-all cursor-pointer group" onClick={handleExit}>
                            <div className="w-8 h-8 rounded-lg bg-base-content/5 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                <ArrowLeft size={16} />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em]">{t('common:common.actions.back_to_dashboard', 'Back to Dashboard')}</span>
                        </div>

                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/20 shadow-sm backdrop-blur-md">
                                <Zap size={10} className="animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{t('review.setup.badge')}</span>
                            </div>
                            <h1 className="text-3xl md:text-4xl font-black text-base-content tracking-tight leading-none">
                                {t('review.setup.title')}
                            </h1>
                            <p className="text-base text-base-content/50 font-medium leading-relaxed max-w-2xl">
                                {t('review.setup.desc')}
                            </p>
                        </div>
                    </div>
                </header>

                <ReviewStrategyPanel
                    stats={strategyStats}
                    currentMode={localSortMode}
                    onModeChange={(m) => { setLocalSortMode(m); localStorage.setItem('review_sort_mode', m); }}
                    onStart={() => actions.startSession(localSortMode)}
                />
            </motion.div>
        </div>
    );

    if (isCompleted) return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-base-100 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-info to-success animate-gradient-x" />
            <div className="z-10 bg-base-100/50 p-12 rounded-[40px] border border-base-content/5 shadow-2xl backdrop-blur-3xl flex flex-col items-center max-w-2xl w-full">
                <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-success to-primary flex items-center justify-center mb-8 shadow-xl shadow-success/20 rotate-3">
                    <Award size={48} className="text-white" />
                </div>
                <h1 className="text-4xl font-black mb-3 tracking-tight italic">{t('review.completed_title', 'Session Complete')}</h1>
                <p className="text-base-content/40 mb-10 font-bold uppercase tracking-widest text-sm">{t('review.completed_subtitle', 'Target acquired. Knowledge consolidated.')}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
                    {[
                        { label: t('review.stats.reviewed', 'Reviewed'), value: completedIndices.size, icon: <Layers size={14} />, color: 'text-primary' },
                        { label: t('review.stats.streak', 'Streak'), value: sessionStats.maxStreak || sessionStats.streak, icon: <Flame size={14} />, color: 'text-warning' },
                        { label: t('review.stats.accuracy', 'Accuracy'), value: Math.round(((sessionStats.ratings[3] + sessionStats.ratings[4]) / Math.max(1, completedIndices.size)) * 100) + '%', icon: <Target size={14} />, color: 'text-success' },
                        { label: t('review.stats.time', 'Total Time'), value: Math.round(sessionStats.totalTime / 60000) + 'm', icon: <Clock size={14} />, color: 'text-info' }
                    ].map((s, i) => (
                        <div key={i} className="bg-base-200/50 p-6 rounded-3xl border border-base-content/5 flex flex-col items-center gap-2">
                            <div className={cn("flex items-center gap-2 font-black text-[10px] uppercase tracking-wider opacity-40")}>
                                {s.icon} <span>{s.label}</span>
                            </div>
                            <div className={cn("text-2xl font-black tracking-tighter", s.color)}>{s.value}</div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-4 w-full">
                    <button onClick={() => navigate('/dashboard')} className="flex-1 btn btn-ghost btn-lg h-20 rounded-3xl gap-3 border-2 border-base-content/5 hover:bg-base-200" aria-label={t('common:common.actions.back_home')}>
                        <ArrowLeft size={20} /> <span className="font-black italic">{t('review.back_home', 'Home')}</span>
                    </button>
                    <button onClick={() => { actions.startSession(localSortMode); setHasStartedSession(false); setSessionStats({ ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, totalTime: 0, streak: 0, maxStreak: 0 }); }} className="flex-[2] btn btn-primary btn-lg h-20 rounded-3xl gap-3 shadow-xl shadow-primary/20" aria-label={t('review.re_review')}>
                        <RotateCcw size={20} /> <span className="font-black italic">{t('review.re_review', 'Review Again')}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-full bg-base-100 flex overflow-hidden">
            {/* Left Sidebar Logic (Trigger + Content) */}
            <div
                className="relative z-50 flex h-full"
                onMouseEnter={handleSidebarEnter}
                onMouseLeave={handleSidebarLeave}
            >
                {/* Trigger Zone (Invisible when collapsed, but detects hover) */}
                {reviewUi.isQueueCollapsed && !isSidebarHovered && (
                    <div
                        onMouseEnter={handleSidebarEnter}
                        onMouseLeave={handleSidebarLeave}
                        className="fixed left-0 top-20 bottom-0 w-4 z-[60] bg-transparent group cursor-e-resize"
                    >
                        <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/0 group-hover:bg-primary/20 transition-all duration-500" />
                    </div>
                )}

                <aside
                    id="review-queue-sidebar"
                    onMouseEnter={handleSidebarEnter}
                    onMouseLeave={handleSidebarLeave}
                    className={cn(
                        "h-full border-base-content/5 bg-base-100/30 backdrop-blur-lg flex flex-col overflow-hidden transition-[width,opacity,transform] duration-300",
                        // Layout Logic:
                        // - Expanded: relative positioning, part of flow
                        // - Collapsed: absolute positioning (overlay), slides in/out
                        reviewUi.isQueueCollapsed
                            ? "absolute top-0 left-0 bottom-0 z-50 border-r shadow-2xl bg-base-100/80 supports-[backdrop-filter]:bg-base-100/60"
                            : "relative border-r w-full",

                        // Visibility Logic for Collapsed State:
                        reviewUi.isQueueCollapsed && (
                            isSidebarHovered
                                ? "translate-x-0 opacity-100"
                                : "-translate-x-full opacity-0 pointer-events-none"
                        )
                    )}
                    style={{
                        width: reviewUi.isQueueCollapsed
                            ? 300 // Fixed width for floating panel
                            : reviewUi.queueWidth
                    }}
                >
                    <div className="h-full flex flex-col w-full">
                        <ReviewQueueList
                            cards={filteredCards}
                            questions={questions}
                            currentIndex={currentIndex}
                            completedIndices={completedIndices}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            onSelect={(originalIdx) => actions.nextQuestion(originalIdx)}
                            onToggleCollapse={toggleQueue}
                            isCollapsed={reviewUi.isQueueCollapsed}
                            indexMapping={filteredToOriginalIndex}
                        />
                    </div>
                </aside>

                {/* Queue Resizer (Only show when expanded) */}
                {!reviewUi.isQueueCollapsed && (
                    <div
                        onMouseDown={handleStartResizingQueue}
                        onTouchStart={handleStartResizingQueue}
                        className={cn(
                            "absolute md:relative right-0 top-0 bottom-0 w-1 group cursor-col-resize hover:bg-primary/30 transition-colors z-50 h-full touch-none",
                            isResizingQueue && "bg-primary/50"
                        )}
                    />
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col relative min-w-0 bg-gradient-to-br from-base-100 to-base-200/50">
                <header className="h-20 border-b border-base-content/5 flex items-center justify-between px-8 bg-base-100/40 backdrop-blur-3xl z-20 shrink-0">
                    <div className="flex-1 flex items-center gap-6 min-w-0">
                        <button onClick={handleExit} className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 shrink-0" title={t('common:common.actions.back', 'Back')}>
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex-1 min-w-0 flex items-center gap-4">
                            {/* Subject Pill */}
                            {currentQuestion?.subject_name && (
                                <div
                                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm shrink-0"
                                    style={{
                                        backgroundColor: `oklch(from ${currentQuestion.subject_color || 'var(--color-primary)'} l c h / 0.08)`,
                                        borderColor: `oklch(from ${currentQuestion.subject_color || 'var(--color-primary)'} l c h / 0.15)`
                                    }}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentQuestion.subject_color }} />
                                    <span
                                        className="text-[10px] font-black uppercase tracking-wider"
                                        style={{ color: currentQuestion.subject_color }}
                                    >
                                        {currentQuestion.subject_name}
                                    </span>
                                </div>
                            )}

                            <div className="min-w-0">
                                <h2 className="text-[15px] font-black tracking-tight text-base-content/90 truncate leading-none mb-1">
                                    {currentQuestion?.title || t('common:common.untitled', 'Untitled')}
                                </h2>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-base-content/30 italic">
                                        {currentQuestion?.id ? `#${currentQuestion.id.slice(-6).toUpperCase()}` : 'N/A'}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-base-content/10" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">
                                        {currentQuestion?.question_type ? t(`common:common.type.${currentQuestion.question_type}`) : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 pl-6">
                        {/* Status Sync Indicator */}
                        <AnimatePresence>
                            {submitReview.isPending && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">Cloud Syncing</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <SessionStatsPanel stats={sessionStats} total={dueCards.length} current={currentIndex + 1} />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleNotesLocal}
                                className={cn(
                                    "btn btn-sm h-10 rounded-xl gap-2 font-bold transition-all",
                                    showNotesPanel ? "btn-neutral" : "btn-ghost"
                                )}
                            >
                                <BookOpen size={16} /> <span>{t('notes.panel.notes', 'Tools')}</span>
                            </button>
                        </div>
                    </div>
                    {/* Progress Bar (Global) */}
                    <div
                        role="progressbar"
                        aria-valuenow={completedIndices.size}
                        aria-valuemin={0}
                        aria-valuemax={dueCards.length}
                        aria-label={t('review.progress_label', { current: completedIndices.size, total: dueCards.length })}
                        className="absolute bottom-0 left-0 h-[2px] bg-primary/20 w-full overflow-hidden"
                    >
                        <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: `${(completedIndices.size / dueCards.length) * 100}%` }} />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar flex flex-col items-center py-8 px-4 md:py-12 md:px-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentIndex}
                            layout="position"
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15, filter: 'blur(8px)', scale: 0.99 }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -15, scale: 0.99 }}
                            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }} // Snappier expo easing
                            className="w-full max-w-3xl space-y-10 md:space-y-14 pb-24"
                        >
                            <section className="relative">
                                {currentQuestion && (
                                    <QuestionRenderer
                                        question={currentQuestion ? { ...currentQuestion, stability: currentCard?.stability } : null}
                                        userAnswer={userAnswer}
                                        setUserAnswer={actions.setUserAnswer}
                                        isRevealed={viewState === 'ANSWER'}
                                        onReveal={handleReveal}
                                        showHints={false}
                                        hideExplanation={false}
                                    />
                                )}
                            </section>

                            {/* Answer/Explanation section - QuestionRenderer now handles internal explanation rendering */}
                            {viewState === 'ANSWER' && (
                                <motion.section
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, delay: 0.2 }}
                                    className="pt-12 pb-24 border-t border-base-content/5"
                                >
                                    <div className="max-w-4xl mx-auto">
                                        {/* Unified Section Header */}
                                        <div className="flex items-center gap-3 mb-10 group/sec">
                                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-base-content/5 border border-base-content/5 group-hover/sec:bg-primary/10 group-hover/sec:border-primary/20 transition-all duration-500">
                                                <Target size={14} className="text-primary/60" />
                                                <span className="text-[10px] font-black text-base-content/60 group-hover/sec:text-primary uppercase tracking-[0.2em]">{t('review.rate_memory', 'Knowledge Assessment')}</span>
                                            </div>
                                            <div className="h-px flex-1 bg-gradient-to-r from-base-content/10 via-base-content/5 to-transparent" />
                                        </div>

                                        {/* Integrated Selector Strip - Refined Pro */}
                                        <div className="relative p-1.5 md:p-2.5 rounded-[2.5rem] bg-base-content/[0.03] border border-base-content/5 backdrop-blur-xl">
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-2">
                                                {[
                                                    { id: 1 as Rating, key: 'again', color: 'error', icon: <RotateCcw size={18} />, shortcut: '1' },
                                                    { id: 2 as Rating, key: 'hard', color: 'warning', icon: <AlertTriangle size={18} />, shortcut: '2' },
                                                    { id: 3 as Rating, key: 'good', color: 'success', icon: <CheckCircle2 size={18} />, shortcut: '3' },
                                                    { id: 4 as Rating, key: 'easy', color: 'primary', icon: <Zap size={18} />, shortcut: '4' }
                                                ].map((r) => (
                                                    <button
                                                        key={r.id}
                                                        onClick={() => handleRate(r.id)}
                                                        className={cn(
                                                            "group relative flex flex-col items-center justify-center gap-4 p-5 md:p-7 rounded-[2.25rem] transition-all duration-500",
                                                            "bg-transparent border border-transparent outline-none hover:bg-base-content/[0.04] active:scale-95",
                                                            r.color === 'error' && "text-error hover:border-error/30",
                                                            r.color === 'warning' && "text-warning hover:border-warning/30",
                                                            r.color === 'success' && "text-success hover:border-success/30",
                                                            r.color === 'primary' && "text-primary hover:border-primary/30"
                                                        )}
                                                    >
                                                        {/* Icon Box */}
                                                        <div className="w-11 h-11 rounded-2xl bg-base-content/5 flex items-center justify-center transition-all duration-500 group-hover:bg-current/10 group-hover:scale-110">
                                                            {r.icon}
                                                        </div>

                                                        <div className="flex flex-col items-center text-center gap-0.5 min-w-[4rem]">
                                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 group-hover:opacity-60 transition-opacity">
                                                                {t(`review.rating.${r.key}`)}
                                                            </span>
                                                            <span className="text-xl md:text-2xl font-black tracking-tight text-base-content group-hover:scale-105 transition-transform duration-500">
                                                                {nextIntervals[r.key]?.display || '...'}
                                                            </span>
                                                        </div>

                                                        {/* Discrete Shortcut Tag */}
                                                        <div className="absolute top-4 right-4 w-5 h-5 rounded-lg border border-base-content/5 bg-base-content/[0.02] flex items-center justify-center opacity-10 group-hover:opacity-100 transition-all duration-300">
                                                            <span className="text-[9px] font-bold font-mono text-base-content/40 group-hover:text-current">{r.shortcut}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Contextual Hint */}
                                        <div className="mt-12 flex flex-col items-center">
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-base-content/[0.02] border border-base-content/5 opacity-60 hover:opacity-100 transition-opacity">
                                                <span className="text-[9px] font-black text-base-content/30 uppercase tracking-[0.3em]">{t('review.keyboard_hint', 'Rating Shortcuts')}</span>
                                                <div className="flex gap-1.5 ml-1">
                                                    {[1, 2, 3, 4].map(k => (
                                                        <kbd key={k} className="w-4 h-4 flex items-center justify-center rounded bg-base-content/10 text-[9px] font-bold text-base-content/40 border-b border-base-content/20">{k}</kbd>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.section>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>

                {/* Fixed Bottom Action Bar - Only for "Show Answer" button */}
                {viewState === 'QUESTION' && (
                    <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-center pb-6 pt-16 bg-gradient-to-t from-base-100 from-40% to-transparent pointer-events-none">
                        <button
                            onClick={handleReveal}
                            className="pointer-events-auto group btn btn-primary h-12 md:h-14 px-6 md:px-8 rounded-xl md:rounded-2xl gap-2 md:gap-3 shadow-xl border-none relative overflow-hidden hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Brain size={18} className="text-primary-content" />
                            <span className="text-sm md:text-base font-bold tracking-wide text-primary-content">{t('review.reveal_answer', 'Show Answer')}</span>
                            <kbd className="hidden sm:flex ml-1 h-5 px-1.5 rounded-md bg-white/20 border-0 text-[9px] font-bold text-primary-content/60 items-center">Space</kbd>
                        </button>
                    </div>
                )}
            </div>

            {/* Notes Resizer */}
            <div
                onMouseDown={handleStartResizingNotes}
                onTouchStart={handleStartResizingNotes}
                className={cn(
                    "w-1 group relative cursor-col-resize hover:bg-primary/30 transition-colors z-50",
                    isResizingNotes && "bg-primary/50",
                    !showNotesPanel && "hidden"
                )}
            >
                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-6 h-12 bg-base-100 border border-base-content/10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:scale-110 transition-all z-[60] shadow-premium-sm">
                    <div className="w-0.5 h-4 bg-base-content/20 rounded-full" />
                </div>
            </div>

            {/* Right Sidebar: Notes */}
            <aside
                id="review-notes-sidebar"
                className={cn(
                    "relative border-l border-base-content/5 bg-base-100/30 backdrop-blur-lg flex flex-col z-40 overflow-hidden transition-[width,opacity] ease-out",
                    UI_CONFIG.TRANSITION_DURATION,
                    UI_CONFIG.TRANSITION_EASE,
                    !showNotesPanel ? "w-0 opacity-0" : "opacity-100"
                )}
                style={{ width: !showNotesPanel ? 0 : reviewUi.notesWidth }}
            >
                <div style={{ width: reviewUi.notesWidth }} className="h-full">
                    <NotesPanel
                        questionId={currentQuestion?.id || ''}
                        hints={currentQuestion?.hints}
                        visibleHints={visibleHints}
                        onRevealHint={actions.revealHint}
                        activeTab={activeNotesTab}
                        onTabChange={(tab: any) => actions.setNotesTab(tab)}
                        onPopOutJot={() => {
                            setIsFloatingNoteOpen(true);
                            actions.toggleNotes();
                            updateReviewUi({ isNotesCollapsed: true });
                        }}
                    />
                </div>
            </aside>

            {isFloatingNoteOpen && (
                <FloatingNotes
                    questionId={activeNoteQuestionId || ''}
                    isOpen={isFloatingNoteOpen}
                    onClose={() => setIsFloatingNoteOpen(false)}
                    isPinned={!!pinnedNoteId}
                    onTogglePin={() => setPinnedNoteId(pinnedNoteId ? null : currentQuestion?.id || null)}
                    onDock={() => {
                        setIsFloatingNoteOpen(false);
                        if (!showNotesPanel) {
                            actions.toggleNotes();
                            updateReviewUi({ isNotesCollapsed: false });
                        }
                    }}
                />
            )}

            <DeleteConfirmModal
                isOpen={showExitModal}
                onClose={() => setShowExitModal(false)}
                onConfirm={async () => navigate('/dashboard')}
                title={t('review.exit_modal.title', 'End Session?')}
                itemName={t('review.exit_confirm', {
                    reviewed: completedIndices.size,
                    remaining: dueCards.length - completedIndices.size
                })}
                itemType="review"
            />
        </div>
    );
};
