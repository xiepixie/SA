/**
 * Import Feature - Selectors (Derived State)
 *
 * Memoizable pure functions for computing derived state.
 * These are designed to be used with useMemo in components/hooks.
 */

import type { ImportItem } from '@v2/shared';
import type {
    ImportState,
    ProcessedImportItem,
    ImportStats,
    FilterMode,
} from './importTypes';
import { getItemId } from './importTypes';
import { validateItem, type ValidationIssue } from '../../../lib/importUtils';

// ========================================
// Item Processing
// ========================================

/**
 * Process raw items with validation results
 */
export function selectProcessedItems(items: ImportItem[]): ProcessedImportItem[] {
    return items.map(item => ({
        ...item,
        subject_name: item.subject_name || undefined,
        _validation: validateItem(item),
    }));
}

// ========================================
// Statistics
// ========================================

/**
 * Compute import statistics from processed items
 */
export function selectStats(processedItems: ProcessedImportItem[]): ImportStats {
    const total = processedItems.length;
    const errorCount = processedItems.filter(
        item => item._validation.some(v => v.level === 'error')
    ).length;
    const warningCount = processedItems.filter(
        item => item._validation.some(v => v.level === 'warning')
    ).length;

    return {
        total,
        errorCount,
        warningCount,
        valid: total - errorCount,
    };
}

// ========================================
// Filtering
// ========================================

/**
 * Filter items by validation status
 */
export function selectFilteredByMode(
    items: ProcessedImportItem[],
    filterMode: FilterMode
): ProcessedImportItem[] {
    switch (filterMode) {
        case 'error':
            return items.filter(item =>
                item._validation.some(v => v.level === 'error')
            );
        case 'warning':
            return items.filter(item =>
                item._validation.some(v => v.level === 'warning')
            );
        case 'all':
        default:
            return items;
    }
}

/**
 * Filter items by search query
 */
export function selectFilteredBySearch(
    items: ProcessedImportItem[],
    searchQuery: string
): ProcessedImportItem[] {
    if (!searchQuery.trim()) {
        return items;
    }

    const lower = searchQuery.toLowerCase();
    return items.filter(item => {
        const titleMatch = item.question.title?.toLowerCase().includes(lower);
        const contentStr = String(item.question.content || '').toLowerCase();
        return titleMatch || contentStr.includes(lower);
    });
}

/**
 * Combined filter: mode + search
 */
export function selectFilteredItems(
    processedItems: ProcessedImportItem[],
    filterMode: FilterMode,
    searchQuery: string
): ProcessedImportItem[] {
    let items = selectFilteredByMode(processedItems, filterMode);
    items = selectFilteredBySearch(items, searchQuery);
    return items;
}

// ========================================
// Active Item Selection
// ========================================

/**
 * Get the currently active item by ID
 */
export function selectActiveItem(
    processedItems: ProcessedImportItem[],
    selectedId: string | null
): ProcessedImportItem | undefined {
    if (!selectedId) return undefined;
    return processedItems.find(item => getItemId(item) === selectedId);
}

/**
 * Get all validation issues (errors and warnings) for the active item
 */
export function selectActiveItemValidation(
    activeItem: ProcessedImportItem | undefined
): ValidationIssue[] {
    return activeItem?._validation || [];
}

/**
 * Get validation warnings for the active item
 */
export function selectActiveItemWarnings(
    activeItem: ProcessedImportItem | undefined
): ValidationIssue[] {
    return activeItem?._validation.filter(v => v.level === 'warning') || [];
}

// ========================================
// Navigation Helpers
// ========================================

/**
 * Get the index of the selected item in the filtered list
 */
export function selectSelectedIndex(
    filteredItems: ProcessedImportItem[],
    selectedId: string | null
): number {
    if (!selectedId) return -1;
    return filteredItems.findIndex(item => getItemId(item) === selectedId);
}

/**
 * Get the next item ID in the filtered list
 */
export function selectNextItemId(
    filteredItems: ProcessedImportItem[],
    selectedId: string | null
): string | null {
    const currentIndex = selectSelectedIndex(filteredItems, selectedId);
    if (currentIndex === -1 || currentIndex >= filteredItems.length - 1) {
        return null;
    }
    return getItemId(filteredItems[currentIndex + 1]);
}

/**
 * Get the previous item ID in the filtered list
 */
export function selectPrevItemId(
    filteredItems: ProcessedImportItem[],
    selectedId: string | null
): string | null {
    const currentIndex = selectSelectedIndex(filteredItems, selectedId);
    if (currentIndex <= 0) {
        return null;
    }
    return getItemId(filteredItems[currentIndex - 1]);
}

// ========================================
// Validation Summary
// ========================================

/**
 * Check if all items are valid (no errors)
 */
export function selectAllValid(processedItems: ProcessedImportItem[]): boolean {
    return processedItems.every(
        item => !item._validation.some(v => v.level === 'error')
    );
}

/**
 * Get all valid items (for import submission)
 */
export function selectValidItems(processedItems: ProcessedImportItem[]): ProcessedImportItem[] {
    return processedItems.filter(
        item => !item._validation.some(v => v.level === 'error')
    );
}

/**
 * Check if import can proceed (all items must be valid/no errors)
 */
export function selectCanImport(processedItems: ProcessedImportItem[]): boolean {
    if (processedItems.length === 0) return false;
    const stats = selectStats(processedItems);
    return stats.errorCount === 0;
}

// ========================================
// Composite Selectors (for convenience)
// ========================================

/**
 * Select all derived data from state at once
 * Useful for components that need multiple derived values
 */
export function selectDerivedState(state: ImportState) {
    const processedItems = selectProcessedItems(state.items);
    const stats = selectStats(processedItems);
    const filteredItems = selectFilteredItems(
        processedItems,
        state.filterMode,
        state.searchQuery
    );
    const activeItem = selectActiveItem(processedItems, state.selectedId);
    const validationErrors = selectActiveItemValidation(activeItem);
    const validationWarnings = selectActiveItemWarnings(activeItem);
    const canImport = selectCanImport(processedItems);
    const validItems = selectValidItems(processedItems);

    return {
        processedItems,
        stats,
        filteredItems,
        activeItem,
        validationErrors,
        validationWarnings,
        canImport,
        validItems,
    };
}
