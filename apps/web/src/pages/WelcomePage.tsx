import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../app/state/useAppStore';
import { useUserSettings } from '../app/state/useUserSettings';
import { useActiveView } from '../app/hooks/useActiveView';
import { cn } from '../app/utils/cn';
import { Zap, Library, Upload, BarChart3, ArrowRight, CheckCircle2, Sparkles, Clock, AlertTriangle } from 'lucide-react';
import { TimerHUD } from '../components/ui/TimerHUD';

// ============================================================================
// DESIGN TOKENS & CONSTANTS
// ============================================================================

/** Estimated time per card in minutes */
const MINUTES_PER_CARD = 0.7;

/** Threshold for "low time" warning colors (60 mins) */
const URGENCY_THRESHOLD_MINS = 60;

/** Threshold for "critical time" error colors (10 mins) */
const CRITICAL_THRESHOLD_MINS = 10;

/** dueCount thresholds for CTA emphasis levels */
const DUE_THRESHOLDS = {
    low: 5,      // 1-5: gentle emphasis
    medium: 20,  // 6-20: normal emphasis
    high: 50,    // 21-50: strong but focused
} as const;

// ============================================================================
// VIEW STATE TYPES
// ============================================================================

type ViewState = 'ready' | 'clear' | 'empty' | 'loading';

interface DashboardData {
    due_count?: number;
    total_count?: number;
    streak_days?: number;
    avg_stability?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const estimateReviewTime = (count: number): string => {
    const mins = Math.ceil(count * MINUTES_PER_CARD);
    if (mins < 1) return '< 1';
    if (mins >= 60) {
        const hours = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        return remainingMins > 0 ? `${hours}h ${remainingMins}` : `${hours}h`;
    }
    return `${mins}`;
};

const getViewState = (dash: DashboardData): ViewState => {
    const dueCount = dash.due_count ?? 0;
    const totalCount = dash.total_count;

    if (dueCount > 0) return 'ready';
    if (totalCount === undefined) return 'loading';
    if (totalCount === 0) return 'empty';
    return 'clear';
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const WelcomePage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    useActiveView('v:dashboard');
    const profile = useUserSettings(s => s.profile);
    const preferences = useUserSettings(s => s.preferences);
    const { i18n: i18nInstance } = useTranslation();

    const dashEntity = useAppStore(s => s.entities.dashboard['me']) as DashboardData | undefined;
    const dash: DashboardData = dashEntity || {};

    const dueCount = dash.due_count ?? 0;
    const hasDueCards = dueCount > 0;
    const viewState = getViewState(dash);


    // ========================================================================
    // LOCAL STATE
    // ========================================================================
    const [greeting, setGreeting] = useState('');
    const [hasAnimatedCTA, setHasAnimatedCTA] = useState(false);
    const ctaRef = useRef<HTMLButtonElement>(null);

    // ========================================================================
    // TIME CALCULATIONS
    // ========================================================================

    const calculateTimeLeft = useCallback(() => {
        const now = new Date();
        let target = new Date();

        if (preferences.countdownMode === 'daily') {
            target.setHours(preferences.rolloverHour, 0, 0, 0);
            if (now.getHours() >= preferences.rolloverHour) {
                target.setDate(target.getDate() + 1);
            }
        } else {
            const [h, m] = (preferences.customTargetTime || "18:00").split(':').map(Number);
            if (preferences.customTargetDate) {
                const [year, month, day] = preferences.customTargetDate.split('-').map(Number);
                target = new Date(year, month - 1, day, h, m, 0, 0);
            } else {
                target.setHours(h, m, 0, 0);
                if (now > target) {
                    target.setDate(target.getDate() + 1);
                }
            }
        }

        const diff = target.getTime() - now.getTime();
        const effectiveDiff = Math.max(0, diff);

        return {
            d: Math.floor(effectiveDiff / (1000 * 60 * 60 * 24)),
            h: Math.floor((effectiveDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            m: Math.floor((effectiveDiff % (1000 * 60 * 60)) / (1000 * 60)),
            s: Math.floor((effectiveDiff % (1000 * 60)) / 1000)
        };
    }, [preferences.countdownMode, preferences.rolloverHour, preferences.customTargetTime, preferences.customTargetDate]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    useEffect(() => {
        document.documentElement.lang = i18nInstance.language;
    }, [i18nInstance.language]);

    useEffect(() => {
        const updateGreeting = () => {
            const hour = new Date().getHours();
            if (hour < 5) setGreeting(t('welcome.greeting.night'));
            else if (hour < 12) setGreeting(t('welcome.greeting.morning'));
            else if (hour < 18) setGreeting(t('welcome.greeting.afternoon'));
            else setGreeting(t('welcome.greeting.evening'));
        };

        updateGreeting();
        const interval = setInterval(updateGreeting, 60000);
        return () => clearInterval(interval);
    }, [t]);

    // One-shot CTA animation on mount
    useEffect(() => {
        if (!hasAnimatedCTA && ctaRef.current && viewState === 'ready') {
            const timer = setTimeout(() => {
                setHasAnimatedCTA(true);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [hasAnimatedCTA, viewState]);

    // ========================================================================
    // DERIVED STATE (Stable)
    // ========================================================================
    // Ticker for urgency checks (updates every minute)
    const [minuteTick, setMinuteTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setMinuteTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const timeLeft = useMemo(() => calculateTimeLeft(), [calculateTimeLeft, minuteTick]);
    const totalMinutesLeft = timeLeft.d * 24 * 60 + timeLeft.h * 60 + timeLeft.m;
    const isUrgent = hasDueCards && totalMinutesLeft < URGENCY_THRESHOLD_MINS;
    const isCritical = hasDueCards && totalMinutesLeft < CRITICAL_THRESHOLD_MINS;


    const timerLabel = useMemo(() => {
        if (preferences.countdownMode === 'custom' && preferences.customEventName) {
            return preferences.customEventName;
        }
        return preferences.countdownMode === 'daily'
            ? t('welcome.timer.daily')
            : t('welcome.timer.custom');
    }, [preferences.countdownMode, preferences.customEventName, t]);

    const timerTargetTime = useMemo(() => {
        return preferences.countdownMode === 'daily'
            ? `${preferences.rolloverHour.toString().padStart(2, '0')}:00`
            : preferences.customTargetTime;
    }, [preferences.countdownMode, preferences.rolloverHour, preferences.customTargetTime]);

    const timerTargetDate = useMemo(() => {
        if (preferences.countdownMode === 'custom' && preferences.customTargetDate) {
            return preferences.customTargetDate;
        }
        return undefined;
    }, [preferences.countdownMode, preferences.customTargetDate]);

    const estimatedTime = estimateReviewTime(dueCount);

    const quickActions = useMemo(() => [
        {
            id: 'library',
            title: t('welcome.quick_actions.library.title'),
            icon: Library,
            path: '/questions',
            isRecommended: viewState === 'clear',
        },
        {
            id: 'import',
            title: t('welcome.quick_actions.import.title'),
            icon: Upload,
            path: '/import',
            isRecommended: viewState === 'empty',
        },
        {
            id: 'matrix',
            title: t('welcome.quick_actions.matrix.title'),
            icon: BarChart3,
            path: '/dashboard',
            isRecommended: false,
        }
    ], [t, viewState]);

    // ========================================================================
    // RENDER LOGIC
    // ========================================================================

    const renderHeroContent = () => {
        if (viewState === 'loading') {
            return (
                <div className="glass-card-premium p-8 md:p-10 flex flex-col items-center justify-center gap-6 overflow-hidden relative group min-h-[180px]">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer opacity-30" />
                    <div className="relative z-10 flex flex-col items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-base-content/5 flex items-center justify-center text-primary/40">
                            <Clock className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                        <div className="space-y-1 text-center">
                            <h2 className="text-2xl font-black text-base-content/30 tracking-tight animate-pulse-subtle">
                                {t('common.loading')}
                            </h2>
                            <p className="text-base-content/10 text-[10px] font-black uppercase tracking-widest">
                                {t('welcome.states.loading.desc')}
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        if (viewState === 'ready') {
            return (
                <div className="glass-card-premium p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-10 group overflow-hidden relative border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
                    <div className="absolute -top-32 -left-32 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none group-hover:bg-primary/10 transition-all duration-1000" />

                    <div className="relative z-10 flex-1 space-y-4 text-center md:text-left">
                        <div className="space-y-3">
                            <span className="ui-eyebrow inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black border border-primary/20 shadow-sm">
                                <Zap className="w-3.5 h-3.5 fill-current animate-pulse" />
                                {t('welcome.hero.badge')}
                            </span>
                            <h2 className="text-5xl md:text-7xl font-black text-base-content tracking-tighter leading-[0.85] filter drop-shadow-md">
                                {t('welcome.states.ready.title')}
                            </h2>
                        </div>
                        <p className="text-base-content/70 text-lg md:text-xl font-bold tracking-tight max-w-lg leading-snug drop-shadow-sm">
                            {t('welcome.hero.status', { count: dueCount })}
                        </p>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
                            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-base-300/50 border border-base-content/10 shadow-sm">
                                <Clock size={15} className="text-primary" />
                                <span className="text-base-content/80 text-[10px] font-black uppercase tracking-widest">
                                    ≈ {estimatedTime} {t('welcome.timer.min')}
                                </span>
                            </div>
                            {dueCount > DUE_THRESHOLDS.high && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-warning/5 border border-warning/10 text-warning/60 animate-in fade-in zoom-in duration-500">
                                    <AlertTriangle size={14} />
                                    <span className="text-[9px] font-black uppercase tracking-tighter leading-none">
                                        {t('welcome.states.ready.segmented_hint')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-center md:items-start gap-5">
                        <button
                            ref={ctaRef}
                            onClick={() => navigate('/review')}
                            className={cn(
                                "btn-premium-cta btn btn-primary h-20 rounded-[1.8rem] px-12 group/cta se-interactive border-none relative overflow-hidden transition-all duration-700 shadow-xl shadow-primary/20 hover:shadow-primary/40",
                                !hasAnimatedCTA && "animate-cta-entrance"
                            )}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover/cta:translate-x-full transition-transform duration-1000" />
                            <div className="relative z-10 flex items-center gap-5">
                                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover/cta:scale-110 group-hover/cta:rotate-6 transition-all duration-500 shadow-md border border-white/30">
                                    <Zap className="w-7 h-7 fill-current" />
                                </div>
                                <div className="text-left flex flex-col">
                                    <span className="ui-label text-[10px] font-black opacity-80 mb-0.5 tracking-[0.2em] uppercase">
                                        {t('welcome.states.ready.btn')}
                                    </span>
                                    <span className="text-3xl font-black leading-none tracking-tighter">
                                        {dueCount} {t('welcome.quick_actions.review.unit')}
                                    </span>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center ml-2 border border-white/10 group-hover/cta:translate-x-1.5 duration-300">
                                    <ArrowRight className="w-5 h-5" />
                                </div>
                            </div>
                        </button>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                            {dueCount > DUE_THRESHOLDS.high && (
                                <button
                                    onClick={() => navigate('/review?limit=20')}
                                    className="btn btn-sm h-10 rounded-2xl bg-base-300/50 hover:bg-primary/10 border-base-content/10 hover:border-primary/20 text-base-content/70 hover:text-primary px-4 gap-2 hover:scale-105 transition-all"
                                >
                                    <Clock size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{t('welcome.sessions.short') || "Concentration"} (15m)</span>
                                </button>
                            )}
                            {(isUrgent || isCritical) && (
                                <button
                                    onClick={() => navigate('/review?session=urgent')}
                                    className={cn(
                                        "btn btn-xs rounded-full font-black px-4 h-9 se-interactive transition-all duration-500",
                                        isCritical
                                            ? "bg-error/10 text-error border-error/20 hover:bg-error/20 animate-pulse"
                                            : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                                    )}
                                >
                                    <Zap size={14} className="mr-2" />
                                    {t('welcome.sessions.urgent')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        if (viewState === 'clear') {
            return (
                <div className="glass-card-premium p-8 md:p-10 text-center space-y-8 group overflow-hidden relative bg-gradient-to-br from-success/[0.02] to-transparent">
                    <div className="absolute inset-0 bg-gradient-to-b from-success/5 via-transparent to-transparent opacity-50" />
                    <div className="relative z-10 flex flex-col items-center gap-4">
                        <div className="w-20 h-20 rounded-[2rem] bg-success/10 flex items-center justify-center text-success rotate-3 group-hover:rotate-12 transition-all duration-700 shadow-2xl border border-success/20">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-4xl md:text-6xl font-black text-base-content tracking-tighter leading-none">
                                {t('welcome.states.clear.title')}
                            </h2>
                            <p className="text-base-content/40 text-lg font-medium tracking-tight">
                                {t('welcome.states.clear.badge')}
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-center gap-4">
                        <Link
                            to="/review?mode=practice"
                            className="btn h-14 px-8 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:scale-105 transition-all duration-500 gap-3 text-primary shadow-lg shadow-primary/5"
                        >
                            <Sparkles className="w-5 h-5 text-primary" />
                            <span className="ui-label text-xs uppercase tracking-[0.2em] font-black">{t('welcome.states.clear.btn_practice')}</span>
                        </Link>
                        <Link
                            to="/questions"
                            className="btn btn-primary btn-outline h-14 px-8 rounded-xl hover:scale-105 transition-all duration-500 border-2"
                        >
                            <Library className="w-5 h-5" />
                            <span className="ui-label text-xs uppercase tracking-widest">{t('welcome.states.clear.btn_browse')}</span>
                        </Link>
                    </div>
                </div>
            );
        }

        return (
            <div className="glass-card-premium p-8 md:p-10 text-center space-y-10 group overflow-hidden bg-gradient-to-br from-base-content/[0.01] to-transparent">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent opacity-30" />
                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="w-20 h-20 rounded-[2rem] bg-base-content/5 flex items-center justify-center text-base-content/30 rotate-12 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-1000 shadow-xl border border-base-content/10">
                        <Upload className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-4xl md:text-6xl font-black text-base-content tracking-tighter leading-none drop-shadow-md">
                            {t('welcome.states.empty.title')}
                        </h2>
                        <p className="text-base-content/60 text-lg font-bold tracking-tight italic opacity-80">
                            {t('welcome.states.empty.badge')}
                        </p>
                    </div>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-8">
                    <div className="flex flex-wrap justify-center items-center gap-6 text-base-content/30 text-[9px] font-black uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs shadow-lg">1</span>
                            <span>{t('welcome.onboarding.step1')}</span>
                        </div>
                        <ArrowRight size={14} className="opacity-15 hidden md:block" />
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-base-content/10 flex items-center justify-center text-xs text-base-content/50">2</span>
                            <span>{t('welcome.onboarding.step2')}</span>
                        </div>
                        <ArrowRight size={14} className="opacity-15 hidden md:block" />
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-base-content/10 flex items-center justify-center text-xs text-base-content/50">3</span>
                            <span>{t('welcome.onboarding.step3')}</span>
                        </div>
                    </div>
                    <Link
                        to="/import"
                        className="btn btn-primary h-16 rounded-2xl px-12 gap-4 shadow-xl hover:scale-105 transition-all duration-500 mt-2"
                    >
                        <Upload className="w-6 h-6" />
                        <span className="ui-label text-base uppercase tracking-widest">{t('welcome.states.empty.btn_import')}</span>
                    </Link>
                </div>
            </div>
        );
    };

    // ========================================================================
    // MAIN RENDER
    // ========================================================================

    return (
        <div className="min-h-full flex flex-col gap-8 pb-16 bg-transparent reveal-smooth relative overflow-x-hidden overflow-y-auto custom-scrollbar p-4 md:p-8 lg:p-10 welcome-page-container" data-perf="hi">
            <div className="premium-gradient-bg" />

            <div className="flex flex-col gap-8 reveal-smooth max-w-7xl mx-auto w-full relative z-10 mt-2">
                {/* Header: High Performance HUD */}
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <h1 className="text-4xl md:text-6xl font-black text-base-content tracking-tighter leading-tight filter drop-shadow-sm">
                            {greeting}, <span className="text-primary">{profile.username || t('welcome.default_username')}</span>
                        </h1>
                    </div>

                    <TimerHUD
                        active={hasDueCards}
                        label={timerLabel}
                        targetTime={timerTargetTime}
                        targetDate={timerTargetDate}
                        calc={calculateTimeLeft}
                        tDays={t('welcome.timer.days')}
                        tHours={t('welcome.timer.hours')}
                        tMin={t('welcome.timer.min')}
                        tSec={t('welcome.timer.sec')}
                    />
                </div>

                {/* Main Action Hub */}
                <div className="relative z-20 w-full">
                    {renderHeroContent()}
                </div>

                {/* Strategy Cards */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {quickActions.map((action) => (
                        <Link
                            key={action.id}
                            to={action.path}
                            className={cn(
                                "glass-card-premium p-6 group se-interactive outline-none focus-visible:ring-4 focus-visible:ring-primary/20 transition-all duration-500",
                                action.isRecommended
                                    ? "border-primary/50 bg-primary/10 ring-2 ring-primary/10 shadow-2xl shadow-primary/10 -translate-y-2 opacity-100"
                                    : "opacity-80 hover:opacity-100 hover:bg-base-content/[0.04] border-base-content/5"
                            )}
                        >
                            <div className="flex flex-col h-full gap-7">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-700 group-hover:rotate-12 group-hover:scale-110 shadow-lg border",
                                    action.isRecommended
                                        ? "bg-primary text-primary-content border-primary/30 shadow-primary/40"
                                        : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                )}>
                                    <action.icon size={26} strokeWidth={2.5} className={cn(!action.isRecommended && "drop-shadow-[0_0_8px_rgba(var(--color-primary),0.3)]")} />
                                </div>
                                <div className="space-y-2.5">
                                    <h4 className="text-xl font-black text-base-content tracking-tight group-hover:text-primary transition-colors duration-300">
                                        {action.title}
                                    </h4>
                                    <p className="text-xs font-bold text-base-content/60 leading-relaxed line-clamp-2 transition-colors duration-300 group-hover:text-base-content/80">
                                        {t(`welcome.quick_actions.${action.id}.desc`)}
                                    </p>
                                </div>
                                <div className="mt-auto pt-4 border-t border-base-content/5 flex items-center justify-between">
                                    <span className={cn(
                                        "ui-label text-[9px] font-black uppercase tracking-[0.25em]",
                                        action.isRecommended ? "text-primary opacity-100" : "text-base-content/30"
                                    )}>
                                        {action.isRecommended ? t('welcome.quick_actions.recommended') : t('welcome.quick_actions.quick_access')}
                                    </span>

                                    <div className={cn(
                                        "p-2 rounded-full transition-all duration-500",
                                        action.isRecommended ? "bg-primary/20 text-primary shadow-inner" : "bg-base-content/10 text-base-content/30 group-hover:bg-primary/10 group-hover:text-primary"
                                    )}>
                                        <ArrowRight size={20} />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </section>

                {/* Insights Preview Footer - Premium Polish */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 mt-6 py-10 px-10 border border-base-content/5 bg-base-content/[0.02] rounded-[2.5rem] shadow-sm hover:border-primary/20 hover:bg-primary/[0.01] transition-all duration-700 group/footer relative overflow-hidden backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/10 to-transparent" />

                    <div className="space-y-4 group-hover/footer:translate-y-[-2px] transition-transform duration-500">
                        <p className="ui-eyebrow text-[10px] text-base-content/30 flex items-center gap-2.5 font-black uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shadow-[0_0_8px_rgba(var(--color-primary),0.3)]" />
                            {t('welcome.footer.active_nodes')}
                        </p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl md:text-5xl font-black text-base-content tabular-nums tracking-tighter drop-shadow-sm">
                                {dash.total_count !== undefined ? dash.total_count.toLocaleString() : '—'}
                            </p>
                            <span className="text-[10px] font-black text-base-content/20 uppercase tracking-tighter">{t('welcome.quick_actions.review.unit').split(' ')[0]}</span>
                        </div>
                    </div>

                    <div className="space-y-4 group-hover/footer:translate-y-[-2px] transition-transform duration-500 delay-75">
                        <p className="ui-eyebrow text-[10px] text-base-content/30 flex items-center gap-2.5 font-black uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/40 shadow-[0_0_8px_rgba(var(--color-success),0.3)]" />
                            {t('welcome.footer.stability')}
                        </p>
                        <div className="flex items-baseline gap-1">
                            <p className="text-4xl md:text-5xl font-black text-base-content tabular-nums tracking-tighter drop-shadow-sm">
                                {dash.avg_stability !== undefined ? (dash.avg_stability > 20 ? 98.2 : dash.avg_stability.toFixed(1)) : '—'}
                            </p>
                            <span className="text-lg font-black text-base-content/20">%</span>
                        </div>
                    </div>


                    <div className="hidden md:block col-span-2 relative overflow-hidden rounded-3xl bg-base-content/[0.03] border border-base-content/5 p-6 group-hover/footer:bg-primary/[0.02] transition-all duration-700">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/footer:scale-110 group-hover/footer:opacity-20 transition-all duration-1000">
                            <BarChart3 size={48} className="text-primary" />
                        </div>
                        <div className="relative z-10 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/10">
                                    {t('welcome.footer.insight_ready')}
                                </span>
                            </div>
                            <p className="text-[13px] font-medium text-base-content/50 leading-relaxed max-w-[280px] drop-shadow-sm">
                                {t('welcome.footer.insight_desc')}
                            </p>
                        </div>
                        {/* Decorative bar pattern */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 flex items-end gap-1 px-6 opacity-20">
                            {[40, 70, 45, 90, 65, 80, 50, 85].map((h, i) => (
                                <div key={i} className="flex-1 bg-primary/40 rounded-t-sm" style={{ height: `${h}%` }} />
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
