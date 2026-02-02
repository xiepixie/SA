import React, { useMemo } from 'react';
import { Plus, Trash2, AlertCircle, Lightbulb, Layers, Zap, ShieldCheck } from 'lucide-react';
import { cn } from '../../app/utils/cn';
import { useTranslation } from 'react-i18next';
import { SectionHeader } from './InspectorField';

interface Choice {
    id: string;
    text: string;
}

interface OptionAnalysis {
    [choiceId: string]: {
        why?: string;
    };
}

interface Hints {
    choices?: Choice[];
    optionAnalysis?: OptionAnalysis;
    hints?: string[];  // Overall question hints array
}

interface CorrectAnswer {
    type?: 'choice' | 'fill_blank' | 'short_answer';
    choice_ids?: string[];
    choice_id?: string;
    blanks?: string[];
    answers?: string[];
    text?: string;
}

interface ChoicesEditorProps {
    hints: Hints | null | undefined;
    correctAnswer: CorrectAnswer | null | undefined;
    explanation?: string | null;
    questionType: 'choice' | 'fill_blank' | 'short_answer';
    onHintsChange: (hints: Hints) => void;
    onCorrectAnswerChange: (answer: CorrectAnswer) => void;
    onExplanationChange?: (explanation: string) => void;
    disabled?: boolean;
    instanceId?: string;
}

/**
 * Visual editor for question choices and correct answers
 * Replaces raw JSON editing with a user-friendly interface
 */
export const ChoicesEditor: React.FC<ChoicesEditorProps> = ({
    hints,
    correctAnswer,
    explanation,
    questionType,
    onHintsChange,
    onCorrectAnswerChange,
    onExplanationChange,
    disabled = false,
    instanceId = 'choices-editor'
}) => {
    const { t } = useTranslation();

    const choices = useMemo(() => hints?.choices || [], [hints]);
    const selectedIds = useMemo(() => {
        if (!correctAnswer) return [];
        if (Array.isArray(correctAnswer.choice_ids)) return correctAnswer.choice_ids;
        if (correctAnswer.choice_id) return [correctAnswer.choice_id];
        return [];
    }, [correctAnswer]);
    const blanks = useMemo(() => correctAnswer?.blanks || [], [correctAnswer]);
    const optionAnalysis = useMemo(() => hints?.optionAnalysis || {}, [hints]);
    const questionHints = useMemo(() => hints?.hints || [], [hints]); // Overall question hints

    // Generate next choice ID (c1, c2, c3...)
    const getNextChoiceId = () => {
        const usedIds = new Set(choices.map(c => c.id));
        for (let i = 1; i <= 100; i++) {
            const id = `c${i}`;
            if (!usedIds.has(id)) return id;
        }
        return `c${Date.now()}`;
    };

    // === Choice Handlers ===
    const addChoice = () => {
        const newChoice: Choice = { id: getNextChoiceId(), text: '' };
        onHintsChange({
            ...(hints || {}),
            choices: [...choices, newChoice]
        });
    };

    const updateChoice = (id: string, text: string) => {
        onHintsChange({
            ...(hints || {}),
            choices: choices.map(c => c.id === id ? { ...c, text } : c)
        });
    };

    const updateChoiceId = (oldId: string, newId: string) => {
        // We still allow it to update in the state so the input reflects user typing
        // Even if it's a duplicate, we let it through and mark it in validation later
        onHintsChange({
            ...(hints || {}),
            choices: choices.map(c => c.id === oldId ? { ...c, id: newId } : c),
            optionAnalysis: Object.fromEntries(
                Object.entries(optionAnalysis).map(([key, val]) => [key === oldId ? newId : key, val])
            )
        });

        const updates: any = {};
        if (correctAnswer?.choice_id === oldId) updates.choice_id = newId;
        if (Array.isArray(correctAnswer?.choice_ids) && correctAnswer.choice_ids.includes(oldId)) {
            updates.choice_ids = correctAnswer.choice_ids.map(cid => cid === oldId ? newId : cid);
        }

        if (Object.keys(updates).length > 0) {
            onCorrectAnswerChange({
                ...correctAnswer,
                ...updates
            });
        }
    };

    const removeChoice = (id: string) => {
        onHintsChange({
            ...(hints || {}),
            choices: choices.filter(c => c.id !== id),
            optionAnalysis: Object.fromEntries(
                Object.entries(optionAnalysis).filter(([key]) => key !== id)
            )
        });
        // Also remove from correct answers if selected
        if (selectedIds.includes(id)) {
            onCorrectAnswerChange({
                ...correctAnswer,
                type: 'choice',
                choice_ids: selectedIds.filter(cid => cid !== id)
            });
        }
    };

    const toggleCorrectChoice = (id: string) => {
        const nextIds = selectedIds.includes(id)
            ? selectedIds.filter(cid => cid !== id)
            : [...selectedIds, id];
        onCorrectAnswerChange({
            type: 'choice',
            choice_ids: nextIds
        });
    };

    const updateOptionAnalysis = (id: string, why: string) => {
        onHintsChange({
            ...(hints || {}),
            optionAnalysis: {
                ...optionAnalysis,
                [id]: { why }
            }
        });
    };

    // === Overall Hints Handlers ===
    const addQuestionHint = () => {
        onHintsChange({
            ...(hints || {}),
            hints: [...questionHints, '']
        });
    };

    const updateQuestionHint = (index: number, value: string) => {
        const newHints = [...questionHints];
        newHints[index] = value;
        onHintsChange({
            ...(hints || {}),
            hints: newHints
        });
    };

    const removeQuestionHint = (index: number) => {
        onHintsChange({
            ...(hints || {}),
            hints: questionHints.filter((_, i) => i !== index)
        });
    };

    // === Fill Blank Handlers ===
    const addBlank = () => {
        onCorrectAnswerChange({
            type: 'fill_blank',
            blanks: [...blanks, '']
        });
    };

    const updateBlank = (index: number, value: string) => {
        const newBlanks = [...blanks];
        newBlanks[index] = value;
        onCorrectAnswerChange({
            type: 'fill_blank',
            blanks: newBlanks
        });
    };

    const removeBlank = (index: number) => {
        onCorrectAnswerChange({
            type: 'fill_blank',
            blanks: blanks.filter((_, i) => i !== index)
        });
    };

    const renderQuestionHintsUI = () => (
        <div className="space-y-4 pt-4 border-t border-base-content/5">
            <SectionHeader
                icon={<Lightbulb />}
                title={t('library.inspector.edit.hints_title', 'Logical Hints')}
                value={questionHints.length > 0 ? t('library.inspector.edit.hint_count', { count: questionHints.length }) : t('common.status.none')}
            />

            <div className="space-y-3">
                {questionHints.map((hint, index) => (
                    <div
                        key={index}
                        className="group flex gap-4 p-4 rounded-2xl bg-base-content/[0.02] border border-base-content/5 hover:border-base-content/10 transition-all"
                    >
                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center text-[10px] font-black shrink-0 border border-orange-500/10">
                            {index + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                            <textarea
                                id={`${instanceId}-hint-${index}`}
                                name={`${instanceId}-hint-${index}`}
                                value={hint}
                                onChange={(e) => updateQuestionHint(index, e.target.value)}
                                disabled={disabled}
                                rows={1}
                                placeholder={t('library.inspector.edit.hint_placeholder', '描述此步骤的逻辑引导...')}
                                className="w-full bg-transparent border-none outline-none text-sm font-medium placeholder:text-base-content/20 py-1 resize-none leading-relaxed"
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = target.scrollHeight + 'px';
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeQuestionHint(index)}
                            disabled={disabled}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base-content/20 hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addQuestionHint}
                disabled={disabled}
                className={cn(
                    "w-full h-14 rounded-2xl border-2 border-dashed border-primary/10",
                    "flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest",
                    "text-primary/40 hover:text-primary hover:border-primary/30 hover:bg-primary/5 hover:scale-[1.01]",
                    "transition-all duration-300 active:scale-95",
                    disabled && "cursor-not-allowed opacity-50"
                )}
            >
                <Plus size={16} />
                {t('library.inspector.edit.add_hint', 'Add Logical Hint')}
            </button>
        </div>
    );

    // === Render Choice Mode ===
    if (questionType === 'choice') {
        return (
            <div className="space-y-6">
                {/* 1. Choices Section */}
                <div className="space-y-4">
                    <SectionHeader
                        icon={<Layers />}
                        title={t('library.inspector.edit.choices_title', 'Answer Choices')}
                        value={choices.length > 0 ? t('library.inspector.edit.choice_count', { count: choices.length }) : t('common.status.none')}
                    />

                    <div className="space-y-4">
                        {choices.map((choice, index) => {
                            const isCorrect = selectedIds.includes(choice.id);
                            const analysis = optionAnalysis[choice.id];
                            const displayId = choice.id.toUpperCase();
                            const isDuplicate = choices.filter(c => c.id.toLowerCase() === choice.id.toLowerCase()).length > 1;
                            const isEmpty = !choice.id.trim();

                            return (
                                <div
                                    key={index}
                                    className={cn(
                                        "group rounded-2xl border transition-all duration-300 relative",
                                        isCorrect
                                            ? "bg-success/[0.04] border-success/30 shadow-premium-sm ring-1 ring-success/10"
                                            : "bg-base-content/[0.02] border-base-content/5 hover:bg-base-content/[0.04]"
                                    )}
                                >
                                    {isCorrect && (
                                        <div className="absolute top-0 left-0 w-1 h-full bg-success" />
                                    )}
                                    <div className="flex p-4 gap-4">
                                        {/* Status & ID Column */}
                                        <div className="flex flex-col items-center gap-3 shrink-0 py-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleCorrectChoice(choice.id)}
                                                disabled={disabled}
                                                className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-300",
                                                    isCorrect
                                                        ? "bg-success text-white shadow-lg shadow-success/20 ring-2 ring-success/20"
                                                        : "bg-base-content/5 text-base-content/20 hover:bg-success/10 hover:text-success"
                                                )}
                                                title={isCorrect ? t('library.inspector.edit.unmark_correct') : t('library.inspector.edit.mark_correct')}
                                            >
                                                {isCorrect ? <ShieldCheck size={16} /> : displayId}
                                            </button>
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0">
                                                <input
                                                    type="text"
                                                    id={`${instanceId}-choice-id-${choice.id}`}
                                                    name={`${instanceId}-choice-id-${choice.id}`}
                                                    value={choice.id}
                                                    onChange={(e) => updateChoiceId(choice.id, e.target.value.toUpperCase().slice(0, 3))}
                                                    disabled={disabled}
                                                    className={cn(
                                                        "w-10 h-6 rounded-lg text-[9px] font-mono font-black text-center outline-none transition-all uppercase",
                                                        isDuplicate || isEmpty
                                                            ? "bg-error/10 text-error border border-error/20"
                                                            : "bg-base-content/5 text-base-content/40 focus:bg-base-content/10 border border-transparent"
                                                    )}
                                                    title={isDuplicate ? "ID Duplicate" : t('library.inspector.edit.edit_choice_id')}
                                                />
                                            </div>
                                        </div>

                                        {/* Content Area */}
                                        <div className="flex-1 min-w-0 flex flex-col pt-1">
                                            <div className="relative">
                                                <textarea
                                                    id={`${instanceId}-choice-text-${choice.id}`}
                                                    name={`${instanceId}-choice-text-${choice.id}`}
                                                    value={choice.text}
                                                    onChange={(e) => updateChoice(choice.id, e.target.value)}
                                                    disabled={disabled}
                                                    rows={1}
                                                    placeholder={t('library.inspector.edit.choice_placeholder', '输入选项内容...')}
                                                    className={cn(
                                                        "w-full bg-transparent border-none outline-none text-[14px] font-bold py-1 px-0 resize-none",
                                                        "placeholder:text-base-content/10 leading-relaxed transition-colors",
                                                        isCorrect ? "text-base-content" : "text-base-content/70 focus:text-base-content",
                                                        disabled && "cursor-not-allowed opacity-50"
                                                    )}
                                                    onInput={(e) => {
                                                        const target = e.target as HTMLTextAreaElement;
                                                        target.style.height = 'auto';
                                                        target.style.height = target.scrollHeight + 'px';
                                                    }}
                                                />
                                            </div>

                                            {/* Analysis Section (Nested) */}
                                            <div className={cn(
                                                "mt-2 rounded-xl p-2.5 flex gap-2.5 transition-all border",
                                                analysis?.why
                                                    ? "bg-warning/[0.03] border-warning/10 shadow-inner"
                                                    : "bg-transparent border-transparent hover:bg-base-content/[0.02]"
                                            )}>
                                                <Lightbulb size={12} className={cn(
                                                    "mt-1 shrink-0 transition-colors",
                                                    analysis?.why ? "text-warning" : "text-base-content/10"
                                                )} />
                                                <textarea
                                                    id={`${instanceId}-choice-analysis-${choice.id}`}
                                                    name={`${instanceId}-choice-analysis-${choice.id}`}
                                                    value={analysis?.why || ''}
                                                    onChange={(e) => updateOptionAnalysis(choice.id, e.target.value)}
                                                    disabled={disabled}
                                                    rows={1}
                                                    placeholder={t('library.inspector.edit.why_choice', '填写该选项的解析...')}
                                                    className={cn(
                                                        "w-full text-xs bg-transparent border-none outline-none p-0 resize-none",
                                                        "placeholder:text-base-content/10 font-medium leading-relaxed",
                                                        analysis?.why ? "text-base-content/50" : "text-base-content/20 focus:text-base-content/40"
                                                    )}
                                                    onInput={(e) => {
                                                        const target = e.target as HTMLTextAreaElement;
                                                        target.style.height = 'auto';
                                                        target.style.height = target.scrollHeight + 'px';
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="shrink-0 flex items-start pt-1">
                                            <button
                                                type="button"
                                                onClick={() => removeChoice(choice.id)}
                                                disabled={disabled}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-base-content/5 hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={addChoice}
                        disabled={disabled}
                        className={cn(
                            "w-full h-14 rounded-2xl border-2 border-dashed border-primary/10",
                            "flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest",
                            "text-primary/40 hover:text-primary hover:border-primary/30 hover:bg-primary/5 hover:scale-[1.01]",
                            "transition-all duration-300 active:scale-95",
                            disabled && "cursor-not-allowed opacity-50"
                        )}
                    >
                        <Plus size={16} />
                        {t('library.inspector.edit.add_choice', 'Add New Choice')}
                    </button>
                </div>

                {/* 1. Global Explanation Section - Simplified */}
                <div className="space-y-3 pt-4 border-t border-base-content/5">
                    <SectionHeader
                        icon={<Zap />}
                        title={t('library.inspector.edit.explanation_title', 'General Explanation')}
                        value={explanation ? t('library.inspector.edit.status_written') : t('library.inspector.edit.status_empty')}
                    />
                    <textarea
                        id={`${instanceId}-general-explanation`}
                        name={`${instanceId}-general-explanation`}
                        value={explanation || ''}
                        onChange={(e) => onExplanationChange?.(e.target.value)}
                        disabled={disabled}
                        rows={3}
                        placeholder={t('library.inspector.edit.ph_explain', 'Final solution, strategy, and comprehensive explanation...')}
                        className="w-full p-4 bg-base-content/[0.02] border border-base-content/5 rounded-2xl text-sm font-medium leading-relaxed placeholder:opacity-20 resize-none focus:border-primary/20 focus:bg-base-100 transition-all outline-none"
                    />
                </div>

                {/* 2. Overall Question Hints Section */}
                {renderQuestionHintsUI()}

                {/* Validation Warnings */}
                {choices.length > 0 && selectedIds.length === 0 && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-[11px] font-medium">
                        <AlertCircle size={14} />
                        {t('library.inspector.edit.no_correct_warning', 'Please mark at least one correct answer')}
                    </div>
                )}
            </div>
        );
    }

    // === Render Fill Blank Mode ===
    if (questionType === 'fill_blank') {
        return (
            <div className="space-y-6">
                <div className="space-y-4">
                    <SectionHeader
                        icon={<Plus />}
                        title={t('library.inspector.edit.blanks_title', 'Fill-in Answers')}
                        value={blanks.length > 0 ? blanks.length.toString() : t('common.status.none')}
                    />

                    <div className="space-y-3">
                        {blanks.map((blank, index) => (
                            <div
                                key={index}
                                className="group flex items-center gap-3 p-3 rounded-2xl bg-success/5 border border-success/10"
                            >
                                <div className="w-8 h-8 rounded-xl bg-success text-white flex items-center justify-center text-xs font-black shrink-0">
                                    {index + 1}
                                </div>
                                <input
                                    id={`${instanceId}-blank-${index}`}
                                    name={`${instanceId}-blank-${index}`}
                                    type="text"
                                    value={blank}
                                    onChange={(e) => updateBlank(index, e.target.value)}
                                    disabled={disabled}
                                    placeholder={t('library.inspector.edit.blank_placeholder', 'Answer...')}
                                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium placeholder:opacity-30"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeBlank(index)}
                                    disabled={disabled}
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-base-content/20 hover:text-error hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addBlank}
                        disabled={disabled}
                        className={cn(
                            "w-full h-12 rounded-2xl border-2 border-dashed border-base-content/10",
                            "flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider",
                            "text-base-content/30 hover:text-primary hover:border-primary/30 hover:bg-primary/5",
                            "transition-all duration-300"
                        )}
                    >
                        <Plus size={16} />
                        {t('library.inspector.edit.add_blank', 'Add Blank')}
                    </button>
                </div>

                {/* Global Hints */}
                {renderQuestionHintsUI()}

                {/* Explanation for Fill Blank */}
                <div className="space-y-4 pt-4 border-t border-base-content/5">
                    <div className="flex items-center gap-2 text-[9px] font-black opacity-30 uppercase tracking-[0.2em] px-1">
                        <Zap size={12} />
                        {t('library.inspector.edit.explanation_title', 'Explanation')}
                    </div>
                    <textarea
                        id={`${instanceId}-fill-blank-explanation`}
                        name={`${instanceId}-fill-blank-explanation`}
                        value={explanation || ''}
                        onChange={(e) => onExplanationChange?.(e.target.value)}
                        disabled={disabled}
                        rows={3}
                        className="w-full p-4 rounded-2xl border border-primary/10 bg-primary/[0.02] text-sm font-medium outline-none focus:border-primary/30"
                        placeholder={t('library.inspector.edit.ph_explain', 'Explain the correct answers...')}
                    />
                </div>
            </div>
        );
    }

    // === Short Answer Mode ===
    if (questionType === 'short_answer') {
        const modelAnswer = correctAnswer?.type === 'short_answer' && Array.isArray(correctAnswer.answers)
            ? correctAnswer.answers[0]
            : (typeof correctAnswer?.text === 'string' ? correctAnswer.text : '');

        const handleModelAnswerChange = (val: string) => {
            onCorrectAnswerChange({
                type: 'short_answer',
                answers: [val]
            });
        };

        return (
            <div className="space-y-6">
                {/* 1. Model Answer Section */}
                <div className="space-y-4">
                    <SectionHeader
                        icon={<Layers size={12} />}
                        title={t('library.inspector.edit.short_answer_title', 'Model Answer')}
                        value={modelAnswer ? t('library.inspector.edit.status_written') : t('library.inspector.edit.status_empty')}
                    />
                    <textarea
                        id={`${instanceId}-short-answer-model`}
                        name={`${instanceId}-short-answer-model`}
                        value={modelAnswer}
                        onChange={(e) => handleModelAnswerChange(e.target.value)}
                        disabled={disabled}
                        rows={6}
                        className="w-full p-6 rounded-[2rem] border border-primary/10 bg-primary/[0.02] text-sm font-medium outline-none focus:border-primary/20 focus:bg-base-100 transition-all custom-scrollbar shadow-inner selection:bg-primary/20 leading-relaxed"
                        placeholder={t('library.inspector.edit.ph_model_answer', 'Enter the reference model answer here...')}
                    />
                </div>

                {/* 2. Global Explanation Section */}
                <div className="space-y-4 pt-4 border-t border-base-content/5">
                    <SectionHeader
                        icon={<Zap size={12} />}
                        title={t('library.inspector.edit.explanation_title', 'General Explanation')}
                        value={explanation ? t('library.inspector.edit.status_written') : t('library.inspector.edit.status_empty')}
                    />
                    <textarea
                        id={`${instanceId}-short-answer-explanation`}
                        name={`${instanceId}-short-answer-explanation`}
                        value={explanation || ''}
                        onChange={(e) => onExplanationChange?.(e.target.value)}
                        disabled={disabled}
                        rows={3}
                        className="w-full p-4 rounded-2xl border border-base-content/5 bg-base-content/[0.02] text-sm font-medium outline-none focus:border-primary/20 focus:bg-base-100 transition-all custom-scrollbar shadow-inner"
                        placeholder={t('library.inspector.edit.ph_explain_short', 'Add supplementary explanation or meta-analysis...')}
                    />
                </div>

                {/* 3. Global Hints */}
                {renderQuestionHintsUI()}
            </div>
        );
    }

    return null;
};

export default ChoicesEditor;
