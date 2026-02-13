/**
 * useImportWizard - Main state management hook for the import wizard (V2)
 *
 * Key changes:
 * - Uses ID-based selection instead of index
 * - Removed async state management (handled by mutation)
 * - Uses selectors for derived state
 * - Removed importStart action (mutation handles loading state)
 */

import { useReducer, useMemo, useCallback, useRef } from 'react';
import type { ImportItem } from '@v2/shared';
import {
    type ImportState,
    type ProcessedImportItem,
    type ImportStats,
    initialImportState,
    getItemId,
} from '../state/importTypes';
import { importReducer } from '../state/importReducer';
import { importActions } from '../state/importActions';
import {
    selectProcessedItems,
    selectStats,
    selectFilteredItems,
    selectActiveItem,
    selectActiveItemValidation,
    selectCanImport,
    selectValidItems,
} from '../state/importSelectors';
import {
    parseImportData,
    checkDuplicates,
    type ValidationIssue,
    supabase
} from '../../../lib/importUtils';

export interface UseImportWizardReturn {
    // State
    state: ImportState;

    // Derived state
    processedItems: ProcessedImportItem[];
    filteredItems: ProcessedImportItem[];
    stats: ImportStats;
    activeItem: ProcessedImportItem | undefined;
    validationErrors: ValidationIssue[];
    canImport: boolean;
    validItems: ProcessedImportItem[];

    // Actions
    dispatch: React.Dispatch<ReturnType<typeof importActions[keyof typeof importActions]>>;
    actions: typeof importActions;

    // Handlers
    handleImportData: (input: { text?: string; file?: File }) => Promise<void>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | (File | null)[] | null } }) => void;
    handlePasteImport: () => void;
    handleReset: () => void;
    handleAutoCleanup: () => void;

    // ID-based item operations
    updateItem: (id: string, updates: Partial<ImportItem['question']> | { tag_names: string[] }) => void;
    deleteItem: (id: string) => void;
    updateItemField: (id: string, field: string, value: unknown) => void;
    jumpToProblem: (direction: 'next' | 'prev') => void;
    retryFailed: (failedRows: number[]) => void;

    // Refs
    fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useImportWizard(): UseImportWizardReturn {
    const [state, dispatch] = useReducer(importReducer, initialImportState);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ========================================
    // Derived State (using selectors)
    // ========================================

    const processedItems = useMemo<ProcessedImportItem[]>(
        () => selectProcessedItems(state.items, state.duplicates),
        [state.items, state.duplicates]
    );

    const stats = useMemo<ImportStats>(
        () => selectStats(processedItems),
        [processedItems]
    );

    const filteredItems = useMemo<ProcessedImportItem[]>(
        () => selectFilteredItems(processedItems, state.filterMode, state.searchQuery),
        [processedItems, state.filterMode, state.searchQuery]
    );

    const activeItem = useMemo(
        () => selectActiveItem(processedItems, state.selectedId),
        [processedItems, state.selectedId]
    );

    const validationErrors = useMemo(
        () => selectActiveItemValidation(activeItem),
        [activeItem]
    );

    const canImport = useMemo(
        () => selectCanImport(processedItems),
        [processedItems]
    );

    const validItems = useMemo(
        () => selectValidItems(processedItems),
        [processedItems]
    );

    // ========================================
    // Handlers
    // ========================================

    const handleImportData = useCallback(async (input: { text?: string; file?: File }) => {
        // Note: No dispatch(importStart) - loading state is handled by mutation
        try {
            const result = await parseImportData(input);

            if (result.items.length > 0) {
                // SET_PARSE_RESULT auto-transition to preview
                dispatch(importActions.setParseResult(result, result.items));

                // [V3.3] Check Duplicates (Async)
                supabase.auth.getUser().then(async (response) => {
                    const user = response.data.user;
                    if (!user) return;
                    const duplicates = await checkDuplicates(supabase, result.items, user.id);
                    if (duplicates.length > 0) {
                        const dupMap: Record<string, string> = {};
                        duplicates.forEach(d => {
                            if (d.matchType === 'db') {
                                dupMap[String(d.rowIndex)] = `Database (${d.duplicateId?.slice(0, 8)}...)`;
                            } else {
                                dupMap[String(d.rowIndex)] = `Batch (Row ${d.originalIndex! + 1})`;
                            }
                        });
                        dispatch(importActions.setDuplicates(dupMap));
                    }
                });
            } else if (result.issues.length > 0 && result.issues[0].level === 'error') {
                dispatch(importActions.parseError(result.issues[0].message));
            }
        } catch (err) {
            dispatch(importActions.parseError(
                err instanceof Error ? err.message : 'Import failed'
            ));
        }
    }, []);

    const handleFileUpload = useCallback((
        e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | (File | null)[] | null } }
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        handleImportData({ file });
    }, [handleImportData]);

    const handlePasteImport = useCallback(() => {
        if (!state.pasteValue.trim()) return;
        handleImportData({ text: state.pasteValue });
    }, [state.pasteValue, handleImportData]);

    const handleReset = useCallback(() => {
        dispatch(importActions.reset());
    }, []);

    const handleAutoCleanup = useCallback(() => {
        dispatch(importActions.autoCleanup());
    }, []);

    // ========================================
    // ID-based Item Operations
    // ========================================

    const updateItem = useCallback((
        id: string,
        updates: Partial<ImportItem['question']> | { tag_names: string[] }
    ) => {
        dispatch(importActions.updateItem(id, updates));
    }, []);

    const deleteItem = useCallback((id: string) => {
        dispatch(importActions.deleteItem(id));
    }, []);

    const updateItemField = useCallback((id: string, field: string, value: unknown) => {
        dispatch(importActions.updateItemField(id, field, value));
    }, []);

    const jumpToProblem = useCallback((direction: 'next' | 'prev') => {
        const currentIndex = processedItems.findIndex(item => getItemId(item) === state.selectedId);
        if (currentIndex === -1) return;

        const findNext = (start: number) => {
            const range = direction === 'next'
                ? processedItems.slice(start + 1).concat(processedItems.slice(0, start))
                : processedItems.slice(0, start).reverse().concat(processedItems.slice(start + 1).reverse());

            return range.find(item => item._validation.length > 0);
        };

        const target = findNext(currentIndex);
        if (target) {
            dispatch(importActions.selectItem(getItemId(target)));
        }
    }, [processedItems, state.selectedId]);

    const retryFailed = useCallback((failedRows: number[]) => {
        dispatch(importActions.retryFailed(failedRows));
    }, []);

    // ========================================
    // Stability Wrappers (Garuda)
    // ========================================

    // Memoize actions to prevent downstream re-renders
    const stableActions = useMemo(() => importActions, []);

    // Memoize handlers to prevent downstream re-renders
    const handlers = useMemo(() => ({
        handleImportData,
        handleFileUpload,
        handlePasteImport,
        handleReset,
        handleAutoCleanup,
        updateItem,
        deleteItem,
        updateItemField,
        jumpToProblem,
        retryFailed,
    }), [
        handleImportData,
        handleFileUpload,
        handlePasteImport,
        handleReset,
        handleAutoCleanup,
        updateItem,
        deleteItem,
        updateItemField,
        jumpToProblem,
        retryFailed,
    ]);

    // Final wizard object - only changes when state or derived state changes
    return useMemo(() => ({
        // State
        state,

        // Derived state
        processedItems,
        filteredItems,
        stats,
        activeItem,
        validationErrors,
        canImport,
        validItems,

        // Actions & Logic
        dispatch,
        actions: stableActions,
        ...handlers,

        // Refs
        fileInputRef,
    }), [
        state,
        processedItems,
        filteredItems,
        stats,
        activeItem,
        validationErrors,
        canImport,
        validItems,
        dispatch,
        stableActions,
        handlers,
        fileInputRef,
    ]);
}
