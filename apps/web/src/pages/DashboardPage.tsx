import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    Target,
    Zap,
    Layers,
    ArrowRight,
    Brain,
    TrendingUp,
    Shield,
    Clock,
    Plus,
    Flame,
    ChevronRight,
    BadgeCheck,
    AlertCircle
} from 'lucide-react';
import { useAppStore } from '../app/state/useAppStore';
import { useUserSettings } from '../app/state/useUserSettings';
import { useActiveView } from '../app/hooks/useActiveView';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../app/utils/cn';
import { useShallow } from 'zustand/react/shallow';



/** 
 * Semantic Color Mapping
 * Resolves Tailwind dynamic class inference issues.
 */
const SEMANTIC_COLORS = {
    neutral: {
        bg: 'bg-base-content/5',
        text: 'text-base-content/60',
        border: 'border-base-content/10',
        glow: '',
        iconBg: 'bg-base-content/5',
        bar: 'bg-base-content/20'
    },
    primary: {
        bg: 'bg-primary/5',
        text: 'text-primary',
        border: 'border-primary/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-primary)_l_c_h_/_0.15)]',
        iconBg: 'bg-primary/10',
        bar: 'bg-primary'
    },
    success: {
        bg: 'bg-success/5',
        text: 'text-success',
        border: 'border-success/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-success)_l_c_h_/_0.15)]',
        iconBg: 'bg-success/10',
        bar: 'bg-success'
    },
    warning: {
        bg: 'bg-warning/5',
        text: 'text-warning',
        border: 'border-warning/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-warning)_l_c_h_/_0.15)]',
        iconBg: 'bg-warning/10',
        bar: 'bg-warning'
    },
    error: {
        bg: 'bg-error/5',
        text: 'text-error',
        border: 'border-error/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-error)_l_c_h_/_0.15)]',
        iconBg: 'bg-error/10',
        bar: 'bg-error'
    },
    accent: {
        bg: 'bg-accent/5',
        text: 'text-accent',
        border: 'border-accent/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-accent)_l_c_h_/_0.15)]',
        iconBg: 'bg-accent/10',
        bar: 'bg-accent'
    },
    secondary: {
        bg: 'bg-secondary/5',
        text: 'text-secondary',
        border: 'border-secondary/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-secondary)_l_c_h_/_0.15)]',
        iconBg: 'bg-secondary/10',
        bar: 'bg-secondary'
    },
    info: {
        bg: 'bg-info/5',
        text: 'text-info',
        border: 'border-info/20',
        glow: 'shadow-[0_20px_50px_-12px_oklch(from_var(--color-info)_l_c_h_/_0.15)]',
        iconBg: 'bg-info/10',
        bar: 'bg-info'
    }
} as const;

type SemanticColor = keyof typeof SEMANTIC_COLORS;

/**
 * DashboardPage: The high-fidelity mission control for the user's learning journey.
 * Incorporates real-time pulse data and FSRS statistics.
 */
export const DashboardPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    useActiveView('v:dashboard');
    useActiveView('v:asset');    // Required for Subject Topology
    useActiveView('v:due_list'); // Required for Retention Matrix & Activity Heatmap

    // ✅ FIX: Use useShallow for object selectors to prevent infinite re-renders
    // When dashboard.me is undefined, we select individual primitive values instead
    const dashData = useAppStore(
        useShallow((s) => {
            const me = s.entities.dashboard.me;
            return {
                due_count: me?.due_count ?? 0,
                avg_stability: me?.avg_stability ?? 0,
                streak_days: me?.streak_days ?? 0,
                total_count: me?.total_count ?? 0,
                overdue_count: me?.overdue_count ?? 0,
            };
        })
    );

    const profile = useUserSettings(s => s.profile);
    const { i18n: i18nInstance } = useTranslation();

    // Sync HTML lang for CSS targeting
    React.useEffect(() => {
        document.documentElement.lang = i18nInstance.language;
    }, [i18nInstance.language]);

    // --- Derived Data ---
    const stats = useMemo(() => ({
        due: dashData.due_count,
        stability: dashData.avg_stability * 10, // Stability in pulse might be raw, Dashboard expects %
        streak: dashData.streak_days,
        items: dashData.total_count,
        overdue: dashData.overdue_count,
        targetStability: 90.0,
    }), [dashData]);


    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        const nickname = profile.username || t('welcome.default_username');
        if (hour < 12) return t('welcome.greeting.morning', { name: nickname });
        if (hour < 18) return t('welcome.greeting.afternoon', { name: nickname });
        return t('welcome.greeting.evening', { name: nickname });
    }, [t, profile.username]);

    const [viewStrategy, setViewStrategy] = React.useState<'efficiency' | 'volume'>('efficiency');

    // Get subjects and cards data from store for dynamic Subject Rows
    // Use useShallow to prevent infinite re-renders from Object.values creating new array reference
    const assetsObj = useAppStore(useShallow(s => s.entities.assets));
    const cardsPulseObj = useAppStore(useShallow(s => s.entities.cardsPulse));
    const questionsObj = useAppStore(useShallow(s => s.entities.questions));

    const allSubjects = useMemo(() => {
        return Object.values(assetsObj).filter((a: any) => a.type === 'subject');
    }, [assetsObj]);

    const dueList = useMemo(() => {
        return Object.values(cardsPulseObj);
    }, [cardsPulseObj]);

    const questions = questionsObj;

    // Compute subject statistics
    const subjectStats = useMemo(() => {
        const statsMap: Record<string, { name: string; color: string; count: number; due: number; totalStability: number }> = {};

        // Initialize from subjects
        allSubjects.forEach((subject: any) => {
            statsMap[subject.id] = {
                name: subject.name,
                color: subject.color || 'primary',
                count: 0,
                due: 0,
                totalStability: 0
            };
        });

        // Count cards and due items per subject
        const now = new Date();
        Object.values(questions).forEach((q: any) => {
            if (q.subject_id && statsMap[q.subject_id]) {
                statsMap[q.subject_id].count++;
            }
        });

        dueList.forEach((card: any) => {
            // Find the question to get subject_id
            const question = questions[card.question_id];
            if (question?.subject_id && statsMap[question.subject_id]) {
                const cardDue = new Date(card.due);
                if (cardDue <= now) {
                    statsMap[question.subject_id].due++;
                }
                statsMap[question.subject_id].totalStability += (card.stability || 0);
            }
        });

        // Convert to array and compute mastery level
        return Object.entries(statsMap)
            .filter(([_, data]) => data.count > 0) // Only subjects with cards
            .map(([id, data]) => ({
                id,
                name: data.name,
                color: data.color,
                count: data.count,
                due: data.due,
                masterLevel: data.count > 0 ? Math.min(100, Math.round((data.totalStability / data.count) * 3)) : 0
            }))
            .sort((a, b) => b.count - a.count) // Sort by most cards
            .slice(0, 4); // Top 4 subjects
    }, [allSubjects, dueList, questions]);

    // Derived Action Guidance
    const suggestedAction = stats.due > 0
        ? t('dashboard.insight.action_focus')
        : t('dashboard.insight.action_rest');

    const SuggestedIcon = stats.due > 0 ? Zap : Flame;
    const suggestedColor = stats.due > 0 ? 'text-primary' : 'text-success';

    // Data for the Retention Matrix - computed from real card stability data
    // Use the already-fetched cardsPulseObj to avoid duplicate selectors
    const cardsPulse = cardsPulseObj;

    // Compute activity heatmap based on last_review dates from cards
    const activityHeatmap = useMemo(() => {
        const cards = Object.values(cardsPulse);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Create a map for the last 42 days
        const dayMap: Record<string, number> = {};
        for (let i = 0; i < 42; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0];
            dayMap[key] = 0;
        }

        // Count reviews per day based on last_review
        cards.forEach((card: any) => {
            if (card.last_review) {
                const reviewDate = new Date(card.last_review).toISOString().split('T')[0];
                if (dayMap[reviewDate] !== undefined) {
                    dayMap[reviewDate]++;
                }
            }
        });

        // Convert to array (most recent first)
        const maxActivity = Math.max(...Object.values(dayMap), 1);
        return Object.entries(dayMap)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, count]) => ({
                date,
                count,
                intensity: count / maxActivity // 0 to 1
            }));
    }, [cardsPulse]);

    // Compute active rate and efficiency from heatmap
    const activityMetrics = useMemo(() => {
        const activeDays = activityHeatmap.filter(d => d.count > 0).length;
        const activeRate = Math.round((activeDays / 42) * 100);
        const avgIntensity = activityHeatmap.reduce((sum, d) => sum + d.intensity, 0) / 42;
        const efficiency = Math.round(avgIntensity * 100);
        return { activeRate, efficiency };
    }, [activityHeatmap]);


    const retentionMatrix = useMemo(() => {
        const cards = Object.values(cardsPulse);
        const totalCards = cards.length;

        if (totalCards === 0) {
            // No cards - show empty state placeholders
            return [
                { label: 'Short Term', value: 0, color: 'neutral' as const, count: 0, stability: '0-2d' },
                { label: 'Developing', value: 0, color: 'primary' as const, count: 0, stability: '2-15d' },
                { label: 'Stabilizing', value: 0, color: 'primary' as const, count: 0, stability: '15-60d' },
                { label: 'Long Term', value: 0, color: 'success' as const, count: 0, stability: '60d+' },
            ];
        }

        // Stability distribution by tiers (in days)
        // tier1: stability 0-2 days (Short Term)
        // tier2: stability 2-15 days (Developing)
        // tier3: stability 15-60 days (Stabilizing)
        // tier4: stability 60+ days (Long Term)
        let tier1 = 0, tier2 = 0, tier3 = 0, tier4 = 0;

        cards.forEach((card: any) => {
            const stability = card.stability ?? 0;
            if (stability < 2) tier1++;
            else if (stability < 15) tier2++;
            else if (stability < 60) tier3++;
            else tier4++;
        });

        if (viewStrategy === 'efficiency') {
            // Efficiency view: percentage of cards approaching mastery (inverted - lower is better in chart height)
            return [
                { label: 'Short Term', value: Math.round((tier1 / totalCards) * 100), color: 'neutral' as const, count: tier1, stability: '0-2d' },
                { label: 'Developing', value: Math.round((tier2 / totalCards) * 100), color: 'primary' as const, count: tier2, stability: '2-15d' },
                { label: 'Stabilizing', value: Math.round((tier3 / totalCards) * 100), color: 'primary' as const, count: tier3, stability: '15-60d' },
                { label: 'Long Term', value: Math.round((tier4 / totalCards) * 100), color: 'success' as const, count: tier4, stability: '60d+' },
            ];
        }

        // Volume view: absolute card counts (normalized as percentage for chart display)
        const maxTier = Math.max(tier1, tier2, tier3, tier4, 1);
        return [
            { label: 'New/Learning', value: Math.round((tier1 / maxTier) * 100), color: tier1 > maxTier * 0.3 ? 'error' as const : 'warning' as const, count: tier1, stability: 'New' },
            { label: 'Short Term', value: Math.round((tier2 / maxTier) * 100), color: 'primary' as const, count: tier2, stability: 'Building' },
            { label: 'Medium Term', value: Math.round((tier3 / maxTier) * 100), color: 'primary' as const, count: tier3, stability: 'Stable' },
            { label: 'Long Term', value: Math.round((tier4 / maxTier) * 100), color: 'success' as const, count: tier4, stability: 'Mastered' },
        ];
    }, [cardsPulse, viewStrategy]);

    return (
        <div className="min-h-full p-4 md:p-12 lg:p-16 bg-mesh-surface reveal-smooth relative">
            <div className="max-w-7xl mx-auto w-full flex flex-col gap-10 pb-20">
                <style>
                    {`
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                    .animate-shimmer {
                        background: linear-gradient(90deg, transparent, oklch(from var(--color-base-content) l c h / 0.05), transparent);
                        background-size: 200% 100%;
                        animation: shimmer 2.5s infinite linear;
                    }
                `}
                </style>
                {/* Global UX Overrides for Dashboard */}
                <style>
                    {`
                    html[lang="zh"] .uppercase { text-transform: none !important; }
                    html[lang="zh"] [class*="tracking-"] { letter-spacing: normal !important; }
                    
                    .hover-rotate-6-effect:hover {
                        transform: rotate(6deg) scale(1.1);
                    }
                    
                    @media (prefers-reduced-motion: reduce) {
                        .animate-in, .reveal-smooth, .stagger-children > *, .hover-rotate-6-effect {
                            animation: none !important;
                            transition: none !important;
                            transform: none !important;
                        }
                    }
                `}
                </style>
                {/* 1. Goal-Oriented Hero: High-Fidelity Mission Center */}
                <header className="glass-card-premium p-0 overflow-hidden border-none shadow-premium-xl relative group">
                    <div className="flex flex-col lg:flex-row min-h-[260px]">
                        <div className="flex-1 p-8 lg:p-12 space-y-6 relative z-10">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />

                            <div className="relative z-20 space-y-4">
                                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full w-fit border border-primary/20">
                                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t('welcome.hero.badge')}</span>
                                </div>
                                <h1 className="text-5xl lg:text-7xl font-black text-base-content tracking-tighter leading-none">
                                    {greeting}<span className="text-primary animate-pulse">.</span>
                                </h1>
                                <div className="text-base-content/40 text-sm font-bold flex items-center gap-3 italic">
                                    <div className="w-2 h-2 rounded-full bg-success opacity-80 animate-ping" />
                                    {t('welcome.hero.status', { count: stats.items })}
                                </div>
                            </div>
                        </div>

                        <div className="lg:w-[450px] p-8 lg:p-12 flex flex-col justify-center gap-8 bg-base-content/[0.03] border-l border-base-content/5 relative z-10 backdrop-blur-md">
                            <div className="space-y-2">
                                {stats.due > 0 ? (
                                    <div className="space-y-1">
                                        <div className="flex items-baseline gap-2">
                                            <h2 className="text-5xl font-black text-base-content tabular-nums tracking-tighter leading-none">
                                                {stats.due}
                                            </h2>
                                            <span className="text-xs font-black text-base-content/30 uppercase tracking-[0.2em]">{t('welcome.quick_actions.review.unit')}</span>
                                        </div>
                                        <p className="text-xs font-black text-primary/60 uppercase tracking-widest italic font-mono">
                                            Est. {Math.ceil(stats.due * 0.5)} mins to target stability.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <h2 className="text-4xl font-black text-success tracking-tighter leading-none">{t('dashboard.all_clear.title')}</h2>
                                        <p className="text-xs font-black text-base-content/40 uppercase tracking-widest italic">{t('dashboard.all_clear.subtitle')}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => navigate('/review')}
                                    disabled={stats.due === 0}
                                    className={cn(
                                        "btn h-16 rounded-[2rem] flex-1 shadow-premium-lg group se-interactive border-none relative overflow-hidden",
                                        stats.due > 0 ? "btn-primary" : "btn-disabled opacity-30"
                                    )}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                    <Zap className="w-5 h-5 fill-current" />
                                    <span className="text-sm font-black uppercase tracking-widest">{t('welcome.states.ready.btn')}</span>
                                </button>
                                <button
                                    onClick={() => navigate('/manage')}
                                    className="btn btn-ghost h-16 w-16 rounded-[2rem] border border-base-content/10 bg-base-100/50 hover:bg-base-content/10 p-0 transform hover:rotate-90 transition-all duration-500"
                                >
                                    <Plus className="w-8 h-8 opacity-40 group-hover:opacity-100" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Decorative background blurs inside header */}
                    <div className="absolute -top-32 -left-32 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-primary/10 transition-colors" />
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* P0: Immediate Action Stats with Overdue Warning */}
                    <StatCard
                        icon={stats.overdue > 0 ? AlertCircle : Activity}
                        label={t('dashboard.metrics.pulse')}
                        value={stats.due}
                        detail={stats.overdue > 0
                            ? t('dashboard.overdue_warning', { count: stats.overdue, defaultValue: `${stats.overdue} overdue` })
                            : stats.due > 0
                                ? t('dashboard.on_track', { defaultValue: 'On track' })
                                : t('dashboard.all_clear', { defaultValue: 'All clear' })
                        }
                        color={stats.overdue > 0 ? "error" : stats.due > 0 ? "primary" : "success"}
                        onClick={() => navigate('/review')}
                    />

                    {/* P1: Lapse Rate - Redesigned for consistency */}
                    <div className="glass-card-premium p-6 border-none flex flex-col gap-4 group cursor-default transition-all duration-500 bg-base-content/[0.03] hover:bg-base-content/[0.06]">
                        <div className="flex justify-between items-start">
                            <div className="p-3 rounded-2xl transition-all duration-500 bg-error/10 text-error hover-rotate-6-effect">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-success/10 rounded-full">
                                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                <span className="text-[9px] font-black text-success uppercase tracking-wider">Improving</span>
                            </div>
                        </div>

                        <div className="space-y-2 mt-auto">
                            <p className="text-[11px] font-black text-base-content/30 uppercase tracking-widest">{t('dashboard.quality.lapse_rate')}</p>
                            <div className="flex items-baseline gap-3">
                                <h4 className="text-4xl font-black text-error tracking-tighter se-mono leading-none">4.8%</h4>
                                <span className="text-sm font-black text-success flex items-center gap-1">
                                    <TrendingUp size={12} />
                                    -1.2%
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-error/10 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-error to-error/70 w-[48%] transition-all duration-1000" />
                            </div>
                        </div>
                    </div>

                    <StatCard
                        icon={Shield}
                        label={t('dashboard.metrics.stability')}
                        value={`${stats.stability.toFixed(1)}%`}
                        detail={`Target: ${stats.targetStability}%`}
                        color={stats.stability < 80 ? "warning" : "success"}
                    />

                    <StatCard
                        icon={Brain}
                        label={t('dashboard.metrics.persistence')}
                        value={stats.streak}
                        detail={stats.streak > 0 ? "Habit persistence active" : "Start a habit today"}
                        color={stats.streak > 0 ? "secondary" : "neutral"}
                        active={stats.streak > 0}
                    />
                </div>

                {/* Insight Recommendation Banner */}
                <div className="glass-card-premium p-8 bg-gradient-to-r from-primary/10 via-transparent to-transparent border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-8 group hover:shadow-premium-xl transition-all duration-1000">
                    <div className="flex items-center gap-8">
                        <div className={cn("w-16 h-16 rounded-3xl flex items-center justify-center bg-white shadow-premium-lg rotate-3 group-hover:rotate-12 group-hover:scale-110 transition-all duration-500", suggestedColor)}>
                            <SuggestedIcon size={32} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-[11px] font-black text-base-content/50 uppercase tracking-[0.2em]">{t('dashboard.insight.suggested_action')}</h3>
                            <p className="text-2xl font-black text-base-content leading-tight">{suggestedAction}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate(stats.due > 0 ? '/review' : '/import')}
                        className="btn btn-primary h-16 rounded-[2rem] px-12 gap-3 group se-interactive shadow-premium-lg border-none"
                    >
                        <span className="text-sm font-black uppercase tracking-widest">{t('dashboard.insight.act_now', { defaultValue: 'Act Now' })}</span>
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {/* 3. Global Activity Analytics */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Retention Matrix Visualization: Strategy Switch */}
                    <div className="xl:col-span-2 glass-card-premium p-10 flex flex-col gap-10 group overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-base-content tracking-tight uppercase flex items-center gap-2">
                                    <Target className="w-5 h-5 text-primary" />
                                    {t('dashboard.retention.title')}
                                </h3>
                                <p className="text-base-content/40 text-sm font-medium">{t('dashboard.retention.desc')}</p>
                            </div>
                            <div className="flex gap-2 p-1 bg-base-content/[0.03] rounded-xl border border-base-content/10">
                                <button
                                    onClick={() => setViewStrategy('efficiency')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all",
                                        viewStrategy === 'efficiency' ? "bg-base-100 shadow-sm text-primary" : "opacity-40 hover:opacity-100"
                                    )}
                                >
                                    {t('dashboard.retention.efficiency', { defaultValue: 'Efficiency' })}
                                </button>
                                <button
                                    onClick={() => setViewStrategy('volume')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all",
                                        viewStrategy === 'volume' ? "bg-base-100 shadow-sm text-primary" : "opacity-40 hover:opacity-100"
                                    )}
                                >
                                    {t('dashboard.retention.volume', { defaultValue: 'Volume' })}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 flex-1 items-end min-h-[160px]">
                            {retentionMatrix.map((item, i) => (
                                <div
                                    key={item.label}
                                    className="flex flex-col gap-4 group/bar cursor-pointer"
                                    onClick={() => navigate('/manage')}
                                    title={`Review items in ${item.label}`}
                                >
                                    <div className="relative h-40 w-full bg-base-content/[0.02] rounded-3xl overflow-hidden border border-base-content/5 transition-colors group-hover/bar:border-primary/20">
                                        <div
                                            className={cn(
                                                "absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out",
                                                SEMANTIC_COLORS[item.color].bar,
                                                "opacity-40 group-hover/bar:opacity-60"
                                            )}
                                            style={{ height: `${item.value}%`, transitionDelay: `${i * 100}ms` }}
                                        >
                                            <div className={cn("absolute top-0 left-0 right-0 h-1", SEMANTIC_COLORS[item.color].bar, "shadow-lg shadow-current")} />
                                        </div>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/bar:translate-y-0">
                                            <span className="text-2xl font-black text-base-content se-mono">{item.value}%</span>
                                            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest">{item.count} Items</span>
                                        </div>
                                    </div>
                                    <div className="space-y-0.5 px-2">
                                        <p className="text-[11px] font-bold text-base-content/40 uppercase tracking-widest truncate">{item.label}</p>
                                        <p className="text-xs font-black text-base-content/80 se-mono">INTERVAL: {item.stability}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-8 pt-6 border-t border-base-content/5 mt-auto">
                            <MetricBadge label={t('dashboard.retention.avg_stability')} value="12.4 Days" />
                            <MetricBadge label={t('dashboard.retention.peak_accuracy')} value="94.2%" trend="+2.1%" color="success" />
                            <MetricBadge label={t('dashboard.retention.overdue_drift')} value="1.2%" color="error" />
                            <div className="flex-1" />
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-success/5 rounded-full border border-success/10">
                                <div className="w-1.5 h-1.5 rounded-full bg-success opacity-80" />
                                <span className="text-[10px] font-black text-success uppercase tracking-widest leading-none">Healthy Sync</span>
                            </div>
                        </div>
                    </div>

                    {/* Insight Panel: AI Analysis & Persistence Heatmap Wrapper */}
                    <div className="glass-card-premium p-10 flex flex-col gap-10 bg-primary/5 border-primary/10 overflow-hidden relative min-h-[500px] group transition-all duration-1000 shadow-premium-lg">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                            <Brain className="w-32 h-32" />
                        </div>

                        <div className="absolute -left-20 -top-20 w-48 h-48 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />

                        <div className="space-y-1 relative z-10">
                            <h3 className="text-xl font-black text-base-content tracking-tight uppercase flex items-center gap-2">
                                <Brain className="w-5 h-5 text-primary" />
                                {t('dashboard.insight.title')}
                            </h3>
                            <p className="text-base-content/40 text-[11px] font-bold uppercase tracking-widest">Actionable Advice</p>
                        </div>

                        <div className="space-y-5 relative z-10">
                            <InsightRow
                                icon={TrendingUp}
                                label="Recommended Goal"
                                value="32 Cards"
                                desc="Target 18 mins to maintain 90% retention."
                            />
                            <InsightRow
                                icon={Activity}
                                label="System Load"
                                value="Balanced"
                                desc="Current density is optimal for your stability."
                            />
                            <InsightRow
                                icon={AlertCircle}
                                label="Top Obstacle"
                                color="warning"
                                value="Overdue Drift"
                                desc="Prioritize the Overdue group in review."
                            />
                        </div>

                        <div className="mt-auto space-y-4 pt-6 border-t border-base-content/5 relative z-10">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-base-content/40">
                                    <span>Curriculum Progress</span>
                                    <span className="text-primary se-mono">82%</span>
                                </div>
                                <div className="w-full h-2 bg-base-content/5 rounded-full overflow-hidden">
                                    <div className="h-full w-[82%] bg-gradient-to-r from-primary to-accent transition-all duration-1000" />
                                </div>
                            </div>
                            <button className="btn btn-primary w-full h-12 rounded-2xl group se-interactive shadow-lg shadow-primary/20 border-none">
                                <span className="text-sm font-black uppercase tracking-widest leading-none">{t('welcome.hero.btn_analyze')}</span>
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. Subject Topology & Recent Progress */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Subject Topology List */}
                    <div className="lg:col-span-2 glass-card-premium p-10 flex flex-col gap-8">
                        <div className="flex justify-between items-center">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-base-content tracking-tight uppercase flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-secondary" />
                                    {t('dashboard.subjects.title')}
                                </h3>
                            </div>
                            <Link to="/manage" className="text-[10px] font-black text-primary uppercase tracking-[0.15em] hover:underline flex items-center gap-1">
                                {t('common.all')} <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {subjectStats.length > 0 ? (
                                subjectStats.map((subject) => (
                                    <SubjectRow
                                        key={subject.id}
                                        name={subject.name}
                                        count={subject.count}
                                        due={subject.due}
                                        masterLevel={subject.masterLevel}
                                        color={subject.color as 'primary' | 'secondary' | 'accent' | 'error'}
                                    />
                                ))
                            ) : (
                                <div className="col-span-2 p-8 text-center border border-dashed border-base-content/10 rounded-2xl">
                                    <Layers className="w-8 h-8 text-base-content/10 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-base-content/30">
                                        {t('dashboard.subjects.empty', { defaultValue: 'No subjects yet. Import questions to get started.' })}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*学习习惯 / Persistence Heatmap */}
                    <div className="glass-card-premium p-10 flex flex-col gap-8 group">
                        <div className="flex justify-between items-center">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-base-content tracking-tight uppercase flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-accent" />
                                    {t('dashboard.discipline.title')}
                                </h3>
                            </div>
                        </div>

                        {/* Highly stylized persistence heatmap grid */}
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">
                                    {t('dashboard.discipline.last_42_days', { defaultValue: 'Last 42 Days' })}
                                </span>
                                {activityMetrics.activeRate > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-success/10 text-success text-[9px] font-black uppercase">
                                        {t('dashboard.discipline.active', { defaultValue: 'Active' })}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-7 gap-2 pb-4">
                                {activityHeatmap.map((day, i) => {
                                    const isActive = day.count > 0;
                                    // Color intensity based on activity
                                    const intensityClass = day.intensity > 0.7
                                        ? 'bg-primary border-primary/30'
                                        : day.intensity > 0.3
                                            ? 'bg-primary/50 border-primary/20'
                                            : day.intensity > 0
                                                ? 'bg-primary/25 border-primary/10'
                                                : 'bg-base-content/[0.03] border-base-content/5 opacity-40';

                                    return (
                                        <div
                                            key={i}
                                            className={cn(
                                                "aspect-square rounded-lg border transition-all duration-300 cursor-pointer hover:scale-110 hover:z-10 hover:border-primary/50",
                                                intensityClass,
                                                isActive && "shadow-[0_0_8px_oklch(from_var(--color-primary)_l_c_h_/_0.1)]"
                                            )}
                                            title={`${day.date}: ${day.count} ${t('dashboard.discipline.reviews', { defaultValue: 'reviews' })}`}
                                        />
                                    );
                                })}
                            </div>

                            <div className="pt-6 border-t border-base-content/5 space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black text-base-content/30 uppercase tracking-widest">
                                            {t('dashboard.discipline.active_rate', { defaultValue: 'Active Rate' })}
                                        </p>
                                        <p className="text-xl font-black text-base-content se-mono">{activityMetrics.activeRate}%</p>
                                    </div>
                                    <div className="text-right space-y-0.5">
                                        <p className="text-[10px] font-black text-base-content/30 uppercase tracking-widest">
                                            {t('dashboard.discipline.efficiency', { defaultValue: 'Efficiency' })}
                                        </p>
                                        <p className="text-xl font-black text-primary se-mono">{activityMetrics.efficiency}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mt-auto text-[10px] font-black uppercase text-base-content/30 tracking-widest pt-4 border-t border-base-content/5">
                            <span>LITE</span>
                            <div className="flex gap-1.5 items-center px-4">
                                <div className="w-2 h-2 rounded-full bg-base-content/10" />
                                <div className="w-2 h-2 rounded-full bg-primary/20" />
                                <div className="w-2 h-2 rounded-full bg-primary/50" />
                                <div className="w-2 h-2 rounded-full bg-primary" />
                            </div>
                            <span>HIGH</span>
                        </div>
                    </div>
                </div>

                {/* Recently Added Traps Section */}
                <div className="glass-card-premium p-10 border-base-content/5 space-y-8">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-xl font-black text-base-content tracking-tight">{t('dashboard.quality.new_traps')}</h3>
                            <p className="text-sm font-medium text-base-content/40">Knowledge nodes with high recent failure rates</p>
                        </div>
                        <AlertCircle className="w-5 h-5 text-warning" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { title: 'Transformer Layer Norm', count: 3, subject: 'AI Architecture' },
                            { title: 'Redux Middleware Saga', count: 2, subject: 'Frontend' },
                            { title: 'PostgreSQL ACID', count: 2, subject: 'Backend' },
                        ].map((trap, idx) => (
                            <div key={idx} className="p-4 rounded-2xl bg-base-content/[0.02] border border-base-content/5 flex items-center justify-between group hover:bg-warning/5 hover:border-warning/20 transition-all cursor-pointer">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase text-base-content/30 mb-0.5 tracking-widest">{trap.subject}</p>
                                    <p className="text-sm font-black text-base-content truncate pr-4">{trap.title}</p>
                                </div>
                                <div className="flex flex-col items-center shrink-0">
                                    <span className="text-xl font-black text-warning leading-none">{trap.count}</span>
                                    <span className="text-[8px] font-bold text-warning/40 uppercase">fails</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Sub-components (Architectural UI kit) ---

function StatCard({ icon: Icon, label, value, color = "neutral", active, detail, onClick }: {
    icon: any;
    label: string;
    value: string | number;
    color?: SemanticColor;
    active?: boolean;
    detail?: string;
    onClick?: () => void;
}) {
    const config = SEMANTIC_COLORS[color];

    return (
        <div
            onClick={onClick}
            className={cn(
                "glass-card-premium p-6 border-none flex flex-col gap-6 group cursor-pointer transition-all duration-500",
                "bg-base-content/[0.03] hover:bg-base-content/[0.06]",
                onClick && "se-interactive"
            )}
        >
            <div className="flex justify-between items-start">
                <div className={cn("p-3 rounded-2xl transition-all duration-500 hover-rotate-6-effect", config.iconBg, config.text)}>
                    <Icon className="w-6 h-6" />
                </div>
                {active && (
                    <div className="motion-safe:animate-bounce">
                        <Flame className="w-5 h-5 text-error fill-current drop-shadow-sm" />
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <p className="text-[11px] font-black text-base-content/30 uppercase tracking-widest">{label}</p>
                <h4 className={cn("text-4xl font-black tracking-tighter se-mono leading-none", config.text)}>
                    {value}
                </h4>
                <p className="text-xs font-bold text-base-content/40 truncate pt-2 mt-2 border-t border-base-content/5">
                    {detail}
                </p>
            </div>
        </div>
    );
}

function MetricBadge({ label, value, trend, color = "neutral" }: {
    label: string,
    value: string,
    trend?: string,
    color?: SemanticColor
}) {
    const config = SEMANTIC_COLORS[color];
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-base-content/30 uppercase tracking-widest">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-sm font-black text-base-content/90 se-mono">{value}</span>
                {trend && (
                    <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter", config.iconBg, config.text)}>
                        {trend}
                    </span>
                )}
            </div>
        </div>
    );
}

function InsightRow({ icon: Icon, label, value, desc, color = "primary" }: {
    icon: any;
    label: string;
    value: string;
    desc: string;
    color?: SemanticColor;
}) {
    const config = SEMANTIC_COLORS[color];
    return (
        <div className="flex items-start gap-4 p-3.5 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer group/insight">
            <div className={cn("mt-0.5 p-2 rounded-xl group-hover/insight:bg-opacity-20 transition-colors", config.bg, config.text)}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 flex-1">
                <div className="flex justify-between items-center">
                    <h5 className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{label}</h5>
                    <span className={cn("text-[11px] font-black se-mono", config.text)}>{value}</span>
                </div>
                <p className="text-[11px] font-bold text-base-content/70 leading-relaxed line-clamp-1">{desc}</p>
            </div>
        </div>
    );
}

function SubjectRow({ name, count, due, masterLevel, color = "primary" }: {
    name: string;
    count: number;
    due: number;
    masterLevel: number;
    color?: SemanticColor | string; // Allow hex colors from database
}) {
    // Fallback to 'primary' if color is not a valid SemanticColor key (e.g., hex color)
    const config = SEMANTIC_COLORS[color as SemanticColor] || SEMANTIC_COLORS.primary;
    return (
        <div className="group flex items-center justify-between p-5 rounded-3xl bg-base-content/[0.02] hover:bg-base-content/[0.05] transition-all border border-base-content/5 hover:border-base-content/10 se-interactive glass-card-premium">
            <div className="flex items-center gap-5 min-w-0">
                <div className={cn("p-3.5 rounded-2xl transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 shadow-inner", config.iconBg, config.text)}>
                    <BadgeCheck className="w-6 h-6" />
                </div>
                <div className="space-y-0.5 truncate">
                    <h5 className="text-sm font-black text-base-content/90 tracking-tight truncate uppercase">{name}</h5>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-base-content/30 uppercase tracking-[0.2em]">{count} Total</span>
                        <div className="w-1 h-1 rounded-full bg-base-content/10" />
                        <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">{due} Due</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 pl-2">
                <div className="flex flex-col items-end gap-1 underline-offset-4">
                    <span className="text-[10px] font-black text-base-content/40 uppercase tracking-widest se-mono">{masterLevel}%</span>
                    <div className="w-16 h-1 bg-base-content/5 rounded-full overflow-hidden">
                        <div
                            className={cn("h-full transition-all duration-1000", config.bar)}
                            style={{ width: `${masterLevel}%` }}
                        />
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-20 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary" />
            </div>
        </div>
    );
}

export default DashboardPage;
