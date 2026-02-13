import React from 'react';
import {
    Sparkles, Brain,
    Lightbulb, ShieldCheck, AlertTriangle,
    Layers, Zap, MessageSquare, BookOpen,
    ChevronDown, ChevronRight, Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChoiceRenderer } from './renderers/ChoiceRenderer';
import { FillBlankRenderer } from './renderers/FillBlankRenderer';
import { ShortAnswerRenderer } from './renderers/ShortAnswerRenderer';
import { MarkdownRenderer } from '@v2/markdown-parser';
import { cn } from '../../app/utils/cn';
import { useTranslation } from 'react-i18next';
import { ImageWithFallback } from '../ui/ImageWithFallback';

interface QuestionRendererProps {
    question: any;
    userAnswer: any;
    setUserAnswer: (val: any) => void;
    isRevealed: boolean;
    onReveal: () => void;
    disableAutoFocus?: boolean;
    showHints?: boolean;
    hideExplanation?: boolean;
}

const PreviewQuestionRendererBase: React.FC<QuestionRendererProps> = ({
    question,
    userAnswer,
    setUserAnswer,
    isRevealed,
    onReveal,
    disableAutoFocus = false,
    showHints = true,
    hideExplanation = false
}) => {
    const { t } = useTranslation(['renderer', 'common', 'markdown']);
    const [visibleHints, setVisibleHints] = React.useState<number>(0);
    const [expandedAnalysisIds, setExpandedAnalysisIds] = React.useState<Set<string>>(new Set());

    // Robust parsing for different data sources (Schema V5.9 compliant)
    const q = React.useMemo(() => {
        if (!question) return null;

        let ca = question.correct_answer;
        if (typeof ca === 'string' && ca.startsWith('{')) {
            try { ca = JSON.parse(ca); } catch { ca = { text: ca }; }
        } else if (typeof ca === 'string') {
            ca = { text: ca };
        }

        let hintsObj = question.hints;
        if (typeof hintsObj === 'string') {
            try { hintsObj = JSON.parse(hintsObj); } catch { /* fallback */ }
        }

        // Safety normalization for hints.choices (handles Record format)
        if (hintsObj && typeof hintsObj === 'object' && hintsObj.choices && !Array.isArray(hintsObj.choices)) {
            const normalizedChoices: Array<{ id: string; text: string }> = [];
            for (const [id, text] of Object.entries(hintsObj.choices)) {
                normalizedChoices.push({ id, text: String(text) });
            }
            hintsObj = { ...hintsObj, choices: normalizedChoices };
        }

        const correctIds = ca?.choice_ids || (ca?.choice_id ? [ca.choice_id] : []);
        const isMultiple = ca?.choice_ids?.length > 1 || question.metadata?.is_multiple === true;

        return { ...question, correct_answer: ca, hints: hintsObj, correctIds, isMultiple };
    }, [question]);

    React.useEffect(() => {
        setVisibleHints(0);
        setExpandedAnalysisIds(new Set());
    }, [question?.id]);

    // Auto-expand relevant analysis when revealed
    React.useEffect(() => {
        if (isRevealed && q) {
            const relevant = new Set<string>(q.correctIds || []);
            if (userAnswer) {
                if (Array.isArray(userAnswer)) {
                    userAnswer.forEach(id => typeof id === 'string' && relevant.add(id));
                } else if (typeof userAnswer === 'string') {
                    relevant.add(userAnswer);
                }
            }
            setExpandedAnalysisIds(relevant);
        }
    }, [isRevealed, q, userAnswer]);

    if (!q) return null;

    const hintList = Array.isArray(q.hints)
        ? q.hints
        : (q.hints?.hints || []);
    const hasHints = hintList.length > 0;
    const lastMistake = q.last_wrong_answer; // From card record

    const renderPersonalContext = () => {
        if (isRevealed || !lastMistake) return null;
        return (
            <div className="mb-10 p-4 rounded-2xl bg-warning/[0.03] border border-warning/10 shadow-inner-white animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-lg bg-warning/20 flex items-center justify-center text-warning">
                        <MessageSquare size={10} className="fill-warning/30" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-warning/80">
                        {t('renderer.header.echo')}: {t('renderer.header.last_mistake')}
                    </span>
                    <div className="flex-1 h-px bg-warning/10 mx-2" />
                    <span className="italic text-[11px] text-warning font-semibold truncate max-w-[50%]">"{lastMistake}"</span>
                </div>
            </div>
        );
    };

    const renderHints = () => {
        if (!hasHints || !showHints) return null;

        const showAll = isRevealed;
        const displayCount = showAll ? hintList.length : visibleHints;

        return (
            <div className="my-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6 ml-1 group/header select-none">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover/header:bg-primary/20 group-hover/header:scale-110 transition-all duration-300 shadow-sm">
                        <Lightbulb size={14} className="text-primary fill-primary/20" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/80 group-hover/header:text-primary transition-colors">
                            {t('renderer.sections.hints', 'Thought Process')}
                        </h4>
                        <div className="h-0.5 w-full bg-gradient-to-r from-primary/20 to-transparent mt-1 rounded-full" />
                    </div>
                </div>

                <div className="relative rounded-[24px] overflow-hidden border border-base-content/5 bg-base-100/40 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:bg-base-100/60">
                    {/* Decorative background accent */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] rounded-full pointer-events-none -mr-16 -mt-16" />

                    <div className="p-1">
                        {displayCount > 0 ? (
                            <div className="space-y-1 stagger-children" role="log" aria-live="polite" aria-label={t('renderer.hints.revealed_hints', 'Revealed hints')}>
                                {hintList.slice(0, displayCount).map((hint: string, i: number) => (
                                    <div key={i} className="flex gap-4 p-5 rounded-[20px] bg-primary/[0.03] border border-primary/5 hover:border-primary/10 transition-colors group/item">
                                        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary shadow-inner border border-primary/5 mt-0.5 group-hover/item:scale-110 transition-transform">
                                            <span className="text-[10px] font-black">{i + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-1.5 opacity-60">
                                                {t('renderer.hints.fragment', { n: i + 1 })}
                                            </div>
                                            <MarkdownRenderer
                                                content={hint}
                                                density="compact"
                                                className="!prose-sm text-base-content/90 font-medium leading-relaxed"
                                                t={t}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Empty state / Initial state decor
                            <div className="px-6 py-8 flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                                <Sparkles size={20} className="text-primary/40 animate-pulse" />
                                <p className="text-xs font-medium text-base-content/40 max-w-[200px] leading-relaxed">
                                    {t('renderer.hints.unlock_msg', 'Unlock insights to guide your reasoning path.')}
                                </p>
                            </div>
                        )}

                        {/* Reveal Action Area */}
                        {!isRevealed && displayCount < hintList.length && (
                            <div className="p-3 mt-1">
                                <button
                                    onClick={() => setVisibleHints(prev => Math.min(prev + 1, hintList.length))}
                                    disabled={visibleHints >= hintList.length}
                                    className={cn(
                                        "w-full group/btn relative overflow-hidden flex items-center justify-center gap-3 py-3.5 rounded-[20px] border transition-all duration-300 select-none active:scale-[0.99]",
                                        visibleHints < hintList.length
                                            ? "bg-primary text-primary-content border-primary/20 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
                                            : "bg-base-200 border-transparent text-base-content/20 cursor-not-allowed"
                                    )}
                                >
                                    {/* Shimmer effect */}
                                    <div className="absolute inset-0 -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

                                    <Sparkles size={16} className={cn("relative z-20 transition-transform group-hover/btn:rotate-12", visibleHints < hintList.length && "animate-pulse")} />
                                    <span className="relative z-20 text-xs font-black uppercase tracking-[0.15em]">
                                        {visibleHints === 0
                                            ? t('renderer.hints.get_hint', 'Reveal Hint')
                                            : `${t('renderer.hints.refine_logic', 'Next Hint')} (${visibleHints}/${hintList.length})`}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderExplanation = () => {
        if (hideExplanation || !isRevealed || (!q.explanation && !q.explanation_image_url)) return null;

        return (
            <div className="mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 group/sec">
                    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-accent/5 border border-accent/5 group-hover/sec:bg-accent/10 group-hover/sec:border-accent/20 transition-all duration-500">
                        <Sparkles size={14} className="text-accent/60" />
                        <span className="text-[10px] font-black text-base-content/60 group-hover/sec:text-accent uppercase tracking-[0.2em]">
                            {String(t('renderer.sections.explanation'))}
                        </span>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-base-content/10 via-base-content/5 to-transparent" />
                </div>

                <div className="space-y-6">
                    {q.explanation && (
                        <div className="se-explanation-area bg-accent/[0.02] p-8 rounded-[2rem] border border-accent/10 relative overflow-hidden group/exp">
                            {/* Subtle background decoration */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl -mr-16 -mt-16 rounded-full pointer-events-none group-hover/exp:bg-accent/10 transition-colors duration-500" />

                            <MarkdownRenderer
                                content={q.explanation}
                                density="comfortable"
                                className="!prose-sm text-base-content/90 leading-relaxed relative z-10"
                                t={t}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderAnalysis = () => {
        if (!isRevealed) return null;

        const analysis = q.hints?.optionAnalysis;
        const choices = q.hints?.choices || [];
        if (!analysis || choices.length === 0) return null;

        const toggleAll = () => {
            if (expandedAnalysisIds.size === choices.length) {
                setExpandedAnalysisIds(new Set());
            } else {
                setExpandedAnalysisIds(new Set(choices.map((c: any) => c.id)));
            }
        };

        const toggleId = (id: string) => {
            setExpandedAnalysisIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        };

        return (
            <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between group/sec pr-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/5 group-hover/sec:bg-primary/10 group-hover/sec:border-primary/20 transition-all duration-500">
                            <Brain size={14} className="text-primary/60" />
                            <span className="text-[10px] font-black text-base-content/60 group-hover/sec:text-primary uppercase tracking-[0.2em]">
                                {String(t('renderer.analysis.title'))}
                            </span>
                        </div>
                        <div className="h-px w-24 bg-gradient-to-r from-base-content/10 to-transparent" />
                    </div>

                    <button
                        onClick={toggleAll}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-base-content/5 transition-colors text-[9px] font-black uppercase tracking-widest text-base-content/30 hover:text-primary"
                    >
                        {expandedAnalysisIds.size === choices.length ? <EyeOff size={12} /> : <Eye size={12} />}
                        {expandedAnalysisIds.size === choices.length ? t('common.actions.collapse_all') : t('common.actions.expand_all')}
                    </button>
                </div>

                <div className="space-y-4 relative pl-4 md:pl-10">
                    {/* Trace Line - Slimmer & More subtle */}
                    <div className="absolute left-8 md:left-4 top-0 bottom-0 w-[1px] bg-gradient-to-b from-primary/10 via-base-content/5 to-transparent rounded-full" />

                    {choices.map((choice: any, index: number) => {
                        const info = analysis[choice.id];
                        if (!info) return null;
                        const isCorrect = q.correctIds.includes(choice.id);
                        const isSelected = Array.isArray(userAnswer) ? userAnswer.includes(choice.id) : userAnswer === choice.id;
                        const isExpanded = expandedAnalysisIds.has(choice.id);

                        return (
                            <div key={choice.id} className={cn(
                                "group relative transition-all duration-500 rounded-3xl",
                                isSelected && !isCorrect && "bg-error/[0.01]",
                                isSelected && isCorrect && "bg-success/[0.01]"
                            )}>
                                <div className="flex gap-4 md:gap-5">
                                    <button
                                        onClick={() => toggleId(choice.id)}
                                        className={cn(
                                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[11px] transition-all duration-500 border relative z-10",
                                            isCorrect ? "bg-success/10 text-success border-success/20 shadow-sm shadow-success/10" :
                                                isSelected ? "bg-error/10 text-error border-error/20" :
                                                    "bg-base-content/5 text-base-content/40 border-base-content/5"
                                        )}
                                    >
                                        {String.fromCharCode(65 + index)}
                                        {isSelected && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-base-100" />}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <div
                                            onClick={() => toggleId(choice.id)}
                                            className="flex items-center gap-3 cursor-pointer select-none group/item-header"
                                        >
                                            <div className={cn(
                                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border transition-all",
                                                isCorrect ? "bg-success/5 border-success/10 text-success/60" : "bg-error/5 border-error/10 text-error/60"
                                            )}>
                                                {isCorrect ? <ShieldCheck size={10} /> : <AlertTriangle size={10} />}
                                                {isCorrect ? String(t('renderer.analysis.valid')) : String(t('renderer.analysis.fallacy'))}
                                            </div>

                                            {isSelected && (
                                                <span className="text-[8px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10">
                                                    {t('renderer.analysis.your_choice')}
                                                </span>
                                            )}

                                            <div className="flex-1" />

                                            <div className="p-1 rounded-md group-hover/item-header:bg-base-content/5 transition-colors">
                                                {isExpanded ? <ChevronDown size={14} className="text-base-content/20" /> : <ChevronRight size={14} className="text-base-content/20" />}
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: "circOut" }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="se-analysis-content mt-3 mb-2 pb-2">
                                                        <MarkdownRenderer
                                                            content={info.why || info.reason || String(t('renderer.analysis.no_analysis'))}
                                                            density="comfortable"
                                                            className="!prose-sm text-[13px] text-base-content/80 leading-relaxed font-medium"
                                                            t={t}
                                                        />
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    let content = null;
    switch (q.question_type) {
        case 'choice':
            content = (
                <div className="stagger-children">
                    <ChoiceRenderer
                        choices={q.hints?.choices || []}
                        userAnswer={userAnswer}
                        correctAnswerIds={q.correctIds}
                        isRevealed={isRevealed}
                        onSelect={setUserAnswer}
                        isMultiple={q.isMultiple}
                    />
                </div>
            );
            break;

        case 'fill_blank': {
            const blanks = q.correct_answer?.blanks || [];
            content = (
                <FillBlankRenderer
                    blanks={blanks}
                    userAnswer={Array.isArray(userAnswer) ? userAnswer : []}
                    correctAnswers={blanks}
                    isRevealed={isRevealed}
                    onUpdate={(idx: number, val: string) => {
                        const newAns = [...(Array.isArray(userAnswer) ? userAnswer : [])];
                        newAns[idx] = val;
                        setUserAnswer(newAns);
                    }}
                    onEnter={onReveal}
                    placeholder={t('renderer.fill_blank.placeholder')}
                    disableAutoFocus={disableAutoFocus}
                />
            );
            break;
        }

        case 'short_answer': {
            const answer = q.correct_answer?.answers?.[0] || q.correct_answer?.text || q.correct_answer_text || '';
            content = (
                <ShortAnswerRenderer
                    userAnswer={typeof userAnswer === 'string' ? userAnswer : ''}
                    correctAnswer={answer}
                    isRevealed={isRevealed}
                    onChange={setUserAnswer}
                    onEnter={onReveal}
                    placeholder={t('renderer.short_answer.placeholder')}
                />
            );
            break;
        }

        default:
            content = (
                <div className="py-16 px-8 flex flex-col items-center justify-center gap-6 text-center animate-in fade-in duration-700">
                    <div className="relative">
                        <div className="absolute inset-0 bg-base-content/5 blur-3xl rounded-full animate-pulse" />
                        <div className="relative w-16 h-16 bg-base-100 border border-base-content/10 rounded-3xl flex items-center justify-center text-base-content/20 shadow-premium-lg">
                            <Layers size={28} strokeWidth={1} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[12px] font-black uppercase tracking-[0.4em] text-base-content/30 italic">
                            {t('renderer.empty.title')}
                        </div>
                        <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-base-content/5 rounded-full border border-base-content/5">
                            <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                            <span className="text-[10px] font-mono font-bold opacity-40 text-base-content tracking-tighter uppercase">
                                Diagnostic Error: {q.question_type?.toUpperCase() || 'NULL_TYPE'}
                            </span>
                        </div>
                    </div>
                </div>
            );
    }

    return (
        <div className="reveal-smooth">
            {renderPersonalContext()}

            <div className="mb-14">
                <div className="se-content-area space-y-8">
                    {/* STEM HEADER - Unified Premium Style */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 group/sec select-none">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-base-content/5 border border-base-content/5 group-hover/sec:bg-primary/10 group-hover/sec:border-primary/20 transition-all duration-500">
                                <BookOpen size={14} className="text-primary/60" />
                                <span className="text-[10px] font-black text-base-content/60 group-hover/sec:text-primary uppercase tracking-[0.2em]">
                                    {String(t('renderer.sections.stem_init', 'Content'))}
                                </span>
                            </div>

                            {q.stability !== undefined ? (
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="h-px w-8 sm:w-16 bg-gradient-to-r from-base-content/10 to-transparent" />
                                    <div className="flex items-center gap-2">
                                        <div className="h-1 w-12 bg-base-content/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-success/40 transition-all duration-1000"
                                                style={{ width: `${Math.min(100, Math.max(5, q.stability * 2))}%` }}
                                            />
                                        </div>
                                        <span className="text-[8px] font-bold text-base-content/20 uppercase tracking-tighter">
                                            {String(t('renderer.sections.mastery', 'Mastery'))}: {Math.round(q.stability)}d
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="hidden sm:block h-px flex-1 bg-gradient-to-r from-base-content/10 to-transparent" />
                            )}
                        </div>

                        {/* Metadata Pills - Consolidated */}
                        <div className="flex flex-wrap items-center gap-2">
                            {q.subject && (
                                <div className="px-2.5 py-1 rounded-lg bg-base-content/5 border border-base-content/5 text-[9px] font-bold text-base-content/40 uppercase tracking-wider">
                                    {q.subject}
                                </div>
                            )}
                            {q.type && (
                                <div className="px-2.5 py-1 rounded-lg bg-base-content/5 border border-base-content/5 text-[9px] font-black text-primary/40 uppercase tracking-wider">
                                    {String(t(`common.type.${q.type}`, q.type))}
                                </div>
                            )}
                            {q.difficulty && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider shadow-sm transition-all",
                                    q.difficulty === 'hard' ? "bg-error/5 border-error/10 text-error/60" :
                                        q.difficulty === 'medium' ? "bg-warning/5 border-warning/10 text-warning/60" :
                                            "bg-success/5 border-success/10 text-success/60"
                                )}>
                                    <Zap size={10} />
                                    {String(t(`common.difficulty.${q.difficulty}`)) || q.difficulty}
                                </div>
                            )}
                        </div>
                    </div>

                    <MarkdownRenderer
                        content={q.content || ''}
                        density="comfortable"
                        className="!prose-lg !max-w-none text-base-content font-medium leading-relaxed"
                        t={t}
                    />

                    {/* Primary Question Image */}
                    {(q.image_url || q.metadata?.image_url) && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                            <ImageWithFallback
                                src={q.image_url || q.metadata?.image_url}
                                alt="Question Resource"
                                containerClassName="max-w-3xl mx-auto shadow-premium-xl"
                            />
                        </div>
                    )}
                </div>
            </div>

            {renderHints()}

            <div className="relative min-h-[100px] se-interaction-area">
                {content}
            </div>

            {/* Immediate Diagnostic Feedback */}
            {isRevealed && renderAnalysis()}

            {/* Comprehensive Theoretical Context */}
            {isRevealed && (
                <div className="mt-14 pt-12 border-t border-base-content/5 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    {renderExplanation()}
                </div>
            )}
        </div>
    );
};

export const QuestionRenderer = React.memo(PreviewQuestionRendererBase);
QuestionRenderer.displayName = 'QuestionRenderer';
