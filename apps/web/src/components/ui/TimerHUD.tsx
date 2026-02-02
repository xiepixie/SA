import React, { useEffect, useRef, useState } from "react";
import { cn } from "../../app/utils/cn";

export type TimeLeft = { d: number; h: number; m: number; s: number };

interface TimerHUDProps {
    active: boolean;
    label: string;
    targetTime: string;
    targetDate?: string;
    calc: () => TimeLeft;
    tDays: string;
    tHours: string;
    tMin: string;
    tSec: string;
}

const shallowEq = (a: TimeLeft, b: TimeLeft) =>
    a.d === b.d && a.h === b.h && a.m === b.m && a.s === b.s;

export const TimerHUD = React.memo(function TimerHUD(props: TimerHUDProps) {
    const { active, label, targetTime, targetDate, calc, tDays, tHours, tMin, tSec } = props;

    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calc());
    const calcRef = useRef(calc);
    useEffect(() => { calcRef.current = calc; }, [calc]);

    // 只在跨阈值时给读屏“事件式提示”，避免每秒刷屏
    const [srMsg, setSrMsg] = useState("");
    const bucketRef = useRef<"none" | "urgent" | "critical">("none");

    // 对齐整秒的逻辑：不仅对齐，还处理 visibility 切换带来的跳变
    useEffect(() => {
        let timerId: ReturnType<typeof setTimeout>;
        let cancelled = false;

        const tick = () => {
            if (cancelled) return;

            const next = calcRef.current();
            setTimeLeft(prev => (shallowEq(prev, next) ? prev : next));

            // 核心对齐逻辑：确保在下一整秒后的 10ms 触发，给计算留下容错
            const now = Date.now();
            const delay = 1000 - (now % 1000) + 10;
            timerId = setTimeout(tick, delay);
        };

        tick();

        const handleVisibility = () => {
            if (!document.hidden) {
                // 瞬间同步，防止黑屏唤醒后显示旧时间
                const now = calcRef.current();
                setTimeLeft(now);
                tick();
            } else {
                clearTimeout(timerId);
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            cancelled = true;
            clearTimeout(timerId);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, []);


    const showDays = timeLeft.d > 0;

    const totalMinutesLeft = timeLeft.d * 24 * 60 + timeLeft.h * 60 + timeLeft.m;
    const urgent = active && totalMinutesLeft < 60;
    const critical = active && totalMinutesLeft < 10;

    // 事件式 SR 通知：只在跨入 urgent/critical 时触发一次
    useEffect(() => {
        if (!active) {
            bucketRef.current = "none";
            setSrMsg("");
            return;
        }
        const bucket: "none" | "urgent" | "critical" =
            critical ? "critical" : urgent ? "urgent" : "none";

        if (bucket !== bucketRef.current) {
            bucketRef.current = bucket;
            if (bucket === "urgent") setSrMsg("倒计时已进入紧急状态：剩余不足 60 分钟。");
            else if (bucket === "critical") setSrMsg("倒计时已进入极紧急状态：剩余不足 10 分钟。");
            else setSrMsg("");
        }
    }, [active, urgent, critical]);

    return (
        <div
            className={cn(
                "relative flex rounded-3xl border transition-all duration-700 select-none overflow-hidden",
                "glass-card-premium group/hud",
                // Mobile: vertical stack, Desktop: horizontal
                "flex-col md:flex-row items-stretch md:items-center",
                // Sizing
                "p-2 md:p-1",
                active ? "border-primary/40 ring-1 ring-primary/20 shadow-premium-xl" : "border-base-content/5 opacity-90 hover:opacity-100"
            )}
            style={{
                backgroundColor: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(30px) saturate(var(--glass-sat))',
            }}
        >
            <span className="sr-only" aria-live="polite">{srMsg}</span>

            {/* Ambient Depth Layer */}
            <div className={cn(
                "absolute inset-0 pointer-events-none transition-all duration-1000",
                active ? "opacity-30" : "opacity-15"
            )}
                style={{
                    background: `radial-gradient(circle at 50% 120%, oklch(from var(--color-primary) l c h / 0.25), oklch(from var(--color-accent) l c h / 0.1) 50%, transparent 100%)`
                }}
            />

            {/* Status Notch - Top on mobile, Left on desktop */}
            <div className={cn(
                "relative overflow-hidden group/target shrink-0",
                // Mobile: compact horizontal bar at top, centered
                "flex items-center justify-center gap-3 px-4 py-2",
                // Desktop: vertical section on left with max-width to preserve digit space
                "md:flex-col md:justify-center md:items-start md:px-5 md:py-3 md:gap-1.5",
                "md:max-w-[160px] lg:max-w-[180px]"
            )}>
                {/* Content wrapper - no background, purely content */}
                <div className="relative flex items-center gap-2.5 md:flex-col md:items-start md:gap-1">
                    {/* Status indicator + Label */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                        <div className={cn(
                            "w-2 h-2 md:w-2.5 md:h-2.5 rounded-full relative transition-all duration-700 shrink-0",
                            active
                                ? "bg-primary shadow-[0_0_10px_oklch(from_var(--color-primary)_l_c_h_/_0.7)]"
                                : "bg-primary/30"
                        )}>
                            {active && <div className="absolute inset-x-[-120%] inset-y-[-120%] rounded-full animate-ping bg-primary/20" />}
                        </div>
                        <span className={cn(
                            "text-[7px] md:text-[8px] font-black tracking-[0.2em] md:tracking-[0.3em] uppercase transition-colors duration-500",
                            active ? "text-primary" : "text-primary/50"
                        )}>
                            {label}
                        </span>
                    </div>

                    {/* Target time display */}
                    <div className="flex items-baseline gap-1.5">
                        <span className={cn(
                            "text-sm md:text-lg font-black font-mono tracking-tight transition-colors duration-500",
                            active ? "text-base-content" : "text-base-content/70"
                        )}>
                            {targetTime}
                        </span>
                        {showDays && targetDate && (
                            <span className="hidden lg:inline text-[9px] font-bold text-base-content/30 tracking-wide">
                                {targetDate}
                            </span>
                        )}
                    </div>
                </div>
            </div>


            {/* Counter Grid - Bottom on mobile (horizontal row), Right on desktop */}
            <div className={cn(
                "flex items-center justify-center",
                // IMPORTANT: flex-nowrap keeps digits horizontal on all screens
                "flex-nowrap",
                // Responsive gap - tighter on medium screens
                "gap-1.5 sm:gap-2 md:gap-3 lg:gap-6",
                // Responsive padding - minimal on medium to fit all digits
                "px-2 py-2.5 sm:px-3 md:px-4 lg:px-8",
                // Take remaining space and allow shrinking
                "flex-1 min-w-0"
            )}>

                {showDays && <DigitBlock value={timeLeft.d} label={tDays} active={active} compact />}
                <DigitBlock value={timeLeft.h} label={tHours} active={active} compact />
                <DigitBlock value={timeLeft.m} label={tMin} active={active} compact />
                <DigitBlock
                    value={timeLeft.s}
                    label={tSec}
                    active={active}
                    urgent={urgent}
                    critical={critical}
                    isSeconds
                    compact
                />
            </div>

            {/* Edge Accent - Top on mobile, Left on desktop */}
            <div className={cn(
                "absolute transition-all duration-1000",
                // Mobile: top bar
                "top-0 left-0 right-0 h-1 md:h-auto",
                // Desktop: left bar
                "md:top-0 md:bottom-0 md:left-0 md:right-auto md:w-1",
                active ? "bg-primary" : "bg-base-content/10",
                urgent && active && "bg-warning",
                critical && active && "bg-error"
            )} />
        </div>
    );


});

const DigitBlock = React.memo(function DigitBlock(props: {
    value: number;
    label: string;
    active?: boolean;
    urgent?: boolean;
    critical?: boolean;
    isSeconds?: boolean;
    compact?: boolean;
}) {
    const { value, label, active, urgent, critical, isSeconds, compact } = props;

    return (
        <div className={cn(
            "flex flex-col items-center group/digit",
            compact ? "gap-1.5" : "gap-2"
        )}>
            <div
                className={cn(
                    "relative flex items-center justify-center rounded-xl md:rounded-2xl border transition-all duration-700",
                    "shadow-premium-md overflow-hidden",
                    // Responsive sizing - optimized for 4 blocks to always fit
                    compact
                        ? "min-w-[2.4rem] sm:min-w-[3rem] md:min-w-[3.5rem] lg:min-w-[4.5rem] h-9 sm:h-10 md:h-12 lg:h-16"
                        : "min-w-[3.8rem] md:min-w-[5rem] h-14 md:h-18",

                    active
                        ? "border-primary/30 bg-primary/[0.08]"
                        : "border-primary/10 bg-primary/[0.03] hover:border-primary/20 hover:bg-primary/[0.05]",
                    urgent && active && "border-warning/40 bg-warning/[0.1]",
                    critical && active && "border-error/40 bg-error/[0.1]"
                )}
                style={{
                    backdropFilter: 'blur(8px) saturate(1.6)'
                }}
            >
                <span className={cn(
                    "font-mono font-black tabular-nums tracking-tight transition-all duration-500",
                    // Responsive font size - smaller on medium screens
                    compact
                        ? "text-lg sm:text-xl md:text-2xl lg:text-4xl"
                        : "text-3xl md:text-5xl",

                    active ? "text-base-content drop-shadow-sm" : "text-base-content/85",
                    urgent && active && "text-warning",
                    critical && active && "text-error",
                    isSeconds && active && "timer-digit-beat"
                )}>
                    {String(value).padStart(2, "0")}
                </span>

                {/* Improved Crystal Gloss with Color Hint */}
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/[0.05] to-white/[0.15] pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.2] to-transparent pointer-events-none" />

                {/* Dynamic Multi-color Accent Bar */}
                <div className={cn(
                    "absolute bottom-0 left-0 right-0 transition-all duration-700",
                    compact ? "h-[3px]" : "h-[4px]",
                    active
                        ? "bg-gradient-to-r from-primary via-primary/80 to-primary"
                        : "bg-primary/20",
                    urgent && active && "from-warning to-warning/70",
                    critical && active && "from-error to-error/70"
                )} />
            </div>

            <span className={cn(
                "font-bold uppercase transition-colors duration-500",
                compact
                    ? "text-[6px] sm:text-[7px] md:text-[8px] lg:text-[9px] tracking-[0.15em] sm:tracking-[0.2em]"
                    : "text-[9px] md:text-[10px] tracking-[0.3em]",
                active ? "text-primary/70" : "text-primary/40"
            )}>
                {label}
            </span>


        </div>
    );
});

