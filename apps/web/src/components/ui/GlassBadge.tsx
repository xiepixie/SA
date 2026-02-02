import React from 'react';
import { cn } from '../../app/utils/cn';

export type GlassBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'primary';

export interface GlassBadgeProps {
    children: React.ReactNode;
    variant?: GlassBadgeVariant;
    className?: string;
}

const variants: Record<GlassBadgeVariant, string> = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/5 text-success border-success/10',
    warning: 'bg-warning/5 text-warning border-warning/10',
    error: 'bg-error/5 text-error border-error/10',
    info: 'bg-info/5 text-info border-info/10',
};

/**
 * GlassBadge - Premium glass-morphism status badge
 * 
 * @example
 * <GlassBadge variant="success">ACTIVE</GlassBadge>
 * <GlassBadge variant="error">BLOCKED</GlassBadge>
 */
export const GlassBadge: React.FC<GlassBadgeProps> = ({
    children,
    variant = 'info',
    className = ''
}) => {
    return (
        <span className={cn(
            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] border backdrop-blur-md shadow-sm",
            variants[variant],
            className
        )}>
            {children}
        </span>
    );
};

export default GlassBadge;
