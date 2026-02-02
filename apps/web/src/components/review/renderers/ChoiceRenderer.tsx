import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { MarkdownRenderer } from '@v2/markdown-parser';

interface Choice {
    id: string;
    text: string;
}

interface ChoiceRendererProps {
    choices: Choice[];
    userAnswer: string[] | string | null;
    correctAnswerIds?: string[]; // Supporting multiple
    isRevealed: boolean;
    onSelect: (ids: string[]) => void;
    isMultiple?: boolean;
}

export const ChoiceRenderer: React.FC<ChoiceRendererProps> = ({
    choices,
    userAnswer,
    correctAnswerIds = [],
    isRevealed,
    onSelect,
    isMultiple = false
}) => {
    // Normalize userAnswer to array
    const selectedIds = React.useMemo(() => {
        if (!userAnswer) return [];
        return Array.isArray(userAnswer) ? userAnswer : [userAnswer];
    }, [userAnswer]);

    // Intelligent layout categorization
    const contentMetrics = React.useMemo(() => {
        if (!Array.isArray(choices)) return 'compact';
        const hasLargeContent = choices.some(c => c.text && (c.text.includes('\\begin{pmatrix}') || c.text.length > 50));
        return hasLargeContent ? 'long' : 'compact';
    }, [choices]);

    const handleSelect = (id: string) => {
        if (isRevealed) return;
        if (isMultiple) {
            const next = selectedIds.includes(id)
                ? selectedIds.filter(x => x !== id)
                : [...selectedIds, id];
            onSelect(next);
        } else {
            onSelect([id]);
        }
    };

    return (
        <div className={cn(
            "grid gap-3.5 animate-in fade-in duration-200",
            contentMetrics === 'long' ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"
        )}>
            {choices.map((choice, index) => {
                const isSelected = selectedIds.includes(choice.id);
                const isCorrect = isRevealed && correctAnswerIds.includes(choice.id);
                const isWrongSelection = isRevealed && isSelected && !correctAnswerIds.includes(choice.id);
                const isMissingSelection = isRevealed && !isSelected && correctAnswerIds.includes(choice.id);

                const label = String.fromCharCode(65 + index);

                return (
                    <div
                        key={choice.id}
                        role="button"
                        tabIndex={isRevealed ? -1 : 0}
                        aria-pressed={isSelected}
                        onClick={() => handleSelect(choice.id)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelect(choice.id);
                            }
                        }}
                        className={cn(
                            "group relative transition-all duration-300 overflow-hidden border text-left w-full",
                            "rounded-2xl p-4 md:p-5 flex flex-col justify-center",
                            "min-h-[64px] min-w-0 transform-gpu translate-z-0 backface-hidden", // GPU acceleration for crisp text
                            !isRevealed && "cursor-pointer active:opacity-70",
                            // Base state
                            !isRevealed && "bg-base-content/[0.02] border-base-content/5 hover:border-primary/30 hover:bg-base-content/[0.04] hover:shadow-premium-md",
                            // Selected state (pre-reveal)
                            isSelected && !isRevealed && "bg-primary/[0.06] border-primary/40 shadow-premium-lg",
                            // Revealed: Correct (Selected or Missing)
                            isCorrect && "bg-success/[0.08] border-success/40 shadow-premium-sm",
                            isMissingSelection && "ring-2 ring-success/30 ring-offset-2 ring-offset-base-100 opacity-95",
                            // Revealed: Wrong Selection
                            isWrongSelection && "bg-error/[0.08] border-error/40 opacity-95",
                            // Revealed: Others
                            isRevealed && !isCorrect && !isWrongSelection && "opacity-30 grayscale-[0.8]"
                        )}
                    >
                        <div className="flex items-center gap-5 relative z-10 w-full">
                            {/* Choice Index Label - Perfectly centered */}
                            <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black transition-all duration-300 shrink-0 border",
                                isSelected && !isRevealed && "bg-primary text-primary-content border-primary/40 scale-110 shadow-lg shadow-primary/20",
                                isCorrect && "bg-success text-success-content border-success/40",
                                isWrongSelection && "bg-error text-error-content border-error/40",
                                !isSelected && !isCorrect && "bg-base-content/5 text-base-content/30 border-base-content/10 group-hover:bg-primary/20 group-hover:text-primary group-hover:border-primary/20"
                            )}>
                                {label}
                            </div>

                            <div className={cn(
                                "flex-1 min-w-0 transition-colors py-1",
                                isSelected && !isRevealed && "text-primary",
                                isCorrect && "text-success",
                                isWrongSelection && "text-error",
                                !isSelected && !isRevealed && "text-base-content/95"
                            )}>
                                <MarkdownRenderer
                                    content={choice.text}
                                    density="compact"
                                    className="!prose-sm !max-w-none text-[14px] leading-relaxed font-semibold tracking-tight"
                                />
                            </div>

                            {/* Status Icon with animation */}
                            <div className="shrink-0 flex items-center ml-2">
                                {isRevealed && isCorrect && isSelected && (
                                    <CheckCircle2 className="text-success animate-in zoom-in duration-300" size={20} strokeWidth={3} />
                                )}
                                {isRevealed && isWrongSelection && (
                                    <XCircle className="text-error animate-in shake duration-500" size={20} strokeWidth={3} />
                                )}
                            </div>
                        </div>

                        {/* Hover Overlay - Smoother gradient */}
                        {!isRevealed && (
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
