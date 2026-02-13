import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../../../app/utils/cn';
import { QuestionRenderer } from '../../../../components/review/QuestionRenderer';
import { MarkdownRenderer } from '../../../../components/LatexRenderer';
import { DifficultyBadge } from '../../../../components/ui/DifficultyBadge';
import { getEntityVisuals } from '../../../../app/utils/colorSystem';
import { useShortcut } from '../../../../app/hooks/useShortcut';
import type { ProcessedImportItem, WorkbenchMode } from '../../state/importTypes';
import type { ValidationIssue } from '../../../../lib/importUtils';
import { AlertTriangle, ChevronLeft, ChevronRight, Target, PanelRightClose } from 'lucide-react';

export interface SimulationPanelProps {
    // Data
    activeItem: ProcessedImportItem;
    validationErrors: ValidationIssue[];

    // UI State
    workbenchMode: WorkbenchMode;
    previewUserAnswer: unknown;
    previewRevealed: boolean;

    // Actions
    onSetPreviewUserAnswer: (answer: unknown) => void;
    onSetPreviewRevealed: (revealed: boolean) => void;
    onJumpToProblem: (direction: 'next' | 'prev') => void;
    onFocusField: (field: string) => void;
    onToggleWorkbenchMode: () => void; // New action
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
    activeItem,
    validationErrors,
    workbenchMode,
    previewUserAnswer,
    previewRevealed,
    onSetPreviewUserAnswer,
    onSetPreviewRevealed,
    onJumpToProblem,
    onFocusField,
    onToggleWorkbenchMode,
}) => {
    const { t } = useTranslation(['import', 'common', 'renderer']);
    const { matchesShortcut } = useShortcut();

    // Hotkey listener for 'r' to toggle reveal/reset
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            // Ignore if typing in input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (matchesShortcut(e, 'inspector', 'toggle_answer')) {
                e.preventDefault();
                onSetPreviewRevealed(!previewRevealed);
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [previewRevealed, onSetPreviewRevealed, matchesShortcut]);

    const hasErr = validationErrors.some(v => v.level === 'error');
    const hasWarn = validationErrors.some(v => v.level === 'warning');

    return (
        <div className={cn(
            "flex flex-col bg-base-200/5 overflow-hidden relative shadow-inner transition-all duration-700 ease-spring",
            workbenchMode === 'preview' ? "flex-1" : (workbenchMode === 'edit' ? "w-0 overflow-hidden opacity-0 invisible" : "flex-1"),
            hasErr && "bg-rose-500/5",
            hasWarn && !hasErr && "bg-amber-500/5"
        )}>
            {/* Header: Minimalist & Integrated */}
            <div className="shrink-0 h-16 px-6 border-b border-base-content/5 flex items-center justify-between bg-base-100/40 backdrop-blur-3xl z-20">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-[9px] font-black opacity-30 uppercase tracking-[0.2em]">
                            <Brain size={12} />
                            {t('import:import.preview.simulation_view')}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] font-black tabular-nums opacity-40 uppercase tracking-widest text-base-content/60">
                                {t('import:import.preview.label_row')} #{activeItem.__row}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-base-content/10" />
                            <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-lg",
                                "bg-primary/10 text-primary"
                            )}>
                                {t(`common:common.type.${activeItem.question.question_type}`, { defaultValue: activeItem.question.question_type?.toUpperCase() })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onToggleWorkbenchMode}
                        className={cn(
                            "w-10 h-10 rounded-xl bg-base-content/5 hover:bg-base-content/10 flex items-center justify-center text-base-content/40 hover:text-primary transition-all active:scale-95",
                            workbenchMode === 'preview' && "bg-primary/10 text-primary"
                        )}
                        title={workbenchMode === 'preview' ? t('import:import.preview.editor_mode_guided') : t('import:import.preview.mode_preview')}
                    >
                        {workbenchMode === 'preview' ? <PanelRightClose size={18} /> : <Target size={18} />}
                    </button>

                    <div className="w-px h-4 bg-base-content/10 mx-1" />

                    <button
                        onClick={() => onSetPreviewRevealed(!previewRevealed)}
                        className={cn(
                            "group flex items-center gap-2 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all se-interactive",
                            previewRevealed
                                ? "bg-base-content/10 border-base-content/10 text-base-content/80"
                                : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                        )}
                        title={previewRevealed ? t('renderer.answer.reset') : t('renderer.answer.reveal')}
                    >
                        <RefreshCw size={10} className={cn("transition-transform duration-500", !previewRevealed && "rotate-180 opacity-40")} />
                        <span className="hidden sm:inline-block">
                            {previewRevealed ? t('renderer.answer.reset') : t('renderer.answer.reveal')}
                        </span>
                        <kbd className="ml-0.5 px-1 py-0.5 rounded bg-base-content/10 text-[7px] opacity-40 group-hover:opacity-100 transition-opacity hidden md:inline-block font-mono">r</kbd>
                    </button>
                    <div className="w-px h-4 bg-base-content/10" />
                    <DifficultyBadge level={activeItem.question.difficulty as any} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0 flex flex-col items-center relative z-10 transition-colors duration-500">
                <div className="w-full max-w-[1280px] space-y-4 pb-20 relative px-4 mt-4">
                    {/* Immersive backdrop based on subject color */}
                    <div
                        className="fixed inset-0 opacity-[0.03] blur-[120px] pointer-events-none transition-all duration-1000"
                        style={{ backgroundColor: getEntityVisuals(null, activeItem.subject_name).dot.split(' ')[0] === 'bg-base-content/30' ? 'var(--color-primary)' : '' }}
                        id="simulation-backdrop"
                    />
                    {/* Status Feedback */}
                    {validationErrors.length > 0 && (
                        <div className={cn(
                            "p-6 rounded-[2rem] space-y-4 shadow-xl backdrop-blur-md animate-in slide-in-from-top-4 duration-500 border",
                            hasErr ? "bg-rose-500/5 border-rose-500/10" : "bg-amber-500/5 border-amber-500/10"
                        )}>
                            <div className="flex items-center justify-between">
                                <div className={cn("flex items-center gap-3", hasErr ? "text-rose-500" : "text-amber-500")}>
                                    {hasErr ? <AlertCircle size={20} /> : <AlertTriangle size={20} />}
                                    <h4 className="text-sm font-black uppercase tracking-[0.2em]">
                                        {hasErr ? t('import:import.preview.status_blocked') : t('import:import.preview.status_issues_upper', { count: validationErrors.filter(v => v.level === 'warning').length })}
                                    </h4>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onJumpToProblem('prev')}
                                        className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all group/nav"
                                        title={t('import:import.preview.btn_prev_problem')}
                                    >
                                        <ChevronLeft size={18} className="group-active/nav:-translate-x-1 transition-transform" />
                                    </button>
                                    <button
                                        onClick={() => onJumpToProblem('next')}
                                        className="w-10 h-10 rounded-xl bg-base-content/5 hover:bg-primary/10 hover:text-primary flex items-center justify-center transition-all group/nav active:scale-95"
                                        title={t('import:import.preview.btn_next_problem')}
                                    >
                                        <ChevronRight size={18} className="group-hover/nav:translate-x-0.5 transition-transform" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {validationErrors.map((err, i) => (
                                    <button
                                        key={i}
                                        onClick={() => err.field && onFocusField(err.field)}
                                        className={cn(
                                            "text-left text-xs font-bold flex items-center gap-3 p-4 rounded-2xl ring-1 transition-all group/err",
                                            err.level === 'error'
                                                ? "text-rose-500/70 bg-rose-500/5 ring-rose-500/5 hover:bg-rose-500/10"
                                                : "text-amber-500/70 bg-amber-500/5 ring-amber-500/5 hover:bg-amber-500/10"
                                        )}
                                    >
                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 group-hover/err:scale-125 transition-transform", err.level === 'error' ? "bg-rose-500/30" : "bg-amber-500/30")} />
                                        <span className="flex-1">{err.message}</span>
                                        {err.field && (
                                            <div className="px-2 py-1 rounded-lg bg-base-content/20 text-[8px] font-black uppercase tracking-widest opacity-0 group-hover/err:opacity-100 transition-opacity flex items-center gap-1.5">
                                                <Target size={8} />
                                                {t('common:common.actions.locate')}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Simulation Area */}
                    <div className="animate-in fade-in zoom-in-95 duration-700 relative w-full">
                        <div className="glass-card p-4 md:p-6 lg:p-8 rounded-[2.5rem] shadow-premium-xl border-base-content/10 bg-base-100/35 backdrop-blur-3xl relative z-10 transition-all">
                            <div className="mb-8 flex items-center justify-between px-2">
                                <h2 className="text-xl font-black text-base-content/90 tracking-tight leading-tight max-w-[85%]">
                                    <MarkdownRenderer content={(activeItem.question.title as string) || t('import:import.preview.untitled_object')} className="prose-none" showTexBadge={false} />
                                </h2>
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] select-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 text-primary/60 border border-primary/10">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--color-primary),0.8)]" />
                                    {t('import:import.preview.simulation_badge', 'SIMULATION PREVIEW')}
                                </div>
                            </div>

                            <QuestionRenderer
                                key={`${activeItem.__row}`}
                                question={activeItem.question}
                                userAnswer={previewUserAnswer}
                                isRevealed={previewRevealed}
                                setUserAnswer={onSetPreviewUserAnswer}
                                onReveal={() => onSetPreviewRevealed(true)}
                                showHints={false}
                            />
                        </div>

                        {/* Tags Preview Footer - Inspired by Inspector */}
                        <div className="flex flex-wrap gap-2.5 pt-12 opacity-40 hover:opacity-100 transition-opacity justify-center">
                            {((activeItem.tag_names as string[]) || []).map((tag, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1.5 font-black text-[9px] uppercase rounded-lg bg-base-content/5 border border-base-content/5 text-base-content/60"
                                >
                                    #{tag}
                                </span>
                            ))}
                            <span className="px-3 py-1.5 font-black text-[9px] uppercase rounded-lg bg-primary/5 border border-primary/10 text-primary">
                                @{activeItem.subject_name || t('common:common.general.universal')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
