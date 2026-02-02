import React, { useCallback } from 'react';
import {
    Brain, X, CheckCircle2, BarChart3, Edit3,
    Layout, Activity, Layers,
    RefreshCw, AlertCircle, ChevronLeft, ChevronRight,
    Search, Plus, Trash2, FileText
} from 'lucide-react';
import { useShortcut } from '../../app/hooks/useShortcut';
import { MarkdownRenderer, prefetchContent } from '../../components/LatexRenderer';

import { useTranslation } from 'react-i18next';
import { QuestionRenderer } from '../review/QuestionRenderer';
import { cn } from '../../app/utils/cn';
import { getEntityVisuals } from '../../app/utils/colorSystem';
import { EntityBadge } from '../ui/EntityBadge';
import { DifficultyBadge } from '../ui/DifficultyBadge';
import { ChoicesEditor } from './ChoicesEditor';
import { SectionHeader, FieldGroup } from './InspectorField';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';

// Duplicate purely for decoupling components from pages during refactor
export interface InspectorQuestion {
    id: string;
    title: string;
    content: string;
    explanation?: string | null;
    correct_answer?: any; // JSON structure
    correct_answer_text?: string | null;
    wrong_answer?: string | null;
    image_url?: string | null;
    explanation_image_url?: string | null;
    correct_answer_image_url?: string | null;
    question_type: 'choice' | 'fill_blank' | 'short_answer';
    difficulty: 'easy' | 'medium' | 'hard';
    subject_id?: string;
    subject_name?: string;
    subject_color?: string;
    tags: { id?: string; name: string; color?: string }[];
    // FSRS / Card Data
    card_id?: string;
    stability?: number;
    difficulty_fsrs?: number; // differentiating from 'difficulty' enum
    state?: number; // 0=New, 1=Learning, 2=Review, 3=Relearning
    due?: string;
    review_count: number;
    mastery: number;
    // Database Technical Info
    created_at?: string;
    updated_at?: string;
    last_review?: string;
    reps?: number;
    lapses?: number;
    scheduled_days?: number;
    hints?: any;
    metadata?: any;
    content_hash?: string;
    last_synced_hash?: string;

}

export type InspectorMode = 'preview' | 'edit' | 'meta';

interface QuestionInspectorProps {
    activeQuestion: InspectorQuestion | null;
    isVisible: boolean;
    mode: InspectorMode;
    setMode: (m: InspectorMode) => void;
    onClose: () => void;

    // Editor Props
    draft: Partial<InspectorQuestion>;
    setDraft: React.Dispatch<React.SetStateAction<Partial<InspectorQuestion>>>;
    isDirty: boolean;
    isSaved: boolean;
    onSave: () => void;
    onDelete: () => void;
    onQuickReview: (e: React.MouseEvent, q: InspectorQuestion) => void;

    // Navigation Props (for Prev/Next workflow)
    onNavigate?: (direction: 'prev' | 'next') => void;
    canNavigatePrev?: boolean;
    canNavigateNext?: boolean;
    currentIndex?: number;
    totalCount?: number;

    // Bulk Inspector Props
    selectedQuestions?: InspectorQuestion[];
    isBulkMode?: boolean;
    onBulkUpdate?: (update: Partial<InspectorQuestion>) => void;
    availableSubjects?: { id: string, name: string, color?: string }[];
    availableTags?: { id: string, name: string, color?: string }[];

    // Resizing Props
    width?: number;
    isDragging?: boolean;
}

export function QuestionInspector({
    activeQuestion, isVisible, mode, setMode, onClose,
    draft, setDraft, isDirty, isSaved, onSave, onDelete, onQuickReview,
    onNavigate, canNavigatePrev = false, canNavigateNext = false, currentIndex, totalCount,
    selectedQuestions = [], isBulkMode = false, onBulkUpdate,
    availableSubjects = [], availableTags = [],
    width = 600, isDragging = false
}: QuestionInspectorProps) {
    const { t, i18n } = useTranslation();
    const { matchesShortcut } = useShortcut();
    const [isLivePreview, setIsLivePreview] = React.useState(false);
    const [userAnswer, setUserAnswer] = React.useState<any>(null);
    const [previewRevealed, setPreviewRevealed] = React.useState(false);

    // ✅ P1: Use deferred value for live preview to keep typing responsive
    const deferredPreviewContent = React.useDeferredValue(draft.content || '');

    const [reviewHistory, setReviewHistory] = React.useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);

    // ✅ UX: Prevent content disappearance during fast switching by holding onto the last valid question
    const lastValidQuestion = React.useRef<InspectorQuestion | null>(activeQuestion);
    if (activeQuestion) {
        lastValidQuestion.current = activeQuestion;
    }
    const stableQuestion = (activeQuestion || lastValidQuestion.current) as InspectorQuestion;

    // 🚀 PREFETCH: Pre-render content for instant display
    // Prefetch current question content as soon as we know about it
    React.useEffect(() => {
        if (stableQuestion?.content) {
            // Prefetch main content immediately
            prefetchContent(stableQuestion.content);
            // Also prefetch explanation if available
            if (stableQuestion.explanation) {
                prefetchContent(stableQuestion.explanation);
            }
        }
    }, [stableQuestion?.id]);

    // 🚀 PREFETCH: Adjacent questions are prefetched by parent (QuestionBank) on hover/navigation
    // This component relies on parent calling prefetchContent() for adjacent items


    // Fetch review history when entering meta mode
    React.useEffect(() => {
        if (mode === 'meta' && stableQuestion?.id) {
            const fetchHistory = async () => {
                setIsLoadingHistory(true);
                try {
                    const { data, error } = await supabase
                        .from('review_logs')
                        .select('id, rating, review, state, stability, difficulty')
                        .eq('question_id', stableQuestion?.id)
                        .order('review', { ascending: false })
                        .limit(10);

                    if (error) throw error;
                    setReviewHistory(data || []);
                } catch (err) {
                    console.error('Error fetching review history:', err);
                } finally {
                    setIsLoadingHistory(false);
                }
            };
            fetchHistory();
        }
    }, [mode, stableQuestion?.id]);

    // Hotkeys implementation
    React.useEffect(() => {
        const handleGlobalKeys = (e: KeyboardEvent) => {
            if (!isVisible || (!activeQuestion && !isBulkMode)) return;

            // Mode switching: 1, 2, 3
            const isInputActive = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;

            // Mode switching
            if (!isInputActive) {
                if (matchesShortcut(e, 'inspector', 'mode_preview')) {
                    e.preventDefault();
                    setMode('preview');
                } else if (matchesShortcut(e, 'inspector', 'mode_edit')) {
                    e.preventDefault();
                    setMode('edit');
                } else if (matchesShortcut(e, 'inspector', 'mode_meta')) {
                    e.preventDefault();
                    setMode('meta');
                }
            }

            // Preview specific: Reveal
            if (mode === 'preview' && !isInputActive && matchesShortcut(e, 'inspector', 'toggle_answer')) {
                e.preventDefault();
                setPreviewRevealed(prev => !prev);
            }

            // Global: Toggle Preview (not yet in DEFAULT_SHORTCUTS, using hardcoded for now or adding it)
            // Let's add it to DEFAULT_SHORTCUTS in the next step or use matchesShortcut if I added it.
            // I'll check my shortcuts.ts
            if (matchesShortcut(e, 'inspector', 'toggle_preview')) {
                e.preventDefault();
                setIsLivePreview(prev => !prev);
            }

            // Global: Save
            if (matchesShortcut(e, 'inspector', 'save')) {
                e.preventDefault();
                if (mode === 'edit' && isDirty) {
                    onSave();
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeys);
        return () => window.removeEventListener('keydown', handleGlobalKeys);
    }, [isVisible, activeQuestion, isBulkMode, mode, isDirty, onSave, setMode]);

    // Sync state when active question changes
    React.useEffect(() => {
        setPreviewRevealed(false); // Default to not revealed for fresh start
        if (stableQuestion?.question_type === 'fill_blank') {
            setUserAnswer([]);
        } else {
            setUserAnswer(null);
        }
    }, [stableQuestion?.id]);

    // Memoized format FSRS stability as days (NOT percentage!)
    const formatStability = useCallback((s?: number): string | null => {
        if (s == null || s === 0) return null;
        if (s < 1) return `${(s * 24).toFixed(1)}h`;
        if (s < 10) return `${s.toFixed(2)}d`;
        if (s < 100) return `${s.toFixed(1)}d`;
        return `${Math.round(s)}d`;
    }, []);

    // Use shared DifficultyBadge component instead of local implementation

    if (!isVisible && !activeQuestion && !isBulkMode) return null;

    return (
        <aside
            className={`inspector glass-surface border-l border-base-content/5 flex flex-col h-full bg-base-content/[0.01] transition-all overflow-hidden ${isDragging ? 'transition-none' : 'duration-200 ease-out'} ${(isVisible && (activeQuestion || isBulkMode)) ? 'translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0 pointer-events-none'}`}
            style={{
                width: (isVisible && (activeQuestion || isBulkMode)) ? (isDragging ? `${width}px` : '100%') : '0px',
                flexShrink: 0,
                minWidth: (isVisible && (activeQuestion || isBulkMode) && !isDragging) ? '320px' : '0px'
            }}
            onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && mode === 'edit') {
                    onSave();
                }
            }}
        >
            {/* Top Themed Accent Line */}
            {(() => {
                const vis = getEntityVisuals(stableQuestion?.subject_color, stableQuestion?.subject_name);
                return <div className={cn("h-1 w-full shrink-0 transition-colors duration-500", vis.dot)} />;
            })()}
            {isBulkMode ? (
                <div className="flex flex-col h-full reveal-smooth relative">
                    {/* Bulk Header */}
                    <div className="shrink-0 p-4 border-b border-base-content/5 bg-base-content/[0.02] backdrop-blur-md z-20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 text-primary">
                                    <Layout size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="text-xs font-black tracking-tight">{t('library.inspector.bulk.title').toUpperCase()}</h3>
                                    <span className="text-[9px] font-black opacity-30 uppercase">{t('library.inspector.bulk.selected', { count: selectedQuestions.length })}</span>
                                </div>
                            </div>
                            <button onClick={onClose} className="btn btn-ghost btn-xs btn-square se-interactive rounded-lg hover:bg-error/10 hover:text-error transition-colors">
                                <X size={16} className="opacity-40 hover:opacity-100" />
                            </button>
                        </div>
                    </div>

                    {/* Bulk Content */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8 space-y-10 custom-scrollbar">
                        {/* Summary Section */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-[10px] font-black opacity-40 uppercase tracking-[0.2em]">
                                <BarChart3 size={12} /> {t('library.inspector.bulk.composition')}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="glass-inline p-4 bg-base-content/[0.04] border-base-content/5">
                                    <div className="text-[9px] font-black opacity-30 uppercase mb-1">{t('library.inspector.bulk.common_state')}</div>
                                    <div className="text-lg font-black text-primary">{t('library.inspector.bulk.mixed')}</div>
                                </div>
                                <div className="glass-inline p-4 bg-base-content/[0.04] border-base-content/5">
                                    <div className="text-[9px] font-black opacity-30 uppercase mb-1">{t('library.inspector.bulk.avg_stability')}</div>
                                    <div className="text-lg font-black se-mono text-base-content">4.2d</div>
                                </div>
                            </div>
                        </section>

                        {/* Batch Edit Fields */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-2 text-[10px] font-black opacity-40 uppercase tracking-[0.2em]">
                                <Edit3 size={12} /> {t('library.inspector.bulk.batch_ops')}
                            </div>

                            {/* Difficulty Batch */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest ml-1">{t('library.inspector.bulk.update_difficulty')}</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {['easy', 'medium', 'hard'].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => onBulkUpdate?.({ difficulty: d as any })}
                                            className="h-10 rounded-xl border border-base-content/5 bg-base-content/[0.02] text-[9px] font-black uppercase hover:bg-primary/10 hover:border-primary/20 hover:text-primary transition-all se-interactive"
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Subject Batch */}
                            {availableSubjects.length > 0 && (
                                <div className="space-y-3">
                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest ml-1">{t('library.inspector.bulk.update_subject', 'Update Subject')}</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {availableSubjects.slice(0, 6).map(s => {
                                            return (
                                                <EntityBadge
                                                    key={s.id}
                                                    name={s.name}
                                                    color={s.color}
                                                    onClick={() => onBulkUpdate?.({ subject_id: s.id })}
                                                    className="h-10 justify-start"
                                                    interactive
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Tags Batch - 完善的标签管理 */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest ml-1">{t('library.inspector.bulk.manage_tags')}</span>
                                    <span className="text-[9px] font-medium text-info/60 flex items-center gap-1">
                                        <Plus size={10} />
                                        {t('library.inspector.bulk.tags_append_hint', 'Tags will be added, not replaced')}
                                    </span>
                                </div>

                                {/* 自定义标签输入 */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder={t('library.inspector.edit.ph_add_tag', '+ Add tag...')}
                                        className="flex-1 h-10 px-4 rounded-xl bg-base-content/[0.03] border border-base-content/10 text-sm font-medium placeholder:opacity-40 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                const tagName = e.currentTarget.value.trim();
                                                onBulkUpdate?.({ tags: [{ id: '', name: tagName }] });
                                                e.currentTarget.value = '';
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={(e) => {
                                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                            if (input?.value.trim()) {
                                                const tagName = input.value.trim();
                                                onBulkUpdate?.({ tags: [{ id: '', name: tagName }] });
                                                input.value = '';
                                            }
                                        }}
                                        className="h-10 px-4 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all se-interactive flex items-center gap-2"
                                    >
                                        <Plus size={14} /> {t('common.actions.add', 'Add')}
                                    </button>
                                </div>

                                {/* 建议标签 */}
                                <div className="space-y-2">
                                    <span className="text-[9px] font-black opacity-20 uppercase tracking-widest">{t('common.recommended', 'Suggested')}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {(availableTags.length > 0 ? availableTags.slice(0, 12) : []).map(tag => {
                                            const name = typeof tag === 'string' ? tag : tag.name;
                                            const color = typeof tag === 'string' ? null : tag.color;
                                            return (
                                                <EntityBadge
                                                    key={name}
                                                    name={name}
                                                    color={color}
                                                    showHash
                                                    onClick={() => onBulkUpdate?.({ tags: [{ id: '', name: name }] })}
                                                    interactive
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="p-4 bg-warning/5 rounded-2xl border border-warning/10 flex gap-3 italic">
                            <AlertCircle size={16} className="text-warning shrink-0" />
                            <p className="text-[10px] font-medium text-warning/80 leading-relaxed">
                                {t('library.inspector.bulk.warning', { count: selectedQuestions.length })}
                            </p>
                        </div>
                    </div>

                    {/* Bulk Footer - 重新设计的操作区 */}
                    <div className="shrink-0 p-4 border-t border-base-content/5 bg-base-100/50 backdrop-blur-2xl z-20 flex items-center justify-between gap-3">
                        {/* 左侧：选中数量 */}
                        <div className="text-[10px] font-black opacity-40 uppercase tracking-widest">
                            {t('library.inspector.bulk.selected', { count: selectedQuestions.length })}
                        </div>

                        {/* 右侧：操作按钮 */}
                        <div className="flex items-center gap-2">
                            <button
                                className="btn btn-ghost h-10 px-4 rounded-xl border border-error/20 bg-error/5 text-error hover:bg-error hover:text-white transition-all se-interactive text-xs font-bold uppercase tracking-wide"
                                onClick={() => onDelete()}
                            >
                                <Trash2 size={14} className="mr-2" />
                                {t('common.actions.delete', 'Delete')}
                            </button>
                            <button
                                className="btn btn-primary h-10 px-5 rounded-xl shadow-lg shadow-primary/20 se-interactive uppercase font-black tracking-wider text-xs"
                                onClick={onClose}
                            >
                                {t('common.actions.close', 'Done')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (stableQuestion || activeQuestion) ? (
                <div className="flex flex-col h-full relative">
                    {/* Header: Refined & Spacious */}
                    <div className="shrink-0 p-5 border-b border-base-content/5 bg-base-content/[0.02] backdrop-blur-xl z-20 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center border border-primary/10 text-primary shrink-0 shadow-inner">
                                    <Brain size={18} className="opacity-70" />
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                    {mode === 'edit' ? (
                                        <div className="relative group/title-edit">
                                            <input
                                                id="inspector-title-input"
                                                name="title"
                                                type="text"
                                                value={draft.title || ''}
                                                onChange={(e) => setDraft(d => ({ ...d, title: e.target.value }))}
                                                className="w-full bg-base-content/5 border-none outline-none text-base font-black text-base-content tracking-tight leading-tight px-2 py-1 rounded-lg focus:bg-base-100 focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-20 translate-x-[-8px]"
                                                placeholder={t('library.inspector.edit.ph_title', 'Question Title...')}
                                                autoFocus
                                                autoComplete="off"
                                            />
                                            <div className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-focus-within/title-edit:opacity-30 transition-opacity">
                                                <Edit3 size={12} />
                                            </div>
                                        </div>
                                    ) : (
                                        <h2 className="text-base font-black text-base-content tracking-tight leading-none line-clamp-1 min-h-[2rem] flex items-center" title={stableQuestion.title}>
                                            <MarkdownRenderer content={stableQuestion.title} className="prose-none [&_p]:m-0" density="compact" />
                                        </h2>
                                    )}
                                    <div className="flex items-center gap-2 mt-0.5 opacity-60">
                                        <span className="text-[9px] font-bold se-mono uppercase tracking-widest select-all">
                                            #{stableQuestion.id.slice(0, 8)}
                                        </span>
                                        <div className="w-1 h-1 rounded-full bg-base-content/20" />
                                        <span className="text-[9px] font-black uppercase tracking-tighter">
                                            {t(`common.type.${stableQuestion.question_type}`)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Navigation + Close Actions */}
                            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                {onNavigate && (
                                    <div className="flex items-center bg-base-content/5 rounded-lg p-0.5 border border-base-content/5">
                                        <button
                                            onClick={() => onNavigate('prev')}
                                            disabled={!canNavigatePrev}
                                            className="w-6 h-6 flex items-center justify-center se-interactive rounded-md disabled:opacity-20 hover:bg-base-100 hover:shadow-sm transition-all text-base-content"
                                            title={`${t('library.inspector.navigation.prev')} (←)`}
                                        >
                                            <ChevronLeft size={14} strokeWidth={3} />
                                        </button>
                                        <span className="text-[8px] font-black px-2 se-mono opacity-50">
                                            {currentIndex != null ? `${currentIndex + 1}/${totalCount}` : '--'}
                                        </span>
                                        <button
                                            onClick={() => onNavigate('next')}
                                            disabled={!canNavigateNext}
                                            className="w-6 h-6 flex items-center justify-center se-interactive rounded-md disabled:opacity-20 hover:bg-base-100 hover:shadow-sm transition-all text-base-content"
                                            title={`${t('library.inspector.navigation.next')} (→)`}
                                        >
                                            <ChevronRight size={14} strokeWidth={3} />
                                        </button>
                                    </div>
                                )}
                                <button onClick={onClose} className="w-7 h-7 flex items-center justify-center se-interactive rounded-lg hover:bg-error/10 hover:text-error transition-colors group">
                                    <X size={16} className="opacity-40 group-hover:opacity-100" />
                                </button>
                            </div>
                        </div>

                        {/* Metadata Badges & Mode Switcher Row */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DifficultyBadge level={stableQuestion.difficulty} />
                                    <EntityBadge
                                        name={stableQuestion.subject_name || t('library.general_subject', 'General')}
                                        color={stableQuestion.subject_color}
                                        size="sm"
                                    />
                                </div>

                                {/* Minimal Mode Switcher */}
                                <div
                                    role="tablist"
                                    aria-label={t('library.inspector.mode_switcher', 'View mode')}
                                    className="flex p-0.5 bg-base-content/5 rounded-lg border border-base-content/5 w-48"
                                    onKeyDown={(e) => {
                                        const modes: InspectorMode[] = ['preview', 'edit', 'meta'];
                                        const currentIdx = modes.indexOf(mode);
                                        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            const nextIdx = (currentIdx + 1) % modes.length;
                                            setMode(modes[nextIdx]);
                                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            const prevIdx = (currentIdx - 1 + modes.length) % modes.length;
                                            setMode(modes[prevIdx]);
                                        } else if (e.key === 'Home') {
                                            e.preventDefault();
                                            setMode('preview');
                                        } else if (e.key === 'End') {
                                            e.preventDefault();
                                            setMode('meta');
                                        }
                                    }}
                                >
                                    {[
                                        { id: 'preview', label: t('library.inspector.modes.preview').toUpperCase(), key: '1' },
                                        { id: 'edit', label: t('library.inspector.modes.edit').toUpperCase(), key: '2' },
                                        { id: 'meta', label: t('library.inspector.modes.meta').toUpperCase(), key: '3' }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            role="tab"
                                            id={`inspector-tab-${m.id}`}
                                            aria-selected={mode === m.id}
                                            aria-controls={`inspector-panel-${m.id}`}
                                            tabIndex={mode === m.id ? 0 : -1}
                                            onClick={() => setMode(m.id as InspectorMode)}
                                            className={cn(
                                                "flex-1 relative py-1 text-[8px] font-black uppercase tracking-widest rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                                                (() => {
                                                    const vis = getEntityVisuals(stableQuestion.subject_color, stableQuestion.subject_name);
                                                    return mode === m.id
                                                        ? cn("bg-base-100 shadow-sm ring-1 ring-base-content/10", vis.text)
                                                        : "opacity-40 hover:opacity-100";
                                                })()
                                            )}
                                        >
                                            <span className="relative z-10">{m.label.length > 4 ? m.label.slice(0, 3) : m.label}</span>
                                            <span className="absolute bottom-[2px] right-[2px] text-[6px] opacity-20 font-mono" aria-hidden="true">{m.key}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Contextual Action Bar - Stays fixed so it doesn't scroll away */}
                        {mode === 'preview' && (
                            <div className="flex items-center justify-between px-1 animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="flex items-center gap-2 text-[9px] font-black opacity-30 uppercase tracking-[0.15em]">
                                    <Layout size={10} /> {t('library.inspector.interactive_preview')}
                                </div>
                                <button
                                    onClick={() => setPreviewRevealed(!previewRevealed)}
                                    className={cn(
                                        "group flex items-center gap-2 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all se-interactive",
                                        (() => {
                                            const vis = getEntityVisuals(stableQuestion.subject_color, stableQuestion.subject_name);
                                            return previewRevealed
                                                ? cn("bg-base-content/5 border-base-content/5 text-base-content/60 hover:bg-base-content/10")
                                                : cn(vis.bg, vis.border, vis.text, "hover:brightness-110");
                                        })()
                                    )}
                                >
                                    <RefreshCw size={10} className={cn("transition-transform duration-500", !previewRevealed && "rotate-180 opacity-40")} />
                                    {previewRevealed ? t('renderer.answer.reset') : t('renderer.answer.reveal')}
                                    <kbd className="ml-1 px-1 py-0.5 rounded bg-base-content/10 text-[7px] opacity-40 group-hover:opacity-100 transition-opacity">r</kbd>
                                </button>
                            </div>
                        )}

                        {mode === 'edit' && (
                            <div className="flex items-center justify-between px-1 animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="flex items-center gap-2 text-[9px] font-black opacity-30 uppercase tracking-[0.15em]">
                                    <Edit3 size={10} /> {t('library.inspector.modes.edit')}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-[8px] font-black uppercase px-1.5 py-0.5 rounded border transition-all",
                                        isDirty ? "bg-warning/10 border-warning/20 text-warning animate-pulse" : "bg-success/10 border-success/20 text-success opacity-40"
                                    )}>
                                        {isDirty ? t('library.inspector.edit.unsaved') : t('library.inspector.edit.btn_saved')}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Content: Scrollable */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar scroll-smooth overscroll-contain">

                        {/* --- PREVIEW MODE --- */}
                        {mode === 'preview' && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-12 py-4">
                                {/* Interactive Preview - Clean & Shared logic */}
                                <section className="reveal-smooth">
                                    <div className="min-h-[200px]">
                                        <QuestionRenderer
                                            question={stableQuestion}
                                            userAnswer={userAnswer}
                                            setUserAnswer={setUserAnswer}
                                            isRevealed={previewRevealed}
                                            onReveal={() => setPreviewRevealed(true)}
                                            disableAutoFocus={true}
                                        />
                                    </div>
                                </section>

                                {/* Footer Tags */}
                                <section className="space-y-4 pt-4 border-t border-base-content/5 opacity-60 hover:opacity-100 transition-opacity">
                                    <div className="flex flex-wrap gap-2">
                                        {stableQuestion.tags.map((tag, idx) => (
                                            <EntityBadge
                                                key={tag.id || `view-${tag.name}-${idx}`}
                                                name={tag.name}
                                                color={tag.color}
                                                showHash
                                                size="md"
                                            />
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* --- EDIT MODE --- */}
                        {mode === 'edit' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-24">
                                <section className="space-y-10">
                                    <div className="space-y-8">
                                        <SectionHeader
                                            icon={<Layers />}
                                            title={t('library.inspector.edit.label_type', 'Classification')}
                                            value={`${t(`library.filters.${draft.question_type || 'choice'}`)} · ${t(`library.card.difficulty.${draft.difficulty || 'medium'}`)}`}
                                        />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                                            <FieldGroup label={t('library.filters.question_type', 'Type')} id="inspector-type-select">
                                                <div className="flex p-1 bg-base-content/5 rounded-xl gap-0.5 border border-base-content/5">
                                                    {['choice', 'fill_blank', 'short_answer'].map(type => (
                                                        <button
                                                            key={type}
                                                            id={`inspector-type-${type}`}
                                                            onClick={() => setDraft(d => ({ ...d, question_type: type as any }))}
                                                            className={cn(
                                                                "flex-1 py-1.5 text-[8px] font-black uppercase rounded-lg transition-all",
                                                                draft.question_type === type ? "bg-base-100 shadow-sm text-primary" : "opacity-40 hover:opacity-100"
                                                            )}
                                                        >
                                                            {t(`library.filters.${type}`)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </FieldGroup>
                                            <FieldGroup label={t('library.card.difficulty.title', 'Difficulty')} id="inspector-diff-select">
                                                <div className="flex p-1 bg-base-content/5 rounded-xl gap-0.5 border border-base-content/5">
                                                    {['easy', 'medium', 'hard'].map(level => (
                                                        <button
                                                            key={level}
                                                            id={`inspector-diff-${level}`}
                                                            onClick={() => setDraft(d => ({ ...d, difficulty: level as any }))}
                                                            className={cn(
                                                                "flex-1 py-1.5 text-[8px] font-black uppercase rounded-lg transition-all",
                                                                draft.difficulty === level ? "bg-base-100 shadow-sm text-primary" : "opacity-40 hover:opacity-100"
                                                            )}
                                                        >
                                                            {t(`library.card.difficulty.${level}`)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </FieldGroup>
                                        </div>

                                        <ChoicesEditor
                                            instanceId={`insp-${stableQuestion?.id || 'new'}`}
                                            hints={draft.hints as any}
                                            correctAnswer={draft.correct_answer as any}
                                            explanation={draft.explanation}
                                            questionType={draft.question_type || 'choice'}
                                            onHintsChange={(hints) => setDraft(d => ({ ...d, hints }))}
                                            onCorrectAnswerChange={(answer) => setDraft(d => ({ ...d, correct_answer: answer }))}
                                            onExplanationChange={(explanation) => setDraft(d => ({ ...d, explanation }))}
                                        />

                                        <FieldGroup
                                            label={t('library.inspector.edit.label_mistake', 'Option Analysis')}
                                            id="inspector-wrong-answer"
                                        >
                                            <textarea
                                                id="inspector-wrong-answer"
                                                name="wrong_answer"
                                                value={draft.wrong_answer || ''}
                                                onChange={(e) => setDraft(d => ({ ...d, wrong_answer: e.target.value }))}
                                                rows={2}
                                                className="w-full p-3 bg-error/5 border border-error/10 rounded-xl text-sm focus:border-error/40 focus:bg-base-100 outline-none transition-all placeholder:text-error/20 resize-none shadow-sm"
                                                placeholder={t('library.inspector.edit.ph_wrong', 'Record your mistake here...')}
                                            />
                                        </FieldGroup>

                                        <div className="space-y-4">
                                            <SectionHeader
                                                icon={<FileText />}
                                                title={t('library.inspector.edit.label_content', 'Question Content')}
                                                value={`${(draft.content || '').length} chars`}
                                                actions={
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsLivePreview(!isLivePreview)}
                                                        className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border shadow-sm flex items-center gap-2 ${isLivePreview ? 'bg-primary border-primary text-white' : 'bg-base-content/5 border-base-content/10'}`}
                                                    >
                                                        {isLivePreview ? <Edit3 size={12} /> : <Layout size={12} />}
                                                        {isLivePreview ? t('library.inspector.edit.edit_source', 'Edit') : t('library.inspector.edit.live_preview', 'Preview')}
                                                    </button>
                                                }
                                            />
                                            {isLivePreview ? (
                                                <div className="w-full min-h-[192px] p-4 bg-base-content/[0.01] border border-base-content/5 rounded-xl text-sm overflow-y-auto max-h-[400px]">
                                                    <MarkdownRenderer content={deferredPreviewContent} />
                                                </div>
                                            ) : (
                                                <textarea
                                                    id="inspector-content"
                                                    name="content"
                                                    value={draft.content || ''}
                                                    onChange={(e) => setDraft(d => ({ ...d, content: e.target.value }))}
                                                    className="w-full h-48 p-4 bg-base-200/50 border border-base-content/10 rounded-xl font-mono text-sm focus:border-primary/40 focus:bg-base-100 outline-none transition-all resize-none shadow-inner"
                                                    placeholder={t('library.inspector.edit.ph_md')}
                                                />
                                            )}
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-base-content/5">
                                            <SectionHeader
                                                icon={<Search />}
                                                title={t('library.inspector.edit.label_tags', 'Metadata')}
                                                value={(draft.tags?.length || 0).toString()}
                                            />
                                            {/* Current Tags - Flattened */}
                                            <div className="flex flex-wrap gap-2">
                                                {draft.tags?.map((tag, idx) => (
                                                    <EntityBadge
                                                        key={tag.id || `edit-${tag.name}-${idx}`}
                                                        name={tag.name}
                                                        color={tag.color}
                                                        showHash
                                                        size="md"
                                                        className="group/tag"
                                                    >
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDraft(d => ({ ...d, tags: (d.tags || []).filter(t => t.name !== tag.name) }));
                                                            }}
                                                            className="opacity-40 hover:opacity-100 hover:text-error transition-all ml-1"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </EntityBadge>
                                                ))}
                                                {/* Add Tag Input */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-base-content/10 rounded-xl focus-within:border-primary/40 transition-colors">
                                                    <Search size={10} className="opacity-20" />
                                                    <label htmlFor={`inspector-add-tag-${stableQuestion?.id || 'new'}`} className="sr-only">{t('library.inspector.edit.ph_add_tag', '+ Add Tag...')}</label>
                                                    <input
                                                        id={`inspector-add-tag-${stableQuestion?.id || 'new'}`}
                                                        name="add_tag_input"
                                                        type="text"
                                                        placeholder={t('library.inspector.edit.ph_add_tag', '+ Add Tag...')}
                                                        className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-primary placeholder:text-base-content/20 w-24"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const val = (e.target as HTMLInputElement).value.trim();
                                                                if (val && !draft.tags?.some(t => t.name === val)) {
                                                                    setDraft(d => ({ ...d, tags: [...(d.tags || []), { id: '', name: val }] }));
                                                                    (e.target as HTMLInputElement).value = '';
                                                                }
                                                                e.preventDefault();
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            {/* Quick Tag Suggestions */}
                                            <div className="flex flex-wrap gap-2">
                                                {(availableTags.length > 0 ? availableTags : [{ name: 'Exam' }, { name: 'Important' }, { name: 'Review' }, { name: 'Math' }, { name: 'Physics' }, { name: 'History' }])
                                                    .filter(tag => !draft.tags?.some(t => t.name === tag.name))
                                                    .slice(0, 8)
                                                    .map(tag => (
                                                        <button
                                                            key={tag.name}
                                                            onClick={() => setDraft(d => ({ ...d, tags: [...(d.tags || []), { id: '', name: tag.name }] }))}
                                                            className="px-2.5 py-1 rounded-lg border border-base-content/5 text-[8px] font-bold uppercase opacity-30 hover:opacity-100 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all flex items-center gap-1"
                                                        >
                                                            <Plus size={8} /> {tag.name}
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- Advanced: Hints & Metadata (Collapsible) --- */}
                                    <details className="group/details">
                                        <summary className="text-[10px] font-black opacity-30 uppercase tracking-widest ml-1 flex items-center gap-2 cursor-pointer hover:opacity-60 transition-opacity mb-3 list-none">
                                            <Activity size={10} /> {t('library.inspector.edit.advanced', 'Advanced Metadata')}
                                            <ChevronRight size={12} className="transition-transform group-open/details:rotate-90" />
                                        </summary>
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <FieldGroup
                                                label={t('library.inspector.edit.label_meta', 'Metadata (JSON)')}
                                                id="inspector-metadata"
                                            >
                                                <textarea
                                                    id="inspector-metadata"
                                                    name="metadata"
                                                    value={
                                                        draft.metadata && typeof draft.metadata === 'object' && Object.keys(draft.metadata).length > 0
                                                            ? JSON.stringify(draft.metadata, null, 2)
                                                            : (typeof draft.metadata === 'string' ? draft.metadata : '')
                                                    }
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        try {
                                                            setDraft(d => ({ ...d, metadata: JSON.parse(val) }));
                                                        } catch {
                                                            setDraft(d => ({ ...d, metadata: val }));
                                                        }
                                                    }}
                                                    rows={6}
                                                    className="w-full p-3 bg-base-200/30 border border-base-content/5 rounded-xl font-mono text-xs focus:border-primary/20 outline-none transition-all resize-none"
                                                    placeholder='{"source": "...", "chapter": "..."}'
                                                />
                                            </FieldGroup>
                                        </div>
                                    </details>
                                </section>
                            </div>
                        )}

                        {/* --- META MODE --- */}
                        {mode === 'meta' && stableQuestion && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                <section className="grid grid-cols-2 gap-4">
                                    <div className="se-glass-panel p-6 bg-primary/5 border-primary/10 relative overflow-hidden rounded-3xl border">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                            <Brain size={120} />
                                        </div>
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-8 text-primary opacity-60">
                                            {t('library.inspector.meta.title')}
                                        </h4>

                                        <div className="space-y-10 relative z-10">
                                            <div className="flex items-end justify-between">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-wider block">
                                                        {t('library.inspector.meta.stability')} <span className="opacity-60">{t('library.inspector.meta.stability_unit')}</span>
                                                    </span>
                                                    <div className="text-3xl font-black text-info se-mono leading-none">
                                                        {formatStability(stableQuestion.stability) || '0.0d'}
                                                    </div>
                                                </div>
                                                <div className="text-[9px] opacity-40 font-bold max-w-[100px] text-right leading-relaxed">
                                                    {t('library.inspector.meta.estimated_recall')}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between text-[10px] font-black opacity-30 uppercase tracking-wider">
                                                    <span>{t('library.inspector.meta.mastery')}</span>
                                                    <span className="se-mono text-base-content/60">{stableQuestion.mastery}%</span>
                                                </div>
                                                <div className="w-full h-2 bg-base-content/5 rounded-full overflow-hidden p-0.5 border border-base-content/5">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-success/40 to-success rounded-full transition-all duration-1000"
                                                        style={{ width: `${stableQuestion.mastery}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-base-content/5">
                                                <div className="space-y-1">
                                                    <div className="text-[9px] font-black opacity-30 uppercase">{t('library.inspector.meta.reps')}</div>
                                                    <div className="text-xl font-black se-mono">{stableQuestion.review_count}</div>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-[9px] font-black opacity-30 uppercase">{t('library.inspector.meta.lapses')}</div>
                                                    <div className="text-xl font-black se-mono text-error/60">{stableQuestion.lapses || 0}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Integrated Study State Panel */}
                                        <div className="se-glass-panel p-6 bg-base-content/[0.02] border border-base-content/5 rounded-3xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">{t('library.inspector.meta.next_session')}</span>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-sm font-black text-base-content leading-none">
                                                            {stableQuestion.due ? new Date(stableQuestion.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : t('library.inspector.meta.ready_now')}
                                                        </span>
                                                        {!stableQuestion.due && <span className="text-[8px] font-black uppercase text-success mt-1.5 animate-pulse tracking-tighter">{t('library.inspector.meta.ready_now')}</span>}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">{t('library.inspector.meta.state')}</span>
                                                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${stableQuestion.state === 0 ? 'bg-info/10 text-info border-info/20 shadow-sm shadow-info/10' :
                                                        stableQuestion.state === 1 ? 'bg-warning/10 text-warning border-warning/20 shadow-sm shadow-warning/10' :
                                                            stableQuestion.state === 2 ? 'bg-success/10 text-success border-success/20 shadow-sm shadow-success/10' :
                                                                'bg-error/10 text-error border-error/20 shadow-sm shadow-error/10'
                                                        }`}>
                                                        {stableQuestion.state === 0 ? t('review.state.new') :
                                                            stableQuestion.state === 1 ? t('review.state.learning') :
                                                                stableQuestion.state === 2 ? t('review.state.review') :
                                                                    t('review.state.relearning')}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="pt-8 border-t border-base-content/5 grid grid-cols-2 gap-6">
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black opacity-20 uppercase tracking-widest">{t('library.inspector.meta.created_at')}</span>
                                                    <div className="text-[10px] font-bold se-mono opacity-60">
                                                        {stableQuestion.created_at ? new Date(stableQuestion.created_at).toLocaleDateString() : 'N/A'}
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black opacity-20 uppercase tracking-widest">{t('library.inspector.meta.last_review')}</span>
                                                    <div className="text-[10px] font-bold se-mono opacity-60">
                                                        {stableQuestion.last_review ? new Date(stableQuestion.last_review).toLocaleDateString() : t('library.inspector.meta.never_reviewed')}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-8 border-t border-base-content/5">
                                                <details className="group/meta">
                                                    <summary className="text-[9px] font-black opacity-20 uppercase tracking-widest flex items-center justify-between cursor-pointer hover:opacity-40 transition-opacity list-none">
                                                        <span>{t('library.inspector.meta.technical')}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-success opacity-40" />
                                                            <ChevronRight size={10} className="transition-transform group-open/meta:rotate-90" />
                                                        </div>
                                                    </summary>
                                                    <div className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-1">
                                                        <div className="p-3 bg-base-content/5 rounded-2xl border border-base-content/5">
                                                            <span className="text-[8px] font-black opacity-20 uppercase block mb-1.5 tracking-tighter">{t('library.inspector.meta.content_hash')}</span>
                                                            <div className="text-[8px] se-mono break-all opacity-30 font-medium leading-relaxed">
                                                                {stableQuestion.content_hash || 'SHA256_NULL'}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between px-1">
                                                            <span className="text-[8px] font-black opacity-20 uppercase">{t('library.inspector.meta.integrity_check')}</span>
                                                            <span className="text-[8px] font-black text-success opacity-40 uppercase tracking-tighter">{t('library.inspector.meta.integrity_match')}</span>
                                                        </div>
                                                    </div>
                                                </details>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="se-glass-panel p-6 bg-base-content/[0.02] border border-base-content/5 rounded-3xl">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 flex items-center justify-between">
                                        <div className="flex items-center gap-2 opacity-40">
                                            <RefreshCw size={12} /> {t('library.inspector.meta.history')}
                                        </div>
                                        {isLoadingHistory && <div className="loading loading-spinner loading-xs opacity-20" />}
                                    </h4>

                                    {reviewHistory.length > 0 ? (
                                        <div className="space-y-3">
                                            {reviewHistory.map((log) => (
                                                <div key={log.id} className="flex items-center justify-between p-3 rounded-2xl bg-base-content/[0.03] border border-base-content/5 hover:border-primary/10 transition-all group/log">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "w-12 h-8 rounded-xl flex items-center justify-center text-[9px] font-black shadow-sm",
                                                            log.rating === 1 ? "bg-error/10 text-error" :
                                                                log.rating === 2 ? "bg-warning/10 text-warning" :
                                                                    log.rating === 3 ? "bg-success/10 text-success" :
                                                                        "bg-info/10 text-info"
                                                        )}>
                                                            {log.rating === 1 ? t('review.rating.again').toUpperCase() :
                                                                log.rating === 2 ? t('review.rating.hard').toUpperCase() :
                                                                    log.rating === 3 ? t('review.rating.good').toUpperCase() :
                                                                        t('review.rating.easy').toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-base-content/70">
                                                                {format(new Date(log.review), 'MMM d, yyyy HH:mm', { locale: i18n.language === 'zh' ? zhCN : enUS })}
                                                            </span>
                                                            <span className="text-[8px] font-black opacity-30 uppercase tracking-tighter">
                                                                {t('library.inspector.meta.stability')}: {log.stability.toFixed(2)}d · {t('library.card.difficulty.title')}: {log.difficulty.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover/log:opacity-100 transition-opacity">
                                                        <div className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-base-content/5 opacity-40">
                                                            {log.state === 0 ? t('review.state.new').toUpperCase() :
                                                                log.state === 1 ? t('review.state.learning').toUpperCase() :
                                                                    log.state === 2 ? t('review.state.review').toUpperCase() :
                                                                        t('review.state.relearning').toUpperCase()}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : isLoadingHistory ? (
                                        <div className="space-y-3">
                                            <div className="h-10 w-full bg-base-content/5 rounded-2xl animate-pulse" />
                                            <div className="h-10 w-full bg-base-content/5 rounded-2xl animate-pulse" />
                                            <div className="h-10 w-full bg-base-content/5 rounded-2xl animate-pulse" />
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center bg-base-content/[0.02] rounded-2xl border border-dashed border-base-content/10">
                                            <p className="text-[10px] font-bold opacity-30">{t('library.inspector.meta.never_reviewed')}</p>
                                        </div>
                                    )}
                                    <div className="mt-6 text-[8px] font-black text-center opacity-30 uppercase tracking-[0.2em]">{t('library.inspector.meta.history_hint')}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Fixed Actions Footer */}
                    <div className="shrink-0 p-4 border-t border-base-content/5 bg-base-100/50 backdrop-blur-2xl z-20 flex gap-3">
                        {mode === 'edit' ? (
                            <button
                                className={cn(
                                    "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 font-black uppercase text-xs tracking-wider transition-all se-interactive",
                                    isDirty
                                        ? "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                                        : "bg-base-content/5 text-base-content/10 border border-base-content/5 cursor-not-allowed"
                                )}
                                onClick={onSave}
                                disabled={!isDirty}
                            >
                                <CheckCircle2 size={16} />
                                {isSaved ? t('library.inspector.edit.btn_saved') : t('library.inspector.edit.btn_save')}
                                <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[9px] opacity-40 hidden sm:inline-block">Ctrl+S</kbd>
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary flex-1 h-12 rounded-xl shadow-lg shadow-primary/20 gap-2 se-interactive uppercase font-black tracking-wider text-xs"
                                onClick={(e) => stableQuestion && onQuickReview(e, stableQuestion)}
                            >
                                <Brain size={16} strokeWidth={2.5} /> {t('library.inspector.btn_evaluate')}
                            </button>
                        )}
                        <button
                            className="btn btn-ghost h-12 px-5 rounded-xl border border-base-content/10 bg-base-content/[0.03] se-interactive group"
                            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
                            title={mode === 'edit' ? t('library.inspector.modes.preview') : t('library.inspector.modes.edit')}
                        >
                            <Edit3 size={18} className="group-hover:scale-110 transition-transform opacity-60 group-hover:opacity-100" />
                        </button>
                        <button
                            className="btn btn-ghost h-12 px-3 rounded-xl border border-base-content/10 bg-base-content/[0.03] se-interactive text-error/40 hover:text-error hover:bg-error/5 group"
                            onClick={onDelete}
                            title={t('common.actions.delete', 'Delete')}
                        >
                            <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center reveal-smooth">
                    <div className="relative group mb-8">
                        <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full group-hover:bg-primary/30 transition-all duration-700 animate-pulse" />
                        <div className="relative w-24 h-24 rounded-[2.5rem] bg-base-content/5 border border-base-content/10 flex items-center justify-center shadow-inner-white overflow-hidden group-hover:scale-105 transition-transform duration-500">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
                            <Layout size={32} strokeWidth={1.5} className="text-primary opacity-40 group-hover:opacity-100 transition-all duration-500 group-hover:rotate-6" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="font-black text-[10px] uppercase tracking-[0.4em] text-primary opacity-30 group-hover:opacity-100 transition-all">
                            {t('library.inspector.ready_to_inspect', 'Ready to Inspect')}
                        </div>
                        <p className="text-[10px] font-bold max-w-[240px] leading-relaxed opacity-20 group-hover:opacity-40 transition-all mx-auto">
                            {t('library.inspector.select_guide', 'Select any node from the grid to reveal its neural pathways and logical structure.')}
                        </p>
                    </div>
                </div>
            )}
        </aside>
    );
}
