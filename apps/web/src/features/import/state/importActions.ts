/**
 * Import Feature - Action Types (V2 - Refactored)
 *
 * Key changes:
 * - Removed async actions (IMPORT_START/SUCCESS/ERROR) - handled by mutation
 * - Added TRANSITION action with state machine guards
 * - selectedIndex → selectedId
 */

import type { ImportItem } from '@v2/shared';
import type { ParseResult } from '../../../lib/importUtils';
import type {
    ImportStep,
    UploadMode,
    FilterMode,
    WorkbenchMode,
    JsonFieldErrors,
} from './importTypes';

// ========================================
// Flow Actions (State Machine)
// ========================================

/**
 * Transition to a new step (with guard validation in reducer)
 */
export interface TransitionAction {
    type: 'TRANSITION';
    payload: {
        to: ImportStep;
        force?: boolean; // Dev-only: bypass guards
    };
}

export interface ResetAction {
    type: 'RESET';
}

// ========================================
// Upload Actions
// ========================================

export interface SetUploadModeAction {
    type: 'SET_UPLOAD_MODE';
    payload: UploadMode;
}

export interface SetPasteValueAction {
    type: 'SET_PASTE_VALUE';
    payload: string;
}

export interface SetDraggingAction {
    type: 'SET_DRAGGING';
    payload: boolean;
}

// ========================================
// Parse Actions
// ========================================

export interface SetParseResultAction {
    type: 'SET_PARSE_RESULT';
    payload: {
        result: ParseResult;
        items: ImportItem[];
    };
}

export interface ParseErrorAction {
    type: 'PARSE_ERROR';
    payload: string;
}

// ========================================
// Item Management Actions
// ========================================

export interface UpdateItemAction {
    type: 'UPDATE_ITEM';
    payload: {
        id: string; // Changed from index to id
        updates: Partial<ImportItem['question']> | { tag_names: string[] };
    };
}

export interface UpdateItemFieldAction {
    type: 'UPDATE_ITEM_FIELD';
    payload: {
        id: string; // Changed from index to id
        field: string;
        value: unknown;
    };
}

export interface DeleteItemAction {
    type: 'DELETE_ITEM';
    payload: string; // id instead of index
}

export interface AutoCleanupAction {
    type: 'AUTO_CLEANUP';
}

// ========================================
// Preview Navigation Actions
// ========================================

export interface SelectItemAction {
    type: 'SELECT_ITEM';
    payload: string | null; // id instead of index
}

export interface SetFilterModeAction {
    type: 'SET_FILTER_MODE';
    payload: FilterMode;
}

export interface SetWorkbenchModeAction {
    type: 'SET_WORKBENCH_MODE';
    payload: WorkbenchMode;
}

export interface SetSearchQueryAction {
    type: 'SET_SEARCH_QUERY';
    payload: string;
}

export interface ToggleSidebarAction {
    type: 'TOGGLE_SIDEBAR';
}

// ========================================
// Preview Interaction Actions
// ========================================

export interface SetPreviewUserAnswerAction {
    type: 'SET_PREVIEW_USER_ANSWER';
    payload: unknown;
}

export interface SetPreviewRevealedAction {
    type: 'SET_PREVIEW_REVEALED';
    payload: boolean;
}

export interface SetJsonErrorAction {
    type: 'SET_JSON_ERROR';
    payload: {
        field: keyof JsonFieldErrors;
        error: string | null;
    };
}

export interface ResetJsonErrorsAction {
    type: 'RESET_JSON_ERRORS';
}

export interface FocusFieldAction {
    type: 'FOCUS_FIELD';
    payload: string | null;
}

export interface RetryFailedAction {
    type: 'RETRY_FAILED';
    payload: number[]; // row numbers
}

// ========================================
// Union Type
// ========================================

export type ImportAction =
    // Flow
    | TransitionAction
    | ResetAction
    // Upload
    | SetUploadModeAction
    | SetPasteValueAction
    | SetDraggingAction
    // Parse
    | SetParseResultAction
    | ParseErrorAction
    // Item Management
    | UpdateItemAction
    | UpdateItemFieldAction
    | DeleteItemAction
    | AutoCleanupAction
    // Preview Navigation
    | SelectItemAction
    | SetFilterModeAction
    | SetWorkbenchModeAction
    | SetSearchQueryAction
    | ToggleSidebarAction
    // Preview Interaction
    | SetPreviewUserAnswerAction
    | SetPreviewRevealedAction
    | SetJsonErrorAction
    | ResetJsonErrorsAction
    | FocusFieldAction
    | RetryFailedAction;

// ========================================
// Action Creators
// ========================================

export const importActions = {
    // Flow (State Machine)
    transition: (to: ImportStep, force?: boolean): TransitionAction => ({
        type: 'TRANSITION',
        payload: { to, force },
    }),
    reset: (): ResetAction => ({ type: 'RESET' }),

    // Upload
    setUploadMode: (mode: UploadMode): SetUploadModeAction => ({
        type: 'SET_UPLOAD_MODE',
        payload: mode,
    }),
    setPasteValue: (value: string): SetPasteValueAction => ({
        type: 'SET_PASTE_VALUE',
        payload: value,
    }),
    setDragging: (dragging: boolean): SetDraggingAction => ({
        type: 'SET_DRAGGING',
        payload: dragging,
    }),

    // Parse
    setParseResult: (
        result: ParseResult,
        items: ImportItem[]
    ): SetParseResultAction => ({
        type: 'SET_PARSE_RESULT',
        payload: { result, items },
    }),
    parseError: (error: string): ParseErrorAction => ({
        type: 'PARSE_ERROR',
        payload: error,
    }),

    // Item Management (now using id)
    updateItem: (
        id: string,
        updates: Partial<ImportItem['question']> | { tag_names: string[] }
    ): UpdateItemAction => ({
        type: 'UPDATE_ITEM',
        payload: { id, updates },
    }),
    updateItemField: (
        id: string,
        field: string,
        value: unknown
    ): UpdateItemFieldAction => ({
        type: 'UPDATE_ITEM_FIELD',
        payload: { id, field, value },
    }),
    deleteItem: (id: string): DeleteItemAction => ({
        type: 'DELETE_ITEM',
        payload: id,
    }),
    autoCleanup: (): AutoCleanupAction => ({ type: 'AUTO_CLEANUP' }),

    // Preview Navigation (now using id)
    selectItem: (id: string | null): SelectItemAction => ({
        type: 'SELECT_ITEM',
        payload: id,
    }),
    setFilterMode: (mode: FilterMode): SetFilterModeAction => ({
        type: 'SET_FILTER_MODE',
        payload: mode,
    }),
    setWorkbenchMode: (mode: WorkbenchMode): SetWorkbenchModeAction => ({
        type: 'SET_WORKBENCH_MODE',
        payload: mode,
    }),
    setSearchQuery: (query: string): SetSearchQueryAction => ({
        type: 'SET_SEARCH_QUERY',
        payload: query,
    }),
    toggleSidebar: (): ToggleSidebarAction => ({ type: 'TOGGLE_SIDEBAR' }),

    // Preview Interaction
    setPreviewUserAnswer: (answer: unknown): SetPreviewUserAnswerAction => ({
        type: 'SET_PREVIEW_USER_ANSWER',
        payload: answer,
    }),
    setPreviewRevealed: (revealed: boolean): SetPreviewRevealedAction => ({
        type: 'SET_PREVIEW_REVEALED',
        payload: revealed,
    }),
    setJsonError: (
        field: keyof JsonFieldErrors,
        error: string | null
    ): SetJsonErrorAction => ({
        type: 'SET_JSON_ERROR',
        payload: { field, error },
    }),
    resetJsonErrors: (): ResetJsonErrorsAction => ({ type: 'RESET_JSON_ERRORS' }),
    focusField: (field: string | null): FocusFieldAction => ({
        type: 'FOCUS_FIELD',
        payload: field,
    }),

    retryFailed: (failedRows: number[]): RetryFailedAction => ({
        type: 'RETRY_FAILED',
        payload: failedRows,
    }),
};
