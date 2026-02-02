import React from 'react';
import { cn } from '../../../app/utils/cn';
import { MarkdownRenderer } from '@v2/markdown-parser';
import { useTranslation } from 'react-i18next';

interface ShortAnswerRendererProps {
    userAnswer: string;
    correctAnswer: string;
    isRevealed: boolean;
    onChange: (value: string) => void;
    onEnter: () => void;
    placeholder?: string;
}

export const ShortAnswerRenderer: React.FC<ShortAnswerRendererProps> = ({
    userAnswer,
    correctAnswer,
    isRevealed,
    onChange,
    onEnter,
    placeholder
}) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 reveal-smooth">
            <div className="space-y-3 group">
                <label htmlFor="short-answer-input" className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 ml-1 group-focus-within:text-primary transition-all">
                    {t('renderer.short_answer.your_answer', 'Your Analysis')}
                </label>
                <div className="relative">
                    <textarea
                        id="short-answer-input"
                        name="user_answer"
                        disabled={isRevealed}
                        value={userAnswer}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                onEnter();
                            }
                        }}
                        placeholder={placeholder || t('renderer.short_answer.placeholder')}
                        className={cn(
                            "w-full min-h-[160px] p-6 bg-base-200/40 border-2 border-transparent rounded-[2rem] text-base font-medium outline-none transition-all shadow-inner-white resize-none",
                            !isRevealed && "focus:border-primary/50 focus:bg-base-100 focus:shadow-xl focus:shadow-primary/5",
                            isRevealed && "bg-base-200/20 border-base-content/5 opacity-80"
                        )}
                    />

                    {!isRevealed && (
                        <div className="absolute bottom-4 right-6 flex items-center gap-2 opacity-20 group-focus-within:opacity-60 transition-opacity">
                            <kbd className="kbd kbd-xs">⌘</kbd>
                            <kbd className="kbd kbd-xs">↵</kbd>
                        </div>
                    )}
                </div>
            </div>

            {isRevealed && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 mb-3 ml-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-success">{t('renderer.short_answer.model_answer')}</span>
                    </div>
                    <div className="p-6 bg-success/5 border border-success/10 rounded-[2rem] text-sm leading-relaxed text-success/90 font-medium">
                        {correctAnswer ? (
                            <MarkdownRenderer content={correctAnswer} className="prose-none" />
                        ) : (
                            t('renderer.short_answer.no_reference', 'No reference solution provided.')
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
