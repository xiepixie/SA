/**
 * DoneStep - Import results summary (V2 - Mutation Driven)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, ArrowRight, XCircle } from 'lucide-react';
import { cn } from '../../../../app/utils/cn';
import { ImportStepper } from '../../../../components/import/ImportStepper';
import { AnimatedCounter } from '../../../../components/ui/AnimatedCounter';
import { Confetti } from '../../../../components/ui/Confetti';
import type { ImportPipelineResult } from '@v2/shared';

export interface DoneStepProps {
    result: ImportPipelineResult | undefined;
    error: Error | null;
    onReset: () => void;
    onNavigateToReview: () => void;
    onRetry?: (failedRows: number[]) => void;
}

export const DoneStep: React.FC<DoneStepProps> = ({
    result,
    error,
    onReset,
    onNavigateToReview,
    onRetry,
}) => {
    const { t } = useTranslation();

    // Handle retry logic
    const handleRetry = () => {
        if (result?.rowErrors && onRetry) {
            const failedRows = result.rowErrors.map(e => e.row);
            onRetry(failedRows);
        }
    };

    // Handle mutation error state (Critical System Errors)
    if (error) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 md:p-12 bg-base-300 relative overflow-hidden">
                <div className="max-w-[1440px] w-full relative z-10 space-y-8 animate-in fade-in zoom-in-95 duration-700">
                    <div className="flex justify-center">
                        <ImportStepper currentStep="done" />
                    </div>

                    <div className="glass-card p-8 md:p-16 rounded-[2.5rem] text-center space-y-10 shadow-premium-xl">
                        <div className="w-32 h-32 rounded-full flex items-center justify-center mx-auto ring-[16px] bg-error/10 ring-error/5">
                            <XCircle size={64} className="text-error" strokeWidth={1} />
                        </div>
                        <div className="space-y-4">
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight text-base-content">
                                {t('import.done.title_failed', 'Import Failed')}
                            </h1>
                            <p className="text-base-content/40 text-lg font-medium max-w-xl mx-auto leading-relaxed">
                                {error.message}
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4 max-w-md mx-auto w-full">
                            <button
                                onClick={onReset}
                                className="h-12 w-full rounded-xl bg-primary text-primary-content text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:translate-y-[-1px] active:translate-y-0 transition-all flex items-center justify-center gap-2"
                            >
                                {t('common.actions.try_again', 'Try Again')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Handle no result (shouldn't happen in normal flow)
    if (!result) {
        return (
            <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface reveal-smooth relative">
                <div className="max-w-xl mx-auto w-full space-y-8 text-center">
                    <p className="text-base-content/40">{t('common.status.loading', 'Loading...')}</p>
                </div>
            </div>
        );
    }

    const hasErrors = result.failed > 0;
    const allFailed = result.success === 0 && result.failed > 0;
    const partialSuccess = result.success > 0 && result.failed > 0;

    // Status config based on success/failure
    const statusConfig = allFailed
        ? { icon: AlertCircle, color: 'error', bgColor: 'bg-error/10', ringColor: 'ring-error/5', blobColor: 'bg-error/10' }
        : partialSuccess
            ? { icon: AlertCircle, color: 'warning', bgColor: 'bg-warning/20', ringColor: 'ring-warning/5', blobColor: 'bg-warning/10' }
            : { icon: CheckCircle2, color: 'success', bgColor: 'bg-success/20', ringColor: 'ring-success/5', blobColor: 'bg-success/10' };

    const StatusIcon = statusConfig.icon;

    return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 md:p-12 bg-base-300 relative overflow-hidden font-sans">
            {/* Confetti celebration for successful imports */}
            <Confetti trigger={!allFailed && result.success > 0} />

            {/* Professional Background */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-40 bg-[radial-gradient(at_0%_0%,rgba(var(--p),0.03)_0,transparent_50%),radial-gradient(at_100%_0%,rgba(var(--s),0.03)_0,transparent_50%)]" />
                <div className={cn("absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px] opacity-10", statusConfig.blobColor)} />
            </div>

            <div className="max-w-[1440px] w-full relative z-10 space-y-12 animate-in fade-in zoom-in-95 duration-1000 ease-spring">
                {/* Step indicator */}
                <div className="flex justify-center opacity-70">
                    <ImportStepper currentStep="done" />
                </div>

                <div className="glass-card p-8 md:p-16 rounded-[2.5rem] text-center space-y-10 animate-in zoom-in-95 fade-in duration-700 shadow-premium-xl">
                    <div className={cn("w-32 h-32 rounded-full flex items-center justify-center mx-auto ring-[16px]", statusConfig.bgColor, statusConfig.ringColor, !allFailed && "animate-bounce-subtle")}>
                        <StatusIcon size={64} className={`text-${statusConfig.color}`} strokeWidth={1} />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight text-base-content">
                            {allFailed ? t('import.done.title_failed') : t('import.done.title')}
                        </h1>
                        <p className="text-base-content/40 text-lg font-medium max-w-xl mx-auto leading-relaxed">
                            {allFailed
                                ? t('import.done.desc_failed')
                                : partialSuccess
                                    ? t('import.done.desc_partial')
                                    : t('import.done.desc')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto w-full">
                        {[
                            { label: t('import.done.stat_imported'), val: result.success, color: 'text-success' },
                            { label: t('import.done.stat_failed'), val: result.failed, color: 'text-error' },
                            { label: t('import.done.stat_cards'), val: result.cards?.success ?? 0, color: 'text-primary' }
                        ].map(s => (
                            <div key={s.label} className="p-8 rounded-3xl bg-base-content/[0.02] space-y-2 border border-base-content/5 group hover:bg-base-content/[0.04] transition-all duration-300">
                                <AnimatedCounter
                                    value={s.val}
                                    duration={1500}
                                    className={cn("text-4xl font-black tabular-nums tracking-tighter block", s.color)}
                                />
                                <div className="text-[9px] uppercase font-black tracking-[0.2em] opacity-30">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Error details list */}
                    {hasErrors && result.rowErrors && result.rowErrors.length > 0 && (
                        <div className="text-left space-y-6 p-6 md:p-10 bg-error/5 border border-error/10 rounded-[40px] max-w-5xl mx-auto w-full animate-in slide-in-from-bottom-4 duration-1000">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-error">
                                    <AlertCircle size={24} />
                                    <span className="text-sm font-black uppercase tracking-[0.2em]">{t('import.done.error_details', '失败详情')}</span>
                                </div>
                                {partialSuccess && onRetry && (
                                    <button
                                        onClick={handleRetry}
                                        className="h-10 px-6 rounded-xl bg-error text-white text-[10px] font-black uppercase tracking-widest hover:bg-error/80 transition-all shadow-lg shadow-error/20"
                                    >
                                        {t('common.actions.retry_failed', '重试失败项')}
                                    </button>
                                )}
                            </div>
                            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                                {result.rowErrors.map((err, idx) => (
                                    <div key={idx} className="flex items-start gap-4 p-5 bg-base-100/50 rounded-2xl text-base ring-1 ring-base-content/5 group/erroritem hover:bg-base-100 transition-colors">
                                        <span className={cn(
                                            "shrink-0 px-3 py-1 rounded-xl font-mono text-xs font-black",
                                            err.error.includes('Derivative') || err.error.includes('Server-side') ? "bg-amber-500/10 text-amber-500" : "bg-error/10 text-error"
                                        )}>
                                            {t('import.done.row', { count: err.row })}
                                        </span>
                                        <span className="text-base-content/70 font-medium break-all">
                                            {err.error.includes('Exists in Database')
                                                ? t('import.preview.errors.duplicate_db', err.error)
                                                : err.error.includes('Duplicate in Batch')
                                                    ? t('import.preview.errors.duplicate_batch', err.error)
                                                    : err.error
                                            }
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4 pt-4 max-w-md mx-auto w-full">
                        <button onClick={onReset} className="h-14 w-full rounded-2xl bg-base-content/5 text-base-content text-[11px] font-black uppercase tracking-widest hover:bg-base-content/10 transition-all flex items-center justify-center gap-2">
                            {t('import.done.btn_more')}
                        </button>
                        {result.success > 0 && (
                            <button onClick={onNavigateToReview} className="h-14 w-full rounded-2xl bg-primary text-primary-content text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                                {t('import.done.btn_review', 'Start Reviewing')} <ArrowRight size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
