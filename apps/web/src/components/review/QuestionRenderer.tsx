import React from 'react';
import {
    Sparkles, Brain,
    Lightbulb, ShieldCheck, AlertTriangle,
    Layers, Zap, MessageSquare
} from 'lucide-react';
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
    const { t } = useTranslation();
    const [visibleHints, setVisibleHints] = React.useState<number>(0);

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
    }, [question?.id]);

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
            <div className="my-10 space-y-6">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/30 mb-6 ml-1 group/header">
                    <div className="w-6 h-6 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10 group-hover/header:bg-primary/10 transition-colors">
                        <Lightbulb size={12} strokeWidth={2.5} />
                    </div>
                    {t('renderer.sections.hints', 'Thought Process')}
                </div>

                {displayCount > 0 && (
                    <div className="space-y-3 stagger-children" role="log" aria-live="polite" aria-label={t('renderer.hints.revealed_hints', 'Revealed hints')}>
                        {hintList.slice(0, displayCount).map((hint: string, i: number) => (
                            <div key={i} className="flex gap-4 p-5 rounded-2xl bg-primary/[0.02] border border-primary/5 shadow-inner-white group hover:bg-primary/[0.04] transition-all duration-300 motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:fade-in">
                                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary shadow-sm border border-primary/10">
                                    <div className="text-[10px] font-black">{i + 1}</div>
                                </div>
                                <div className="flex-1">
                                    <div className="text-[9px] font-black text-primary/40 uppercase tracking-widest mb-1.5">{t('renderer.hints.fragment', { n: i + 1 })}</div>
                                    <MarkdownRenderer
                                        content={hint}
                                        density="compact"
                                        className="!prose-sm text-primary/80 font-medium leading-relaxed"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!isRevealed && displayCount < hintList.length && (
                    <div className="flex items-center justify-center py-2">
                        <button
                            onClick={() => setVisibleHints(prev => Math.min(prev + 1, hintList.length))}
                            disabled={visibleHints >= hintList.length}
                            className={cn(
                                "group flex items-center gap-3 px-6 py-2.5 rounded-2xl border transition-all duration-500 active:scale-95 select-none se-interactive h-11",
                                visibleHints < hintList.length
                                    ? "bg-primary/5 border-primary/10 text-primary hover:bg-primary/10 hover:border-primary/30 shadow-premium-sm"
                                    : "bg-base-content/5 border-transparent text-base-content/10 cursor-not-allowed"
                            )}
                        >
                            <Sparkles size={14} className={cn("transition-transform group-hover:rotate-12", visibleHints < hintList.length && "animate-pulse")} />
                            <span className="text-[11px] font-black uppercase tracking-widest">
                                {visibleHints === 0
                                    ? t('renderer.hints.get_hint')
                                    : `${t('renderer.hints.refine_logic')} (${visibleHints}/${hintList.length})`}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const renderExplanation = () => {
        if (hideExplanation || !isRevealed || (!q.explanation && !q.explanation_image_url)) return null;

        return (
            <div className="mt-12 pt-8 border-t border-base-content/5 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
                        <Zap size={14} className="text-accent" />
                    </div>
                    <div className="flex flex-col">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-base-content">
                            {t('renderer.sections.explanation', 'Detailed Analysis')}
                        </h4>
                        <span className="text-[8px] font-bold opacity-30 uppercase tracking-widest leading-tight">
                            {t('renderer.sections.expert_insight', 'Cognitive reconstruction output')}
                        </span>
                    </div>
                </div>

                <div className="space-y-6">
                    {q.explanation && (
                        <div className="px-5 py-6 rounded-[2rem] bg-accent/[0.02] border border-accent/5 shadow-inner-white font-medium">
                            <MarkdownRenderer
                                content={q.explanation}
                                density="comfortable"
                                className="!prose-sm text-base-content leading-relaxed"
                            />
                        </div>
                    )}

                    {(q.explanation_image_url || q.correct_answer_image_url) && (
                        <div className="space-y-6">
                            {q.explanation_image_url && (
                                <div className="animate-in fade-in zoom-in-95 duration-700">
                                    <ImageWithFallback
                                        src={q.explanation_image_url}
                                        alt="Explanation Resource"
                                        containerClassName="max-w-2xl mx-auto shadow-premium-lg rounded-2xl overflow-hidden"
                                    />
                                </div>
                            )}
                            {q.correct_answer_image_url && (
                                <div className="animate-in fade-in zoom-in-95 duration-700">
                                    <div className="text-[9px] font-black uppercase tracking-widest opacity-30 text-center mb-3">{t('renderer.sections.answer_visual', 'Answer Reference Visual')}</div>
                                    <ImageWithFallback
                                        src={q.correct_answer_image_url}
                                        alt="Correct Answer Resource"
                                        containerClassName="max-w-xl mx-auto shadow-premium-md rounded-xl overflow-hidden border border-success/10"
                                    />
                                </div>
                            )}
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

        return (
            <div className="mt-10 pt-8 border-t border-base-content/5 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-xl bg-primary/5 flex items-center justify-center border border-primary/10">
                        <Brain size={14} className="text-primary/60" />
                    </div>
                    <div className="flex flex-col">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-base-content">
                            {t('renderer.analysis.title')}
                        </h4>
                        <span className="text-[8px] font-bold opacity-30 uppercase tracking-widest leading-tight">
                            {t('renderer.analysis.reconstruction_complete')}
                        </span>
                    </div>
                </div>

                <div className="space-y-6 relative pl-10">
                    {/* Trace Line - Slimmer & More subtle */}
                    <div className="absolute left-4 top-0 bottom-0 w-[1.5px] bg-gradient-to-b from-primary/20 via-base-content/5 to-transparent rounded-full" />

                    {choices.map((choice: any, index: number) => {
                        const info = analysis[choice.id];
                        if (!info) return null;
                        const isCorrect = q.correctIds.includes(choice.id);

                        return (
                            <div key={choice.id} className="group relative transition-all duration-300">
                                <div className="flex gap-5">
                                    <div className={cn(
                                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-black text-[11px] transition-all duration-300 border",
                                        isCorrect ? "bg-success/10 text-success border-success/20" : "bg-error/10 text-error border-error/20"
                                    )}>
                                        {String.fromCharCode(65 + index)}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center">
                                            <div className={cn(
                                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border",
                                                isCorrect ? "bg-success/5 border-success/10 text-success/60" : "bg-error/5 border-error/10 text-error/60"
                                            )}>
                                                {isCorrect ? <ShieldCheck size={10} /> : <AlertTriangle size={10} />}
                                                {isCorrect ? t('renderer.analysis.valid') : t('renderer.analysis.fallacy')}
                                            </div>
                                        </div>
                                        <div className="se-analysis-content mb-1">
                                            <MarkdownRenderer
                                                content={info.why || info.reason || t('renderer.analysis.no_analysis')}
                                                density="comfortable"
                                                className="!prose-sm text-[13px] text-base-content/90 leading-relaxed font-medium"
                                            />
                                        </div>
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
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/30 mb-6 ml-1 group/header">
                    <div className="w-6 h-6 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10 group-hover/header:bg-primary/10 transition-colors">
                        <Layers size={12} strokeWidth={2.5} />
                    </div>
                    {t('renderer.sections.content')}
                </div>
                <div className="se-content-area space-y-8">
                    <MarkdownRenderer
                        content={q.content || ''}
                        density="comfortable"
                        className="!prose-lg !max-w-none text-base-content font-medium leading-relaxed"
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
            {renderExplanation()}

            <div className="relative min-h-[140px] se-interaction-area">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary/30 mb-6 ml-1 group/header">
                    <div className="w-6 h-6 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10 group-hover/header:bg-primary/10 transition-colors">
                        <Zap size={12} strokeWidth={2.5} className="fill-primary/10" />
                    </div>
                    {t('renderer.sections.interaction')}
                </div>
                {content}
            </div>

            {renderAnalysis()}
        </div>
    );
};

export const QuestionRenderer = React.memo(PreviewQuestionRendererBase);
QuestionRenderer.displayName = 'QuestionRenderer';
