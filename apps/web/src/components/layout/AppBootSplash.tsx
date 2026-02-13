import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Zap, Sparkles } from 'lucide-react';

export const AppBootSplash: React.FC = () => {
    const { t } = useTranslation(['app']);

    return (
        /* 
           Inject data-theme explicitly to ensure design tokens (oklch variables) 
           are available even before the main App component has initialized preferences.
           Use bg-mesh-surface for the premium animated grain background.
        */
        <div
            className="sea fixed inset-0 z-[9999] flex items-center justify-center bg-mesh-surface overflow-hidden"
            data-theme="liquid-dark"
        >
            {/* Animated Neural Background Blobs */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-blob-drift" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px] animate-blob-drift" style={{ animationDelay: '2s' }} />
            </div>

            {/* Premium Glass Card for Branding */}
            <div className="glass-card-premium p-10 md:p-14 w-full max-w-lg relative z-10 reveal-smooth">
                {/* Branding / Header */}
                <div className="flex items-center gap-5 mb-10">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/5">
                        <Sparkles className="w-9 h-9 text-primary animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-base-content">
                            {t('app:boot.title', 'Preparing Study Environment')}
                        </h1>
                        <p className="text-sm font-bold opacity-40 uppercase tracking-[0.2em] mt-1">
                            {t('app:boot.subtitle', 'Neural Sync Interface v2')}
                        </p>
                    </div>
                </div>

                {/* Loading Steps */}
                <div className="space-y-6">
                    <BootStep
                        icon={<Sparkles className="w-4 h-4" />}
                        label={t('app:boot.steps.renderer', 'Initializing Liquid Graphics')}
                        status="done"
                    />
                    <BootStep
                        icon={<Database className="w-4 h-4" />}
                        label={t('app:boot.steps.sync', 'Synchronizing Error Entities')}
                        status="active"
                        delay="0.1s"
                    />
                    <BootStep
                        icon={<Zap className="w-4 h-4" />}
                        label={t('app:boot.steps.review', 'Preparing Review Queue')}
                        status="waiting"
                        delay="0.2s"
                    />
                </div>

                {/* Footer Insight */}
                <div className="mt-12 pt-8 border-t border-base-content/10 flex items-center justify-between text-[11px] font-bold text-base-content/40">
                    <div className="flex items-center gap-3">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-success animate-ping" />
                        <span className="uppercase tracking-widest leading-none">
                            {t('app:boot.status', 'System Online - Ready for Sync')}
                        </span>
                    </div>
                    <span className="opacity-60 tabular-nums font-mono">EST: 0.8s</span>
                </div>
            </div>
        </div>
    );
};

interface BootStepProps {
    icon: React.ReactNode;
    label: string;
    status: 'done' | 'active' | 'waiting';
    delay?: string;
}

const BootStep: React.FC<BootStepProps> = ({ icon, label, status, delay = '0s' }) => {
    return (
        <div className="flex items-center gap-4 reveal-smooth" style={{ animationDelay: delay }}>
            <div className={`
                flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-500
                ${status === 'done' ? 'bg-success/15 border-success/30 text-success' :
                    status === 'active' ? 'bg-primary/15 border-primary/30 text-primary animate-pulse' :
                        'bg-base-content/5 border-base-content/10 text-base-content/30'}
            `}>
                {status === 'done' ? (
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold transition-colors duration-500 ${status === 'waiting' ? 'text-base-content/30' : 'text-base-content/80'}`}>
                    {label}
                </div>
                {status === 'active' && (
                    <div className="mt-2 h-1.5 w-full bg-base-content/5 rounded-full overflow-hidden">
                        <div className="h-full animate-infinite-loading" />
                    </div>
                )}
            </div>
        </div>
    );
};

