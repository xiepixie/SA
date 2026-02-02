import React, { useEffect, useRef } from 'react';

interface AnimatedCounterProps {
    value: number;
    duration?: number;
    className?: string;
    prefix?: string;
    suffix?: string;
}

/**
 * AnimatedCounter - Smoothly animates number changes
 * Uses easeOutExpo for natural deceleration
 */
export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
    value,
    duration = 1500,
    className = '',
    prefix = '',
    suffix = ''
}) => {
    const countRef = useRef<HTMLSpanElement>(null);
    const startValue = useRef(0);
    const startTime = useRef<number | null>(null);

    useEffect(() => {
        const element = countRef.current;
        if (!element) return;

        const targetValue = value;
        startValue.current = parseInt(element.textContent || '0', 10) || 0;
        startTime.current = null;

        const easeOutExpo = (t: number): number => {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        };

        const animate = (timestamp: number) => {
            if (!startTime.current) startTime.current = timestamp;
            const elapsed = timestamp - startTime.current;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutExpo(progress);

            const current = Math.round(
                startValue.current + (targetValue - startValue.current) * easedProgress
            );

            if (element) {
                element.textContent = current.toLocaleString();
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <span className={className}>
            {prefix}
            <span ref={countRef}>0</span>
            {suffix}
        </span>
    );
};

export default AnimatedCounter;
