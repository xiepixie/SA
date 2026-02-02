import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../app/utils/cn';
import { useTranslation } from 'react-i18next';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
    id: string;
    message: string;
    level?: ToastLevel;
    sticky?: boolean;
    duration?: number;
    onDismiss: (id: string) => void;
}

const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
};

/**
 * Refined Toast Component - Lightweight & High Performance
 * Optimized for glanceability and minimal visual noise.
 */
export const Toast: React.FC<ToastProps> = ({
    id,
    message,
    level = 'info',
    sticky = false,
    duration = 5000,
    onDismiss,
}) => {
    const { t } = useTranslation();
    const [isExiting, setIsExiting] = useState(false);
    const Icon = ICONS[level];

    useEffect(() => {
        if (sticky) return;
        const timer = setTimeout(() => handleDismiss(), duration);
        return () => clearTimeout(timer);
    }, [id, sticky, duration]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => onDismiss(id), 400); // Matches exit transition duration
    };

    return (
        <div
            className={cn(
                'toast-v2',
                level,
                isExiting && 'exiting'
            )}
            role="alert"
        >
            {/* Minimalist Status Icon Inline */}
            <Icon className="status-icon" strokeWidth={2.5} />

            <div className="toast-body">
                <span className="toast-meta">
                    {t(`common.toast.${level}`, { defaultValue: level.toUpperCase() })}
                </span>
                <p className="toast-msg">
                    {message}
                </p>
            </div>

            <button
                onClick={handleDismiss}
                className="close-btn"
                aria-label={t('common.actions.close')}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};
