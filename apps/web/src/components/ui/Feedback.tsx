import React, { useEffect, useRef, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ============================================================================
// TYPES & VARIANTS
// ============================================================================

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
    variant?: AlertVariant;
    title?: string;
    children: React.ReactNode;
    dismissible?: boolean;
    onDismiss?: () => void;
    className?: string;
    icon?: boolean;
}

// ============================================================================
// ALERT COMPONENT (Inline Feedback)
// ============================================================================

const ALERT_ICONS: Record<AlertVariant, React.ElementType> = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
};

const ALERT_VARIANT_CLASS: Record<AlertVariant, string> = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error',
};

/**
 * Alert Component
 * For inline, persistent feedback messages (form validation, inline warnings, etc.)
 * Uses left indicator bar as primary status cue + optional icon.
 */
export const Alert: React.FC<AlertProps> = ({
    variant = 'info',
    title,
    children,
    dismissible = false,
    onDismiss,
    className = '',
    icon = false,
}) => {
    const { t } = useTranslation();
    const Icon = ALERT_ICONS[variant];

    return (
        <div
            role={variant === 'error' ? 'alert' : 'status'}
            aria-live={variant === 'error' ? 'assertive' : 'polite'}
            className={`alert ${ALERT_VARIANT_CLASS[variant]} ${className}`}
        >
            {icon && (
                <div className="flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                {title && <h4 className="alert-title">{title}</h4>}
                <div className="alert-content">{children}</div>
            </div>
            {dismissible && onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="alert-dismiss"
                    aria-label={t('common.actions.dismiss', { defaultValue: 'Dismiss' })}
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            )}
        </div>
    );
};

// ============================================================================
// SKELETON COMPONENT (Loading Placeholder)
// ============================================================================

export interface SkeletonProps {
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    className?: string;
    lines?: number;
}

const DEFAULT_CIRCULAR_SIZE = 40;

/**
 * Skeleton Component
 * Shimmer loading placeholder for content.
 * Hidden from screen readers (decorative element).
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    variant = 'text',
    width,
    height,
    className = '',
    lines = 1,
}) => {
    const baseClass = 'skeleton';
    const variantClass = {
        text: 'h-4 rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    }[variant];

    const resolvedHeight = height ?? (variant === 'circular' ? DEFAULT_CIRCULAR_SIZE : undefined);
    const resolvedWidth = width ?? (variant === 'circular' ? resolvedHeight : '100%');

    const style: React.CSSProperties = {
        width: resolvedWidth,
        height: resolvedHeight,
    };

    if (variant === 'text' && lines > 1) {
        return (
            <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
                {Array.from({ length: lines }).map((_, i) => (
                    <div
                        key={i}
                        className={`${baseClass} ${variantClass}`}
                        style={{ ...style, width: i === lines - 1 ? '75%' : '100%' }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className={`${baseClass} ${variantClass} ${className}`}
            style={style}
            aria-hidden="true"
        />
    );
};

// ============================================================================
// LOADING COMPONENT (Spinner/Dots)
// ============================================================================

export type LoadingVariant = 'spinner' | 'dots' | 'ring' | 'bars';
export type LoadingSize = 'xs' | 'sm' | 'md' | 'lg';

export interface LoadingProps {
    variant?: LoadingVariant;
    size?: LoadingSize;
    className?: string;
    label?: string;
    /** If true, hides from screen readers (use when inside buttons) */
    decorative?: boolean;
}

/**
 * Loading Component
 * Animated loading indicators.
 * Set decorative=true when used inside buttons to avoid duplicate announcements.
 */
export const Loading: React.FC<LoadingProps> = ({
    variant = 'spinner',
    size = 'md',
    className = '',
    label,
    decorative = false,
}) => {
    const { t } = useTranslation();
    const sizeClass = `loading-${size}`;
    const variantClass = `loading-${variant}`;

    if (decorative) {
        return (
            <span
                className={`loading ${variantClass} ${sizeClass} ${className}`}
                aria-hidden="true"
            />
        );
    }

    return (
        <span
            className={`loading ${variantClass} ${sizeClass} ${className}`}
            role="status"
            aria-live="polite"
            aria-label={label ?? t('common.status.loading', { defaultValue: 'Loading' })}
        >
            <span className="sr-only">{label ?? t('common.status.loading', { defaultValue: 'Loading' })}</span>
        </span>
    );
};

// ============================================================================
// PROGRESS COMPONENT (Linear Progress)
// ============================================================================

export type ProgressVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export interface ProgressProps {
    value?: number;
    max?: number;
    variant?: ProgressVariant;
    showLabel?: boolean;
    indeterminate?: boolean;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    /** Accessible label for screen readers */
    accessibleLabel?: string;
}

/**
 * Progress Component
 * Linear progress bar with shimmer effect.
 */
export const Progress: React.FC<ProgressProps> = ({
    value = 0,
    max = 100,
    variant = 'primary',
    showLabel = false,
    indeterminate = false,
    className = '',
    size = 'md',
    accessibleLabel,
}) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const sizeClass = {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
    }[size];

    return (
        <div className={`progress-container ${className}`}>
            <div
                className={`progress progress-${variant} ${sizeClass}`}
                role="progressbar"
                aria-valuenow={indeterminate ? undefined : value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={accessibleLabel}
            >
                <div
                    className={`progress-bar ${indeterminate ? 'animate-infinite-loading' : ''}`}
                    style={{ width: indeterminate ? undefined : `${percentage}%` }}
                />
            </div>
            {showLabel && !indeterminate && (
                <span className="progress-label" aria-hidden="true">
                    {Math.round(percentage)}%
                </span>
            )}
        </div>
    );
};

// ============================================================================
// CONFIRM DIALOG (Modal)
// ============================================================================

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'info' | 'warning' | 'error';
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

/**
 * ConfirmDialog Component
 * Modal dialog for destructive or important actions.
 * Uses native <dialog> element for accessibility.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    confirmText,
    cancelText,
    variant = 'info',
    onConfirm,
    onCancel,
    loading = false,
}) => {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    const resolvedConfirmText = confirmText ?? t('common.actions.confirm', { defaultValue: 'Confirm' });
    const resolvedCancelText = cancelText ?? t('common.actions.cancel', { defaultValue: 'Cancel' });

    // Handle open/close
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
            // Focus cancel button for safety on dangerous actions
            setTimeout(() => cancelButtonRef.current?.focus(), 50);
        }
        if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    // Handle ESC key (cancel event)
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const onCancelEvent = (e: Event) => {
            e.preventDefault();
            if (!loading) onCancel();
        };

        dialog.addEventListener('cancel', onCancelEvent);
        return () => dialog.removeEventListener('cancel', onCancelEvent);
    }, [onCancel, loading]);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (loading) return;
        if (e.target === dialogRef.current) {
            onCancel();
        }
    }, [onCancel, loading]);

    const variantClasses = {
        info: 'btn-primary',
        warning: 'btn-warning',
        error: 'btn-error',
    }[variant];

    return (
        <dialog
            ref={dialogRef}
            className="modal modal-glass"
            onClick={handleBackdropClick}
        >
            <div className="modal-box glass-card animate-reveal-spring">
                <h3 className="font-bold text-lg">{title}</h3>
                {description && (
                    <p className="py-4 text-base-content/70">{description}</p>
                )}
                <div className="modal-action">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="btn btn-ghost"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        {resolvedCancelText}
                    </button>
                    <button
                        type="button"
                        className={`btn ${variantClasses}`}
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading && <Loading variant="spinner" size="sm" decorative />}
                        {resolvedConfirmText}
                    </button>
                </div>
            </div>
            {/* Hidden backdrop button for form method="dialog" fallback */}
            <form method="dialog" className="modal-backdrop">
                <button type="button" onClick={onCancel} disabled={loading}>
                    {t('common.actions.close', { defaultValue: 'close' })}
                </button>
            </form>
        </dialog>
    );
};

// ============================================================================
// TOOLTIP (Hover Feedback)
// ============================================================================

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
    content: string;
    position?: TooltipPosition;
    children: React.ReactElement;
    className?: string;
    disabled?: boolean;
    /** Mirror content to aria-label for accessibility (useful for icon-only buttons) */
    ariaLabel?: boolean;
}

/**
 * Tooltip Component (HOC)
 * Injects daisyUI tooltip classes and data-tip directly into the child element.
 * Does NOT wrap in a div, preserving accessibility and focus behavior.
 */
export const Tooltip: React.FC<TooltipProps> = ({
    content,
    position = 'top',
    children,
    className = '',
    disabled = false,
    ariaLabel = false,
}) => {
    const [isDismissed, setIsDismissed] = React.useState(false);

    const onAnyInteract = () => {
        if (isDismissed) setIsDismissed(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsDismissed(true);
            // Do not blur; keep focus on the trigger (APG recommendation)
        }
    };

    const child = React.Children.only(children) as React.ReactElement<any>;

    const mergedClassName = [
        child.props.className ?? '',
        !disabled && !isDismissed ? `tooltip tooltip-${position}` : 'tooltip-hidden',
        className,
    ].filter(Boolean).join(' ');

    return React.cloneElement(child, {
        className: mergedClassName,
        'data-tip': !disabled && !isDismissed ? content : undefined,
        // Sync handlers to clear dismissed state
        onMouseEnter: (e: React.MouseEvent) => {
            onAnyInteract();
            child.props.onMouseEnter?.(e);
        },
        onFocus: (e: React.FocusEvent) => {
            onAnyInteract();
            child.props.onFocus?.(e);
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            handleKeyDown(e);
            child.props.onKeyDown?.(e);
        },
        // Optional A11y: inject aria-label if requested
        ...(ariaLabel ? { 'aria-label': child.props['aria-label'] ?? content } : null),
    });
};


