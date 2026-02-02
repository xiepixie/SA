import React from 'react';
import { cn } from '../../app/utils/cn';
import { Upload, Eye, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ImportStepId = 'upload' | 'preview' | 'importing' | 'done';

interface Step {
    id: ImportStepId;
    labelKey: string;
    icon: React.ElementType;
}

const STEPS: Step[] = [
    { id: 'upload', labelKey: 'import.steps.upload', icon: Upload },
    { id: 'preview', labelKey: 'import.steps.preview', icon: Eye },
    { id: 'done', labelKey: 'import.steps.done', icon: Check },
];

interface ImportStepperProps {
    currentStep: ImportStepId;
    className?: string;
}

/**
 * ImportStepper - Premium Step progress indicator
 */
export const ImportStepper: React.FC<ImportStepperProps> = ({ currentStep, className }) => {
    const { t } = useTranslation();

    const displayStep = currentStep === 'importing' ? 'done' : currentStep;
    const currentIndex = STEPS.findIndex(s => s.id === displayStep);

    return (
        <div className={cn("flex items-center gap-4", className)}>
            {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = step.id === displayStep;
                const isCompleted = index < currentIndex;
                const isPending = index > currentIndex;

                return (
                    <React.Fragment key={step.id}>
                        {/* Step Node */}
                        <div className="flex items-center gap-3 group">
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-700 relative",
                                    isCompleted && "bg-success/20 text-success border border-success/30 scale-100",
                                    isActive && "bg-primary text-primary-content scale-110 shadow-premium-lg ring-4 ring-primary/10",
                                    isPending && "bg-base-content/5 text-base-content/20 border border-base-content/10 grayscale"
                                )}
                            >
                                {isCompleted ? (
                                    <div className="relative">
                                        <Check size={18} strokeWidth={3} className="animate-in zoom-in duration-500" />
                                        <div className="absolute inset-0 bg-success/40 blur-lg animate-pulse" />
                                    </div>
                                ) : (
                                    <Icon size={18} className={cn(isActive && "animate-pulse-subtle")} />
                                )}

                                {isActive && (
                                    <div className="absolute inset-0 rounded-2xl bg-white/20 animate-ping opacity-20" />
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span
                                    className={cn(
                                        "text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-500 hidden sm:block",
                                        isActive ? "text-primary translate-x-0" : "text-base-content/20",
                                        isCompleted && "text-success/60"
                                    )}
                                >
                                    {t(step.labelKey, step.id)}
                                </span>
                                {isActive && (
                                    <span className="text-[8px] font-bold text-primary/40 uppercase tracking-widest leading-none hidden sm:block animate-in fade-in slide-in-from-top-1">
                                        {index + 1} / {STEPS.length}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Connector Line */}
                        {index < STEPS.length - 1 && (
                            <div className="h-0.5 w-12 rounded-full overflow-hidden bg-base-content/5 relative">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-1000 ease-spring",
                                        index < currentIndex ? "w-full bg-success/50" : "w-0 bg-primary"
                                    )}
                                />
                                {isActive && index === currentIndex - 1 && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-success/0 via-success/50 to-success/0 animate-shimmer" />
                                )}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default ImportStepper;
