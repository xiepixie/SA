import React, { useMemo } from 'react';
import { cn } from '../../app/utils/cn';
import { getEntityVisuals } from '../../app/utils/colorSystem';

export interface EntityBadgeProps {
    /** Entity name (subject name or tag name) */
    name: string;
    /** Entity color (hex or token) */
    color?: string | null;
    /** Custom className for the container */
    className?: string;
    /** Click handler (e.g., for filtering) */
    onClick?: (e: React.MouseEvent) => void;
    /** Size preset */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    /** Whether the badge should show hover/active effects */
    interactive?: boolean;
    /** Whether to show the tag hash prefix (for tags) */
    showHash?: boolean;
    /** Optional children (e.g., for removal buttons) */
    icon?: React.ElementType; // Optional icon override
    children?: React.ReactNode;
}

/**
 * EntityBadge - Premium unified badge for subjects and tags
 * 
 * Supports both pre-defined color tokens and custom hex colors from the DB
 * with high-performance styling and glass-morphism effects.
 */
export const EntityBadge = React.memo<EntityBadgeProps>(({
    name,
    color,
    className,
    onClick,
    size = 'sm',
    interactive = false,
    showHash = false,
    icon: Icon,
    children
}) => {
    const visuals = useMemo(() => getEntityVisuals(color, name), [color, name]);

    // Size classes (Premium micro-scaling)
    const sizeClasses = {
        xs: 'px-1.5 py-0.5 text-[9px]',
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-1 text-[11px]',
        lg: 'px-4 py-1.5 text-xs'
    };

    // Premium HSL styling for custom colors
    const customStyles = useMemo(() => {
        if (!visuals.style) return {};
        const styleData = visuals.style as any;
        return {
            '--badge-h': styleData['--brand-h'],
            '--badge-s': styleData['--brand-s'],
            '--badge-l': styleData['--brand-l'],
            '--badge-bg-opacity': '0.06',
            '--badge-border-opacity': '0.15',
            ...visuals.style
        } as React.CSSProperties;
    }, [visuals.style]);

    return (
        <span
            onClick={onClick}
            style={customStyles}
            className={cn(
                "inline-flex items-center gap-1.5 font-bold uppercase tracking-wide rounded-lg border transition-all duration-300 backdrop-blur-xl whitespace-nowrap overflow-hidden select-none",
                sizeClasses[size],
                // Case A: Tailwind classes from pre-defined tokens
                visuals.bg, visuals.text, visuals.border,
                // Shared HSL styling for custom DB colors
                visuals.style && "bg-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),var(--badge-bg-opacity))] text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-10%))] dark:text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)+20%))] border-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),var(--badge-border-opacity))]",
                // Premium Interactions
                interactive && [
                    "cursor-pointer",
                    "hover:scale-[1.03] active:scale-[0.97]",
                    "hover:shadow-md hover:shadow-base-content/5",
                    "hover:bg-base-content/[0.08] dark:hover:bg-base-content/[0.12]",
                    "hover:border-base-content/25",
                    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                ],
                className
            )}
        >
            {/* Semantic Indicator Dot or Icon - Only if hash is hidden */}
            {!showHash && (
                Icon ? (
                    <Icon className={cn(
                        "w-3 h-3 shrink-0 stroke-[2.5px] opacity-70",
                        visuals.text,
                        visuals.style && "text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-10%))] dark:text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)+20%))]"
                    )} />
                ) : (
                    <span className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500 opacity-60",
                        visuals.dot,
                        visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]",
                        interactive && "group-hover:scale-125 group-hover:opacity-100"
                    )} />
                )
            )}

            <span className="flex items-center gap-0.5">
                {showHash && <span className="opacity-40 font-black">#</span>}
                <span className="truncate max-w-[120px]">{name}</span>
                {children}
            </span>
        </span>
    );
});

export default EntityBadge;
