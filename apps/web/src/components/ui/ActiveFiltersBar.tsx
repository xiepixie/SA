import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FilterChip, type FilterChipType } from './FilterChip';
import { cn } from '../../app/utils/cn';

export interface QuestionBankFilters {
    q: string;
    subjectIds: string[];
    type: string;
    difficulty: string;
    status: string;
    sort: string;
    tags: string[];
}

export interface ActiveFiltersBarProps {
    /** Current filter state */
    filters: QuestionBankFilters;
    /** Available subjects for lookup */
    subjects: Array<{ id: string; name: string; color?: string }>;
    /** Available tags for lookup */
    tags: Array<{ name: string; color?: string }>;
    /** Called when a specific filter should be removed */
    onRemoveFilter: (type: FilterChipType, value?: string) => void;
    /** Called when all filters should be cleared */
    onClearAll: () => void;
}

/**
 * ActiveFiltersBar - Displays current active filters with remove capability
 *
 * Shows a horizontal bar of filter chips below the header.
 * Supports scrolling on mobile and wrapping on desktop.
 */
export const ActiveFiltersBar: React.FC<ActiveFiltersBarProps> = ({
    filters,
    subjects,
    tags,
    onRemoveFilter,
    onClearAll,
}) => {
    const { t } = useTranslation();

    // Build list of active filter chips
    const activeFilters: Array<{
        key: string;
        type: FilterChipType;
        label: string;
        value?: string;
        color?: string;
        colorName?: string;
    }> = [];

    // Search query
    if (filters.q) {
        activeFilters.push({
            key: 'search',
            type: 'search',
            label: `"${filters.q}"`,
        });
    }

    // Subject filters
    if (filters.subjectIds.length > 0) {
        filters.subjectIds.forEach(id => {
            const subject = subjects.find(s => s.id === id);
            if (subject) {
                activeFilters.push({
                    key: `subject-${id}`,
                    type: 'subject',
                    label: subject.name,
                    value: id,
                    color: subject.color,
                    colorName: subject.name,
                });
            }
        });
    }

    // Difficulty filter
    if (filters.difficulty && filters.difficulty !== 'all') {
        activeFilters.push({
            key: `difficulty-${filters.difficulty}`,
            type: 'difficulty',
            label: t(`common.difficulty.${filters.difficulty}`, filters.difficulty),
            value: filters.difficulty,
        });
    }

    // Type filter
    if (filters.type && filters.type !== 'all') {
        activeFilters.push({
            key: `type-${filters.type}`,
            type: 'type',
            label: t(`common.type.${filters.type}`, filters.type),
            value: filters.type,
        });
    }

    // Tag filters
    filters.tags.forEach(tagName => {
        const tag = tags.find(t => t.name === tagName);
        activeFilters.push({
            key: `tag-${tagName}`,
            type: 'tag',
            label: tagName,
            value: tagName,
            color: tag?.color,
            colorName: tagName,
        });
    });

    // Don't render if no active filters
    if (activeFilters.length === 0) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="border-b border-base-content/[0.05] bg-base-content/[0.01]"
            role="region"
            aria-label={t('library.filters.active', 'Active filters')}
            aria-live="polite"
        >
            <div className="px-6 lg:px-10 py-3">
                <div className="flex items-center gap-3">
                    {/* Filter chips container */}
                    <motion.div
                        layout
                        className={cn(
                            "flex-1 min-w-0",
                            "flex items-center gap-2",
                            "overflow-x-auto lg:overflow-visible lg:flex-wrap",
                            "scrollbar-none"
                        )}
                        role="list"
                    >
                        <AnimatePresence>
                            {activeFilters.map(filter => (
                                <FilterChip
                                    key={filter.key}
                                    type={filter.type}
                                    label={filter.label}
                                    color={filter.color}
                                    colorName={filter.colorName}
                                    onRemove={() => onRemoveFilter(filter.type, filter.value)}
                                    ariaLabel={t('common.actions.remove', 'Remove') + ` ${filter.label}`}
                                />
                            ))}
                        </AnimatePresence>
                    </motion.div>

                    {/* Clear all button */}
                    <button
                        type="button"
                        onClick={onClearAll}
                        className={cn(
                            "shrink-0 flex items-center gap-1.5 px-4 h-11 rounded-xl",
                            "text-[10px] font-black uppercase tracking-wider",
                            "text-base-content/50 hover:text-error",
                            "bg-base-content/[0.03] hover:bg-error/10",
                            "border border-transparent hover:border-error/20",
                            "transition-all duration-200",
                            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        )}
                        aria-label={t('library.filters.clear_all', 'Clear all filters')}
                    >
                        <X size={14} strokeWidth={2.5} />
                        <span className="hidden sm:inline">{t('library.filters.clear_all', 'Clear all')}</span>
                    </button>
                </div>
            </div>
        </motion.div >
    );
};

export default ActiveFiltersBar;
