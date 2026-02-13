/**
 * Import Feature - State Types (V2 - Refactored)
 *
 * Key changes:
 * - Removed async state (isLoading/error/result) - now driven by mutation
 * - selectedIndex → selectedId for list stability
 * - Step as flow state only, not network state
 */

import type { ImportItem } from '@v2/shared';
import type { ParseResult, ValidationIssue } from '../../../lib/importUtils';

// ========================================
// Step Types (State Machine)
// ========================================

export type ImportStep = 'upload' | 'preview' | 'importing' | 'done' | 'error';
export type FilterMode = 'all' | 'error' | 'warning';
export type WorkbenchMode = 'split' | 'preview' | 'edit';
export type UploadMode = 'file' | 'paste';

// ========================================
// Derived Types
// ========================================

/**
 * Processed import item with validation results
 */
export interface ProcessedImportItem extends ImportItem {
    _validation: ValidationIssue[];
    subject_color?: string;
    subject_name?: string;
}

/**
 * Import statistics derived from processed items
 */
export interface ImportStats {
    total: number;
    errorCount: number;
    warningCount: number;
    valid: number;
}

/**
 * JSON field validation error tracking
 */
export interface JsonFieldErrors {
    correct_answer: string | null;
    hints: string | null;
    metadata: string | null;
}

// ========================================
// State Machine Configuration
// ========================================

export interface StepGuard {
    (state: ImportState): boolean;
}

export interface StepTransition {
    from: ImportStep;
    to: ImportStep;
    guard: StepGuard;
}

/**
 * Valid state transitions with guards
 */
export const STEP_TRANSITIONS: StepTransition[] = [
    {
        from: 'upload',
        to: 'preview',
        guard: (state) => state.items.length > 0,
    },
    {
        from: 'preview',
        to: 'upload',
        guard: () => true, // Always allow going back
    },
    {
        from: 'preview',
        to: 'importing',
        guard: () => true, // Guard checked at action level (valid items > 0)
    },
    {
        from: 'importing',
        to: 'done',
        guard: () => true, // Driven by mutation completion
    },
    {
        from: 'importing',
        to: 'error',
        guard: () => true, // Driven by mutation failure
    },
    {
        from: 'importing',
        to: 'preview',
        guard: () => true, // Allow cancel/back
    },
    {
        from: 'done',
        to: 'upload',
        guard: () => true, // Reset/start over
    },
    {
        from: 'error',
        to: 'preview',
        guard: () => true, // Try again (back to preview)
    },
    {
        from: 'error',
        to: 'upload',
        guard: () => true, // Reset/start over
    },
];

/**
 * Check if a transition is valid
 */
export function canTransition(
    state: ImportState,
    to: ImportStep
): boolean {
    const transition = STEP_TRANSITIONS.find(
        t => t.from === state.step && t.to === to
    );
    if (!transition) return false;
    return transition.guard(state);
}

// ========================================
// Main State Interface
// ========================================

/**
 * Unified Import State
 *
 * Note: Async state (loading/error/result) is NOT stored here.
 * Those are derived from TanStack Query mutation state.
 */
export interface ImportState {
    // ======== Flow State ========
    // Represents user intent/flow position, NOT network state
    step: ImportStep;

    // ======== Upload State ========
    uploadMode: UploadMode;
    pasteValue: string;
    isDragging: boolean;

    // ======== Data State ========
    parseResult: ParseResult | null;
    items: ImportItem[];

    // ======== Preview UI State ========
    // Using ID instead of index for list stability
    selectedId: string | null;
    filterMode: FilterMode;
    workbenchMode: WorkbenchMode;
    searchQuery: string;
    sidebarCollapsed: boolean;

    // ======== Preview Interaction State ========
    previewUserAnswer: unknown;
    previewRevealed: boolean;
    jsonErrors: JsonFieldErrors;
    focusTrigger: string | null;

    // ======== Validation State ========
    duplicates: Record<string, string>; // rowId -> duplicateQuestionId
    allowDuplicates: boolean; // [V3.3] Allow importing duplicates
}

/**
 * Initial state factory
 */
export const initialImportState: ImportState = {
    // Flow
    step: 'upload',

    // Upload
    uploadMode: 'file',
    pasteValue: '',
    isDragging: false,

    // Data
    parseResult: null,
    items: [],

    // Preview UI
    selectedId: null,
    filterMode: 'all',
    workbenchMode: 'split',
    searchQuery: '',
    sidebarCollapsed: false,

    // Preview Interaction
    previewUserAnswer: null,
    previewRevealed: true,
    jsonErrors: {
        correct_answer: null,
        hints: null,
        metadata: null,
    },
    focusTrigger: null,

    // Validation
    duplicates: {},
    allowDuplicates: false,
};

/**
 * Helper to get row ID as string (for selectedId)
 */
export function getItemId(item: ImportItem): string {
    return String(item.__row);
}
