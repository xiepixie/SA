import React, { useRef, useEffect } from 'react';
import { cn } from '../../../app/utils/cn';
import { useTranslation } from 'react-i18next';
import { MarkdownRenderer } from '@v2/markdown-parser';

interface FillBlankRendererProps {
    blanks: string[];
    userAnswer: string[];
    correctAnswers: string[];
    isRevealed: boolean;
    onUpdate: (index: number, value: string) => void;
    onEnter: () => void;
    placeholder?: string;
    disableAutoFocus?: boolean;
}

export const FillBlankRenderer: React.FC<FillBlankRendererProps> = ({
    blanks,
    userAnswer,
    correctAnswers,
    isRevealed,
    onUpdate,
    onEnter,
    placeholder,
    disableAutoFocus = false
}) => {
    const { t } = useTranslation();
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (!isRevealed && !disableAutoFocus) {
            // Find first empty blank and focus it
            const firstEmpty = userAnswer.findIndex(v => !v);
            const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
            inputRefs.current[targetIndex]?.focus();
        }
    }, [isRevealed, disableAutoFocus]);

    return (
        <div className="space-y-6 reveal-smooth">
            <div className="flex flex-col gap-4">
                {blanks.map((_, index) => {
                    const value = userAnswer[index] || '';
                    const isCorrect = isRevealed && value.trim().toLowerCase() === correctAnswers[index]?.trim().toLowerCase();
                    const isWrong = isRevealed && !isCorrect;

                    return (
                        <div key={index} className="space-y-2 group">
                            <label htmlFor={`blank-${index}`} className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 ml-1 group-focus-within:opacity-100 group-focus-within:text-primary transition-all">
                                {t('renderer.fill_blank.blank_label', { index: index + 1, defaultValue: `Blank #${index + 1}` })}
                            </label>
                            <div className="relative">
                                <input
                                    id={`blank-${index}`}
                                    name={`blank_${index}`}
                                    ref={el => { inputRefs.current[index] = el; }}
                                    type="text"
                                    disabled={isRevealed}
                                    value={value}
                                    onChange={(e) => onUpdate(index, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') onEnter();
                                    }}
                                    placeholder={placeholder || t('renderer.fill_blank.placeholder')}
                                    autoComplete="off"
                                    className={cn(
                                        "w-full h-14 px-6 bg-base-200/40 border-2 border-transparent rounded-2xl text-lg font-bold outline-none transition-all shadow-inner-white",
                                        !isRevealed && "focus:border-primary/50 focus:bg-base-100 focus:shadow-xl focus:shadow-primary/5",
                                        isRevealed && isCorrect && "bg-success/10 border-success/30 text-success shadow-[0_0_20px_rgba(var(--color-success-rgb),0.1)]",
                                        isRevealed && isWrong && "bg-error/10 border-error/30 text-error",
                                    )}
                                />

                                {isRevealed && (
                                    <div className={cn(
                                        "absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
                                        isCorrect ? "bg-success/20 text-success" : "bg-error/20 text-error"
                                    )}>
                                        {isCorrect ? t('renderer.fill_blank.match', 'Match') : t('renderer.fill_blank.miss', 'Miss')}
                                    </div>
                                )}
                            </div>

                            {/* Correct Answer Reveal */}
                            {isRevealed && isWrong && (
                                <div className="ml-1 animate-in slide-in-from-top-1 duration-300">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest mr-2">{t('renderer.fill_blank.expected', 'Expected')}:</span>
                                    <span className="text-sm font-black se-mono text-base-content/80 underline decoration-primary/40 decoration-2 underline-offset-4 inline-flex items-center">
                                        <MarkdownRenderer content={correctAnswers[index]} className="!prose-sm !text-sm prose-none" />
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!isRevealed && (
                <div className="flex items-center gap-2 opacity-30 ml-1">
                    <kbd className="kbd kbd-xs">↵</kbd>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t('renderer.fill_blank.enter_hint', 'Press Enter to Reveal')}</span>
                </div>
            )}
        </div>
    );
};
