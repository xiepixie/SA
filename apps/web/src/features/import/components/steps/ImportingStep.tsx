/**
 * ImportingStep - Progress indicator during import (V2 - Mutation Driven)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Loader2 } from 'lucide-react';
import { ImportStepper } from '../../../../components/import/ImportStepper';

export interface ImportingStepProps {
    isPending: boolean;
    itemCount: number;
}

export const ImportingStep: React.FC<ImportingStepProps> = ({
    isPending,
    itemCount,
}) => {
    const { t } = useTranslation();

    return (
        <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface reveal-smooth relative">
            <div className="max-w-xl mx-auto w-full space-y-8">
                {/* Step indicator */}
                <div className="flex justify-center">
                    <ImportStepper currentStep="importing" />
                </div>

                <div className="glass-card p-10 md:p-16 rounded-[2.5rem] text-center space-y-10 shadow-premium-xl">
                    <div className="relative w-28 h-28 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
                        <div
                            className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                            style={{ animationDuration: '0.8s' }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Database className="text-primary animate-pulse" size={28} />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-2xl font-black text-base-content tracking-tight">
                            {t('import.importing.title')}
                        </h2>
                        <p className="text-base-content/40 font-mono text-xs uppercase tracking-widest">
                            {isPending
                                ? t('import.importing.processing', 'Processing items...')
                                : t('import.importing.preparing', 'Preparing...')}
                        </p>
                    </div>
                    <div className="space-y-3">
                        {/* Indeterminate progress bar since we don't have batch progress from mutation */}
                        <div className="h-3 w-full bg-base-content/5 rounded-full overflow-hidden border border-base-content/10 shadow-inner relative">
                            <div
                                className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary to-primary/20 animate-shimmer"
                                style={{
                                    backgroundSize: '200% 100%',
                                }}
                            />
                        </div>
                        <div className="flex justify-between font-mono text-[10px] font-black text-base-content/30 uppercase tracking-widest">
                            <span>{itemCount} {t('common.status.items')}</span>
                            <span className="flex items-center gap-1">
                                <Loader2 size={10} className="animate-spin" />
                                {t('common.status.processing', 'Processing')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
