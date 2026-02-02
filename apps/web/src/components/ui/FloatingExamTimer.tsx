import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "../../app/utils/cn";
import { Clock, Pause, Play, AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface FloatingExamTimerProps {
    /** Total exam duration in seconds */
    durationSeconds: number;
    /** Callback when time runs out */
    onTimeout?: () => void;
    /** Callback when user manually abandons */
    onAbandon?: () => void;
    /** Mode: 'eval' (no pause) or 'drill' (pausable) */
    mode?: 'eval' | 'drill';
    /** Whether timer is currently active (controlled externally) */
    isActive?: boolean;
    /** Optional: start time (for resuming) */
    startTime?: number;
    /** Optional: elapsed time already spent (for resuming) */
    elapsedSeconds?: number;
}

type TimerState = 'running' | 'paused' | 'urgent' | 'critical' | 'expired';

export const FloatingExamTimer: React.FC<FloatingExamTimerProps> = ({
    durationSeconds,
    onTimeout,
    onAbandon,
    mode = 'drill',
    isActive = true,
    elapsedSeconds = 0,
}) => {
    const { t } = useTranslation();

    // Core state
    const [remainingSeconds, setRemainingSeconds] = useState(() =>
        Math.max(0, durationSeconds - elapsedSeconds)
    );
    const [isPaused, setIsPaused] = useState(false);
    const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
    const [wasHidden, setWasHidden] = useState(false);

    // Refs for accurate timing
    const lastTickRef = useRef(Date.now());
    const pausedAtRef = useRef<number | null>(null);

    // Derive timer state
    const getTimerState = useCallback((): TimerState => {
        if (remainingSeconds <= 0) return 'expired';
        if (isPaused) return 'paused';
        if (remainingSeconds <= 60) return 'critical'; // Last minute
        if (remainingSeconds <= 300) return 'urgent';  // Last 5 minutes
        return 'running';
    }, [remainingSeconds, isPaused]);

    const timerState = getTimerState();

    // Format time display
    const formatTime = useCallback((seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, []);

    // Tick logic with drift correction
    useEffect(() => {
        if (!isActive || isPaused || remainingSeconds <= 0) return;

        const tick = () => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastTickRef.current) / 1000);

            if (elapsed >= 1) {
                lastTickRef.current = now;
                setRemainingSeconds(prev => {
                    const next = Math.max(0, prev - elapsed);
                    if (next === 0) {
                        onTimeout?.();
                    }
                    return next;
                });
            }
        };

        // Align to next second boundary
        const now = Date.now();
        const delay = 1000 - (now % 1000) + 10;
        const timerId = setTimeout(function schedule() {
            tick();
            setTimeout(schedule, 1000);
        }, delay);

        return () => clearTimeout(timerId);
    }, [isActive, isPaused, remainingSeconds, onTimeout]);

    // Visibility change handling (auto-pause for drill mode)
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                // Tab hidden
                if (mode === 'drill' && !isPaused) {
                    pausedAtRef.current = Date.now();
                    setIsPaused(true);
                }
            } else {
                // Tab visible again
                if (pausedAtRef.current) {
                    setWasHidden(true);
                    // In eval mode, time kept running - sync it
                    if (mode === 'eval') {
                        const hiddenDuration = Math.floor((Date.now() - pausedAtRef.current) / 1000);
                        setRemainingSeconds(prev => Math.max(0, prev - hiddenDuration));
                    }
                    pausedAtRef.current = null;
                    // Auto-dismiss warning after 3s
                    setTimeout(() => setWasHidden(false), 3000);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [mode, isPaused]);

    // Pause/Resume handler (only for drill mode)
    const handleTogglePause = useCallback(() => {
        if (mode !== 'drill') return;

        if (isPaused) {
            lastTickRef.current = Date.now();
        }
        setIsPaused(prev => !prev);
    }, [mode, isPaused]);

    // Abandon handler
    const handleAbandon = useCallback(() => {
        if (showAbandonConfirm) {
            onAbandon?.();
            setShowAbandonConfirm(false);
        } else {
            setShowAbandonConfirm(true);
        }
    }, [showAbandonConfirm, onAbandon]);

    // State-based styling
    const stateStyles: Record<TimerState, string> = {
        running: "border-primary/30 bg-base-100/90",
        paused: "border-warning/40 bg-warning/[0.08]",
        urgent: "border-warning/50 bg-warning/[0.1]",
        critical: "border-error/50 bg-error/[0.12] animate-pulse",
        expired: "border-error/60 bg-error/[0.15]",
    };

    const textStyles: Record<TimerState, string> = {
        running: "text-base-content",
        paused: "text-warning",
        urgent: "text-warning",
        critical: "text-error",
        expired: "text-error",
    };

    const iconStyles: Record<TimerState, string> = {
        running: "text-primary",
        paused: "text-warning",
        urgent: "text-warning animate-bounce",
        critical: "text-error animate-ping",
        expired: "text-error",
    };

    return (
        <>
            {/* Main Timer Pill */}
            <div
                className={cn(
                    "fixed top-4 right-4 z-[100]",
                    "flex items-center gap-2 px-4 py-2.5 rounded-full",
                    "border shadow-premium-xl backdrop-blur-xl",
                    "transition-all duration-500 ease-out",
                    "group hover:scale-105",
                    stateStyles[timerState]
                )}
            >
                {/* Clock Icon with State */}
                <div className="relative">
                    <Clock size={18} className={cn("transition-colors duration-300", iconStyles[timerState])} />
                    {timerState === 'paused' && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />
                    )}
                </div>

                {/* Time Display */}
                <span className={cn(
                    "font-mono font-black text-lg tabular-nums tracking-tight",
                    "transition-colors duration-300",
                    textStyles[timerState]
                )}>
                    {formatTime(remainingSeconds)}
                </span>

                {/* Pause Button (drill mode only) */}
                {mode === 'drill' && (
                    <button
                        onClick={handleTogglePause}
                        className={cn(
                            "p-1.5 rounded-full transition-all duration-300",
                            "hover:bg-base-content/10 active:scale-90",
                            isPaused ? "bg-warning/20 text-warning" : "text-base-content/50"
                        )}
                        aria-label={isPaused ? t('exams.timer.resume') : t('exams.timer.pause')}
                    >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                )}

                {/* Abandon Button */}
                <button
                    onClick={handleAbandon}
                    className={cn(
                        "p-1.5 rounded-full transition-all duration-300",
                        "hover:bg-error/20 text-base-content/30 hover:text-error",
                        "opacity-0 group-hover:opacity-100"
                    )}
                    aria-label={t('exams.banner.abandon')}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Tab Hidden Warning */}
            {wasHidden && mode === 'eval' && (
                <div className="fixed top-16 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-warning/20 border border-warning/30 text-warning text-sm font-bold shadow-lg">
                        <AlertTriangle size={16} />
                        <span>{t('exams.timer.tab_warning')}</span>
                    </div>
                </div>
            )}

            {/* Paused Overlay Indicator */}
            {isPaused && (
                <div className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center">
                    <div className="absolute inset-0 bg-base-100/50 backdrop-blur-sm" />
                    <div className="relative bg-base-100/90 border border-warning/30 rounded-3xl p-8 shadow-2xl text-center animate-in zoom-in-95 duration-300">
                        <Pause size={48} className="mx-auto text-warning mb-4" />
                        <h3 className="text-xl font-black text-warning mb-2">{t('exams.timer.paused')}</h3>
                        <p className="text-base-content/60 text-sm mb-6">{t('exams.timer.paused_desc')}</p>
                        <button
                            onClick={handleTogglePause}
                            className="btn btn-warning rounded-xl gap-2 shadow-lg hover:scale-105 transition-transform pointer-events-auto"
                        >
                            <Play size={18} />
                            {t('exams.timer.resume')}
                        </button>
                    </div>
                </div>
            )}

            {/* Abandon Confirmation Modal */}
            {showAbandonConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-base-100/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-base-100 border border-error/20 rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
                            <AlertTriangle size={32} className="text-error" />
                        </div>
                        <h3 className="text-xl font-black text-base-content mb-2">{t('exams.banner.confirm_abandon')}</h3>
                        <p className="text-base-content/60 text-sm mb-6">{t('exams.timer.abandon_warning')}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowAbandonConfirm(false)}
                                className="btn btn-ghost flex-1 rounded-xl"
                            >
                                {t('exams.banner.cancel')}
                            </button>
                            <button
                                onClick={handleAbandon}
                                className="btn btn-error flex-1 rounded-xl shadow-lg"
                            >
                                {t('exams.banner.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default FloatingExamTimer;
