/* eslint-disable react-hooks/refs */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useActiveView } from '../app/hooks/useActiveView';
import { useAppStore } from '../app/state/useAppStore';
import { v2Api } from '../app/api/views';
import {
    CheckCircle2, Brain, ArrowLeft,
    Layers, Target, Zap,
    RotateCcw, Award, Flame,
    Hash, Sparkles, Clock, BookOpen,
    Pin, PinOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../components/LatexRenderer';
import { QuestionRenderer } from '../components/review/QuestionRenderer';
import { ReviewStrategyPanel } from '../components/review/ReviewStrategyPanel';
import { sortCards } from '../app/utils/reviewSortUtils';
import type { ReviewSortMode } from '../app/utils/reviewSortUtils';
import { ReviewSkeleton } from '../components/layout/PageSkeletons';
import { cn } from '../app/utils/cn';
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

const RATING_LABELS: Record<Rating, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

const formatInterval = (days: number): string => {
    if (days < 1) {
        const mins = Math.round(days * 24 * 60);
        return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
    }
    return `${Math.round(days)}d`;
};

const DEFAULT_INTERVALS = { again: '5m', hard: '1d', good: '3d', easy: '7d' };

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
    onSelect: (index: number) => void;
    onToggleCollapse?: () => void;
    isCollapsed?: boolean;
}> = ({ cards, questions, currentIndex, completedIndices, onSelect, onToggleCollapse, isCollapsed = false }) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-base-content/5 flex items-center justify-between group/header shrink-0 h-16 bg-base-100/50 backdrop-blur-md">
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
                        title={isCollapsed ? t('common.actions.pin_sidebar', 'Pin Sidebar') : t('common.actions.collapse', 'Unpin Sidebar')}
                    >
                        {/* 
                            Logic:
                            - isCollapsed = true (Floating mode): Show Pin icon (Click to Pin/Expand)
                            - isCollapsed = false (Pinned mode): Show PinOff icon (Click to Unpin/Collapse)
                         */}
                        {isCollapsed ? (
                            <Pin size={16} className="text-base-content/40 hover:text-primary transition-colors" />
                        ) : (
                            <PinOff size={16} className="text-base-content/40 hover:text-primary transition-colors" />
                        )}

                    </button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {cards.map((card, idx) => {
                    const question = questions[card.question_id];
                    const isCurrent = idx === currentIndex;
                    const isCompleted = completedIndices.has(idx);

                    return (
                        <button
                            key={card.card_id}
                            onClick={() => onSelect(idx)}
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
                                {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className={cn(
                                    "text-xs font-bold truncate",
                                    isCurrent ? "text-primary-content" : "text-base-content/80"
                                )}>
                                    {question?.title || t('common.untitled', 'Untitled')}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={cn(
                                        "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                                        isCurrent ? "bg-white/20 text-primary-content" : "bg-base-content/5 text-base-content/30"
                                    )}>
                                        {question?.question_type ? t(`common.type.${question.question_type}`) : 'N/A'}
                                    </span>
                                    {question?.subject_name && (
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: question.subject_color }} />
                                            <span className={cn("text-[9px] font-bold truncate", isCurrent ? "text-primary-content/64" : "text-base-content/30")}>
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
    const { t } = useTranslation();
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
    const { t } = useTranslation();
    const navigate = useNavigate();
    const prefersReducedMotion = usePrefersReducedMotion();
    useActiveView('v:due_list');

    // Global App Store
    const entities = useAppStore(s => s.entities);
    const commit = useAppStore(s => s.commit);
    const markStale = useAppStore(s => s.markStale);
    const { cardsPulse, questions } = entities;

    const [isLoadingMode] = useState(false);

    const rawCards = useMemo(() => Object.values(cardsPulse)
        .filter((c: any) => !!(c.card_id || c.id))
        .map((c: any) => ({ ...c, card_id: c.card_id || c.id })) as CardMeta[], [cardsPulse]);

    const [localSortMode, setLocalSortMode] = useState<ReviewSortMode>(() =>
        (localStorage.getItem('review_sort_mode') as ReviewSortMode) || 'optimal'
    );

    const dueCards = useMemo(() => sortCards(rawCards, localSortMode), [rawCards, localSortMode]);
    const wizard = useReviewWizard(dueCards);
    const { step, currentIndex, completedIndices, userAnswer, visibleHints, activeNotesTab, showNotesPanel, isStrategyConfirmed, actions } = wizard;
    const { submitReview } = useReviewMutations();

    const currentCard = useMemo(() => dueCards[currentIndex], [dueCards, currentIndex]);
    const currentQuestion = useMemo(() => currentCard ? (questions[currentCard.question_id] as QuestionMeta) : null, [currentCard, questions]);
    const viewState = step === 'STUDYING' ? 'QUESTION' : 'ANSWER';

    const cardStartTime = useRef<number>(Date.now());
    const [sessionStats, setSessionStats] = useState<SessionStats>({ ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, totalTime: 0, streak: 0, maxStreak: 0 });
    const [hasStartedSession, setHasStartedSession] = useState(false);
    const [nextIntervals, setNextIntervals] = useState(DEFAULT_INTERVALS);
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
        if (reviewUi.isQueueCollapsed) setIsSidebarHovered(true);
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
    const handleReveal = useCallback(async () => {
        if (viewState !== 'QUESTION' || !currentCard) return;
        actions.revealAnswer();
        try {
            const baseDate = currentCard.last_review ? new Date(currentCard.last_review) : (currentCard.created_at ? new Date(currentCard.created_at) : new Date());
            const daysElapsed = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24)));
            const preview = await v2Api.previewReview({ card_id: currentCard.card_id, stability: currentCard.stability || 0, difficulty: currentCard.difficulty || 5, days_elapsed: daysElapsed });
            setNextIntervals({
                again: formatInterval(preview.intervals.again || 0),
                hard: formatInterval(preview.intervals.hard || 1),
                good: formatInterval(preview.intervals.good || 1),
                easy: formatInterval(preview.intervals.easy || 2)
            });
        } catch (err: any) {
            console.error(err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: t('review.errors.preview_failed', 'Failed to calculate intervals'),
            });
        }
    }, [viewState, currentCard, actions, t]);

    const handleRate = useCallback(async (rating: Rating) => {
        if (submitReview.isPending || !currentCard) return;
        const durationMs = Date.now() - cardStartTime.current;
        const baseDate = currentCard.last_review ? new Date(currentCard.last_review) : (currentCard.created_at ? new Date(currentCard.created_at) : new Date());
        const daysElapsed = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24)));
        setHasStartedSession(true);
        try {
            const result = await submitReview.mutateAsync({ card_id: currentCard.card_id, rating, stability: currentCard.stability || 0, difficulty: currentCard.difficulty || 5, days_elapsed: daysElapsed, duration_ms: durationMs });
            commit({ type: 'entity_patch', slice: 'cardsPulse', id: currentCard.card_id, patch: { state: result.new_state.state, stability: result.new_state.stability, difficulty: result.new_state.difficulty, due: result.new_state.due }, updatedAt: new Date().toISOString(), seq: Date.now() });
            markStale('v:due_list', 'review', 90);

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

            actions.rateSuccess();
            cardStartTime.current = Date.now();
        } catch (err: any) {
            console.error(err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: t('review.errors.submit_failed', 'Failed to submit review'),
            });
        }
    }, [submitReview.isPending, currentCard, actions, commit, markStale, t]);

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
                <ArrowLeft size={18} /> {t('common.actions.back_to_dashboard', 'Back to Dashboard')}
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
                            <span className="text-[11px] font-black uppercase tracking-[0.2em]">{t('common.actions.back_to_dashboard', 'Back to Dashboard')}</span>
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
                    <button onClick={() => navigate('/dashboard')} className="flex-1 btn btn-ghost btn-lg h-20 rounded-3xl gap-3 border-2 border-base-content/5 hover:bg-base-200" aria-label={t('common.actions.back_home')}>
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
                {/* Trigger Zone (Invisible when collapsed, but detects hover) - Width increased for better hit target */}
                {reviewUi.isQueueCollapsed && !isSidebarHovered && (
                    <div className="fixed left-0 top-20 bottom-0 w-6 z-[60] bg-transparent hover:bg-primary/5 transition-colors cursor-e-resize" />
                )}

                <aside
                    id="review-queue-sidebar"
                    className={cn(
                        "h-full border-base-content/5 bg-base-100/30 backdrop-blur-2xl flex flex-col overflow-hidden transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)",
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
                            cards={dueCards}
                            questions={questions}
                            currentIndex={currentIndex}
                            completedIndices={completedIndices}
                            onSelect={(idx) => actions.nextQuestion(idx)}
                            onToggleCollapse={toggleQueue}
                            isCollapsed={reviewUi.isQueueCollapsed}
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
                        <button onClick={handleExit} className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 shrink-0" title={t('common.actions.back', 'Back')}>
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-black tracking-tight flex items-center gap-2.5 truncate text-base-content/90">
                                {currentQuestion?.subject_name && (
                                    <span className="w-2 h-2 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: currentQuestion.subject_color }} title={currentQuestion.subject_name} />
                                )}
                                <span className="truncate">{currentQuestion?.title || t('common.untitled', 'Untitled')}</span>
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 pl-6">
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

                <main className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar flex flex-col items-center py-12 px-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentIndex}
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(8px)' }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="w-full max-w-4xl space-y-12"
                        >
                            <section className="relative group">
                                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-primary/10 rounded-full group-hover:bg-primary/30 transition-colors" />
                                <div className="flex items-center gap-3 mb-6 opacity-40 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md uppercase tracking-wider italic">{t('renderer.question', 'Question')}</span>
                                    <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                                </div>
                                {currentQuestion && (
                                    <QuestionRenderer
                                        question={currentQuestion}
                                        userAnswer={userAnswer}
                                        setUserAnswer={actions.setUserAnswer}
                                        isRevealed={viewState === 'ANSWER'}
                                        onReveal={handleReveal}
                                        hideExplanation={true}
                                    />
                                )}
                            </section>

                            {viewState === 'QUESTION' ? (
                                <div className="flex justify-center py-12">
                                    <button onClick={handleReveal} className="group btn btn-primary btn-lg h-24 px-12 rounded-[32px] gap-4 shadow-2xl shadow-primary/20 border-none relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-primary-focus to-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <Brain size={24} className="relative z-10 motion-safe:animate-pulse" />
                                        <span className="text-xl font-black italic tracking-tight relative z-10 uppercase">{t('review.reveal_answer', 'Show Answer')}</span>
                                        <kbd className="absolute right-4 bottom-4 opacity-20 z-10 kbd kbd-sm bg-primary-content/20 border-none text-[10px]">Space</kbd>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-12">
                                    <section className="relative group/answer">
                                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-success/10 rounded-full group-hover/answer:bg-success/30 transition-colors" />
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className="text-[10px] font-black bg-success/10 text-success px-2 py-0.5 rounded-md uppercase tracking-wider italic">{t('renderer.answer_explanation', 'Answer & Explanation')}</span>
                                            <div className="h-px flex-1 bg-gradient-to-r from-success/20 to-transparent" />
                                        </div>
                                        <div className="bg-success/[0.02] p-8 rounded-[40px] border border-success/5 shadow-inner">
                                            {currentQuestion?.explanation ? (
                                                <div className="prose prose-lg max-w-none prose-success">
                                                    <MarkdownRenderer content={currentQuestion.explanation} />
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-12 text-base-content/20 italic font-medium">
                                                    <Sparkles size={32} className="mb-4 opacity-50" />
                                                    <p>No explanation provided. Rely on your internal neural pathways.</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <footer className="sticky bottom-12 z-30 flex flex-col items-center gap-8 py-8">
                                        <div className="bg-base-100/50 backdrop-blur-2xl p-4 rounded-full border border-base-content/5 shadow-2xl flex gap-3">
                                            {(Object.keys(RATING_LABELS) as unknown as Rating[]).map((rating) => {
                                                const isPending = submitReview.isPending && rating === 3; // Simplified, in real use we'd track specific rating
                                                return (
                                                    <button
                                                        key={rating}
                                                        onClick={() => handleRate(rating)}
                                                        disabled={submitReview.isPending}
                                                        aria-label={t('review.rating.aria', {
                                                            rating: t(`review.rating.${RATING_LABELS[rating]}`),
                                                            interval: nextIntervals[RATING_LABELS[rating] as keyof typeof nextIntervals]
                                                        })}
                                                        aria-keyshortcuts={String(rating)}
                                                        className={cn("relative btn btn-lg h-20 rounded-[28px] px-8 flex flex-col gap-0.5 border-none transition-all hover:scale-105 active:scale-95 shadow-lg",
                                                            rating === 1 && "bg-error/10 hover:bg-error text-error hover:text-white shadow-error/10",
                                                            rating === 2 && "bg-warning/10 hover:bg-warning text-warning hover:text-white shadow-warning/10",
                                                            rating === 3 && "bg-info/10 hover:bg-info text-info hover:text-white shadow-info/10",
                                                            rating === 4 && "bg-success/10 hover:bg-success text-success hover:text-white shadow-success/10",
                                                            submitReview.isPending && "opacity-50 cursor-not-allowed pointer-events-none"
                                                        )}>
                                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none opacity-60 mb-1">{t(`review.rating.${RATING_LABELS[rating]}`)}</span>
                                                        <div className="flex items-center gap-2">
                                                            {isPending && <span className="loading loading-spinner loading-xs" />}
                                                            <span className="text-xl font-black italic tracking-tighter leading-none">{nextIntervals[RATING_LABELS[rating] as keyof typeof nextIntervals]}</span>
                                                        </div>
                                                        <kbd className="absolute bottom-2 right-4 opacity-20 text-[8px] font-bold z-10">{rating}</kbd>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </footer>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>
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
                    "relative border-l border-base-content/5 bg-base-100/30 backdrop-blur-2xl flex flex-col z-40 overflow-hidden transition-all",
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
                            // ✅ P0: 弹出窗口与右侧便签互斥 - 弹出时关闭右侧面板
                            setIsFloatingNoteOpen(true);
                            actions.toggleNotes(); // 关闭右侧面板
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
                        // ✅ P0: 关闭弹出窗口并恢复右侧面板
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
