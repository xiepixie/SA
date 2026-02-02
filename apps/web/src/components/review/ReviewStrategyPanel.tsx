import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    SORT_OPTIONS,
} from '../../app/utils/reviewSortUtils';
import type {
    ReviewSortMode,
    SortOption
} from '../../app/utils/reviewSortUtils';
import {
    Clock,
    TrendingDown,
    Dumbbell,
    Shuffle,
    Sparkles,
    ChevronRight,
    Target,
    Layers
} from 'lucide-react';
import { cn } from '../../app/utils/cn';

interface ReviewStrategyPanelProps {
    currentMode: ReviewSortMode;
    onModeChange: (mode: ReviewSortMode) => void;
    stats: {
        total: number;
        overdue: number;
        weak: number;
    };
    onStart: () => void;
}

const MODE_ICONS: Record<string, any> = {
    'optimal': Target,
    'overdue-asc': Clock,
    'mastery-asc': TrendingDown,
    'difficulty-desc': Dumbbell,
    'newest-asc': Sparkles,
    'random': Shuffle
};

export const ReviewStrategyPanel: React.FC<ReviewStrategyPanelProps> = ({
    currentMode,
    onModeChange,
    stats,
    onStart
}) => {
    const { t } = useTranslation();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start w-full">
            {/* 1. Left Column: Strategy Selection Grid */}
            <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/20 italic">
                        {t('review.setup.mode_selection', 'Algorithm Strategy')}
                    </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SORT_OPTIONS.map((option: SortOption) => {
                        const Icon = MODE_ICONS[option.value] || Target;
                        const isActive = currentMode === option.value;

                        return (
                            <button
                                key={option.value}
                                onClick={() => onModeChange(option.value)}
                                className={cn(
                                    "group relative p-5 rounded-[1.75rem] border text-left flex flex-col gap-4 transition-all duration-300",
                                    isActive
                                        ? "bg-primary text-primary-content border-primary shadow-premium-lg translate-y-[-2px]"
                                        : "bg-base-content/[0.02] border-base-content/5 hover:border-primary/20 hover:bg-base-content/[0.04] shadow-sm hover:translate-y-[-1px]"
                                )}
                            >
                                <div className={cn(
                                    "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner shrink-0",
                                    isActive
                                        ? "bg-white/20 scale-105"
                                        : "bg-base-100 group-hover:bg-primary group-hover:text-primary-content group-hover:rotate-6"
                                )}>
                                    <Icon size={20} strokeWidth={2.5} />
                                </div>

                                <div className="space-y-1 flex-1">
                                    <h4 className={cn("text-base font-black tracking-tight", isActive ? "" : "text-base-content")}>
                                        {t(option.labelKey)}
                                    </h4>
                                    <p className={cn("text-[11px] leading-relaxed font-bold", isActive ? "text-primary-content/70" : "text-base-content/30")}>
                                        {t(option.descriptionKey)}
                                    </p>
                                </div>

                                {option.value === 'overdue-asc' && stats.overdue > 0 && (
                                    <div className={cn(
                                        "absolute top-5 right-5 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest",
                                        isActive ? "bg-white/10 text-primary-content" : "bg-error/10 text-error"
                                    )}>
                                        {stats.overdue}
                                    </div>
                                )}

                                {isActive && (
                                    <div className="absolute bottom-5 right-5 w-1.5 h-1.5 rounded-full bg-white opacity-40" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Right Column: Session Intelligence (Sidebar) */}
            <div className="lg:col-span-5 space-y-6">
                <div className="glass-card-premium p-6 rounded-[2.25rem] border-base-content/5 space-y-6 bg-gradient-to-br from-base-content/[0.01] to-transparent shadow-premium-lg">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/20">{t('review.setup.intel_title')}</h3>
                            <div className="flex gap-1">
                                <span className="w-1 h-1 rounded-full bg-success/40 animate-pulse" />
                            </div>
                        </div>

                        <div className="flex items-center gap-5 group">
                            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-content flex items-center justify-center shadow-premium-md group-hover:scale-105 transition-all duration-500">
                                <Layers size={24} />
                            </div>
                            <div className="space-y-0.5">
                                <div className="text-3xl font-black tabular-nums tracking-tighter leading-none">{stats.total}</div>
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/20">{t('review.setup.pending_items')}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.3em] text-base-content/20 italic">
                                <span className="flex items-center gap-1.5 line-clamp-1">
                                    <TrendingDown size={12} className="text-primary" />
                                    {t('review.setup.workload')}
                                </span>
                                <span className="shrink-0">{t('review.setup.forecast_7d')}</span>
                            </div>
                            <div className="flex items-end gap-1.5 h-20 w-full group/chart">
                                {[60, 80, 40, 90, 30, 50, 20].map((h, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex-1 rounded-[0.5rem] transition-all duration-700 cursor-help",
                                            i === 0
                                                ? "bg-gradient-to-t from-primary/80 to-primary"
                                                : "bg-base-content/[0.03] hover:bg-primary/20 hover:translate-y-[-2px]"
                                        )}
                                        style={{ height: `${h}%`, transitionDelay: `${i * 50}ms` }}
                                        title={`Day ${i + 1}: ${Math.round(stats.total * (h / 100))} cards`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-base-content/5" />

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3 bg-base-content/[0.01] p-4 rounded-2xl border border-base-content/5">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-primary/40">
                                    <Clock size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{t('common.status.time_est', 'EST. TIME')}</span>
                                </div>
                                <span className="text-lg font-black text-base-content">~{Math.ceil(stats.total * 0.4)}{t('common.status.minutes_short', 'm')}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-error/40">
                                    <Target size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{t('common.status.weak', 'WEAKNESS')}</span>
                                </div>
                                <span className="text-lg font-black text-base-content">{Math.round((stats.weak / (stats.total || 1)) * 100)}%</span>
                            </div>
                        </div>

                        <button
                            onClick={onStart}
                            className="group relative w-full h-14 rounded-2xl bg-base-content text-base-100 shadow-premium-md transition-all hover:scale-[1.01] active:scale-[0.99] overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary bg-[size:200%_100%] animate-gradient-slow opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative flex items-center justify-center gap-3">
                                <span className="text-sm font-black uppercase tracking-[0.2em] italic">{t('review.setup.start_btn')}</span>
                                <ChevronRight size={20} className="group-hover:translate-x-1.5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" />
                            </div>
                        </button>
                    </div>

                    <div className="flex gap-3 opacity-40 hover:opacity-100 transition-opacity bg-base-content/[0.01] p-4 rounded-2xl border border-dashed border-base-content/10">
                        <Sparkles size={14} className="shrink-0 text-primary mt-0.5" />
                        <p className="text-[10px] font-bold leading-relaxed italic text-base-content/60">
                            {t('review.setup.tip')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
