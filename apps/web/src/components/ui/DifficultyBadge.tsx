import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyBadgeProps {
    level: Difficulty;
    size?: 'xs' | 'sm' | 'md';
    className?: string;
}

/**
 * Unified difficulty badge component used across QuestionBank and QuestionInspector.
 * Displays difficulty level with appropriate color coding.
 */
export const DifficultyBadge = React.memo<DifficultyBadgeProps>(function DifficultyBadge({
    level,
    size = 'xs',
    className
}) {
    const { t } = useTranslation(['common']);

    const configs = {
        easy: {
            color: 'text-success',
            bg: 'bg-success/5',
            border: 'border-success/20',
            label: t('common.difficulty.easy')
        },
        medium: {
            color: 'text-warning',
            bg: 'bg-warning/5',
            border: 'border-warning/20',
            label: t('common.difficulty.medium')
        },
        hard: {
            color: 'text-error',
            bg: 'bg-error/5',
            border: 'border-error/20',
            label: t('common.difficulty.hard')
        }
    };

    const sizeClasses = {
        xs: 'text-[8px] tracking-[0.1em] px-2 py-0.5',
        sm: 'text-[9px] tracking-[0.08em] px-2.5 py-1',
        md: 'text-[10px] tracking-[0.06em] px-3 py-1.5'
    };

    const config = configs[level] || configs.medium;

    return (
        <span className={cn(
            "font-black rounded-md border whitespace-nowrap uppercase transition-all shadow-sm inline-flex items-center justify-center leading-none",
            sizeClasses[size],
            config.color,
            config.bg,
            config.border,
            className
        )}>
            {config.label}
        </span>
    );
});

export default DifficultyBadge;
