import React from 'react';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'surface' | 'card' | 'inline' | 'panel' | 'premium';
    isInteractive?: boolean;
    blur?: string;
    children: React.ReactNode;
}

/**
 * Reusable Glass Card Primitive
 * Orchestrates the "Liquid Glass" aesthetic across the application.
 */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(({
    variant = 'card',
    isInteractive = false,
    className = '',
    children,
    style,
    onClick,
    onKeyDown,
    ...props
}, ref) => {
    const baseClass = {
        surface: 'glass-surface',
        card: 'glass-card',
        inline: 'glass-inline',
        panel: 'glass-panel',
        premium: 'glass-card-premium'
    }[variant];

    const interactiveClass = isInteractive ? 'se-interactive' : '';

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (onKeyDown) onKeyDown(e);

        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            const target = e.currentTarget as HTMLElement;
            target.click();
        }
    };

    return (
        <div
            ref={ref}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            className={`${baseClass} ${interactiveClass} ${className}`}
            style={style}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            {...props}
        >
            {children}
        </div>
    );
});

GlassCard.displayName = 'GlassCard';
