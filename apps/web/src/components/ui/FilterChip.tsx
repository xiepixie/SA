import React from 'react';
import { motion } from 'framer-motion';
import { X, Layers, Hash, Search, Gauge, FileText } from 'lucide-react';
import { cn } from '../../app/utils/cn';
import { getEntityVisuals } from '../../app/utils/colorSystem';

export type FilterChipType = 'subject' | 'tag' | 'search' | 'difficulty' | 'type';

export interface FilterChipProps {
    /** Display label for the chip */
    label: string;
    /** Type of filter - determines icon and styling */
    type: FilterChipType;
    /** Color token for subjects/tags (passed to getEntityVisuals) */
    color?: string;
    /** Color name fallback for getEntityVisuals */
    colorName?: string;
    /** Called when user clicks remove button */
    onRemove: () => void;
    /** Accessibility label */
    ariaLabel?: string;
}

const TYPE_ICONS: Record<FilterChipType, React.ReactNode> = {
    subject: <Layers size={13} strokeWidth={2.5} />,
    tag: <Hash size={13} strokeWidth={2.5} />,
    search: <Search size={13} strokeWidth={2.5} />,
    difficulty: <Gauge size={13} strokeWidth={2.5} />,
    type: <FileText size={13} strokeWidth={2.5} />,
};

/**
 * FilterChip - Removable filter indicator with animation
 *
 * Used in ActiveFiltersBar to display current active filters.
 * Supports subjects, tags, search terms, difficulty, and question types.
 */
export const FilterChip: React.FC<FilterChipProps> = ({
    label,
    type,
    color,
    colorName,
    onRemove,
    ariaLabel,
}) => {
    // Get visual styling based on type
    const getChipStyles = () => {
        if (type === 'subject' || type === 'tag') {
            const vis = getEntityVisuals(color, colorName || label);

            // Premium custom color support (matches EntityBadge)
            const style = vis.style ? {
                '--badge-h': (vis.style as any)['--brand-h'],
                '--badge-s': (vis.style as any)['--brand-s'],
                '--badge-l': (vis.style as any)['--brand-l'],
                '--badge-bg-opacity': '0.06',
                '--badge-border-opacity': '0.15',
                ...vis.style
            } : {};

            return {
                container: cn(
                    vis.bg, vis.border, vis.text,
                    vis.style && "bg-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),var(--badge-bg-opacity))] text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-10%))] dark:text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)+20%))] border-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),var(--badge-border-opacity))]"
                ),
                icon: 'opacity-70',
                style
            };
        }

        // Default styles for search, difficulty, type
        const styleMap: Record<string, { container: string; icon: string; style?: any }> = {
            search: {
                container: 'bg-base-content/[0.06] border-base-content/10 text-base-content/80',
                icon: 'opacity-50',
            },
            difficulty: {
                container: 'bg-amber-500/[0.08] border-amber-500/20 text-amber-600 dark:text-amber-400',
                icon: 'opacity-70',
            },
            type: {
                container: 'bg-violet-500/[0.08] border-violet-500/20 text-violet-600 dark:text-violet-400',
                icon: 'opacity-70',
            },
        };

        return styleMap[type] || styleMap.search;
    };

    const styles = getChipStyles();

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            style={styles.style}
            className={cn(
                "inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border",
                "text-[10px] font-bold uppercase tracking-wider",
                "shadow-sm backdrop-blur-xl transition-colors duration-200",
                styles.container
            )}
            role="listitem"
        >
            <span className={cn("shrink-0", styles.icon)}>
                {TYPE_ICONS[type]}
            </span>
            <span className="truncate max-w-[120px]">{label}</span>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className={cn(
                    "w-6 h-6 flex items-center justify-center rounded-full ml-1",
                    "bg-current/10 hover:bg-current/25",
                    "transition-all duration-200",
                    "hover:scale-110 active:scale-95",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                )}
                aria-label={ariaLabel || `Remove ${label} filter`}
            >
                <X size={12} strokeWidth={3} />
            </button>
        </motion.div>
    );
};

export default FilterChip;
