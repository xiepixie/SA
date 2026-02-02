/**
 * useImportItems - Hook for managing import items operations (V2)
 *
 * Uses selectors for derived state and ID-based operations.
 */

import { useCallback, useMemo } from 'react';
import type { ImportItem } from '@v2/shared';
import type { ProcessedImportItem, FilterMode } from '../state/importTypes';
import { getItemId } from '../state/importTypes';
import {
    selectProcessedItems,
    selectStats,
    selectFilteredItems,
    selectValidItems,
} from '../state/importSelectors';

export interface UseImportItemsOptions {
    items: ImportItem[];
    filterMode: FilterMode;
    searchQuery: string;
}

export interface UseImportItemsReturn {
    processedItems: ProcessedImportItem[];
    filteredItems: ProcessedImportItem[];
    stats: {
        total: number;
        errorCount: number;
        warningCount: number;
        valid: number;
    };
    // ID-based helpers
    getItemById: (id: string) => ProcessedImportItem | undefined;
    getItemByRow: (row: number) => ProcessedImportItem | undefined;
    getValidItems: () => ProcessedImportItem[];
    getActualIndex: (item: ProcessedImportItem) => number;
    // Navigation helpers
    getNextId: (currentId: string | null) => string | null;
    getPrevId: (currentId: string | null) => string | null;
}

export function useImportItems({
    items,
    filterMode,
    searchQuery,
}: UseImportItemsOptions): UseImportItemsReturn {
    // Process items with validation (using selector)
    const processedItems = useMemo<ProcessedImportItem[]>(
        () => selectProcessedItems(items),
        [items]
    );

    // Calculate stats (using selector)
    const stats = useMemo(
        () => selectStats(processedItems),
        [processedItems]
    );

    // Filter items based on mode and search query (using selector)
    const filteredItems = useMemo<ProcessedImportItem[]>(
        () => selectFilteredItems(processedItems, filterMode, searchQuery),
        [processedItems, filterMode, searchQuery]
    );

    // Get item by ID (string)
    const getItemById = useCallback(
        (id: string): ProcessedImportItem | undefined => {
            return processedItems.find(item => getItemId(item) === id);
        },
        [processedItems]
    );

    // Get item by row number (legacy support)
    const getItemByRow = useCallback(
        (row: number): ProcessedImportItem | undefined => {
            return processedItems.find(item => item.__row === row);
        },
        [processedItems]
    );

    // Get only valid items (no errors)
    const getValidItems = useCallback(
        (): ProcessedImportItem[] => selectValidItems(processedItems),
        [processedItems]
    );

    // Get actual index in processedItems for a filtered item
    const getActualIndex = useCallback(
        (item: ProcessedImportItem): number => {
            return processedItems.findIndex(p => p.__row === item.__row);
        },
        [processedItems]
    );

    // Get next item ID in filtered list
    const getNextId = useCallback(
        (currentId: string | null): string | null => {
            if (!currentId) return filteredItems.length > 0 ? getItemId(filteredItems[0]) : null;
            const currentIndex = filteredItems.findIndex(item => getItemId(item) === currentId);
            if (currentIndex === -1 || currentIndex >= filteredItems.length - 1) return null;
            return getItemId(filteredItems[currentIndex + 1]);
        },
        [filteredItems]
    );

    // Get previous item ID in filtered list
    const getPrevId = useCallback(
        (currentId: string | null): string | null => {
            if (!currentId) return null;
            const currentIndex = filteredItems.findIndex(item => getItemId(item) === currentId);
            if (currentIndex <= 0) return null;
            return getItemId(filteredItems[currentIndex - 1]);
        },
        [filteredItems]
    );

    return {
        processedItems,
        filteredItems,
        stats,
        getItemById,
        getItemByRow,
        getValidItems,
        getActualIndex,
        getNextId,
        getPrevId,
    };
}
