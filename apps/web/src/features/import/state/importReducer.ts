/**
 * Import Feature - Reducer (V2 - Refactored)
 *
 * Key changes:
 * - Removed async state handling (IMPORT_START/SUCCESS/ERROR)
 * - Added TRANSITION with state machine guards
 * - selectedIndex → selectedId
 * - Item operations use ID instead of index
 */

import type { ImportState } from './importTypes';
import {
    initialImportState,
    canTransition,
    getItemId,
} from './importTypes';
import type { ImportAction } from './importActions';

export function importReducer(state: ImportState, action: ImportAction): ImportState {
    switch (action.type) {
        // ========================================
        // Flow (State Machine)
        // ========================================

        case 'TRANSITION': {
            const { to, force } = action.payload;

            // Dev-only: force bypass guards
            if (force && process.env.NODE_ENV === 'development') {
                console.warn(`[ImportReducer] Forced transition: ${state.step} -> ${to}`);
                return { ...state, step: to };
            }

            // Validate transition
            if (!canTransition(state, to)) {
                console.warn(`[ImportReducer] Invalid transition: ${state.step} -> ${to}`);
                return state;
            }

            return { ...state, step: to };
        }

        case 'RESET':
            return { ...initialImportState };

        // ========================================
        // Upload
        // ========================================

        case 'SET_UPLOAD_MODE':
            return { ...state, uploadMode: action.payload };

        case 'SET_PASTE_VALUE':
            return { ...state, pasteValue: action.payload };

        case 'SET_DRAGGING':
            return { ...state, isDragging: action.payload };

        // ========================================
        // Parse
        // ========================================

        case 'SET_PARSE_RESULT': {
            const { result, items } = action.payload;

            // Auto-select first item
            const firstItemId = items.length > 0 ? getItemId(items[0]) : null;

            // Auto-transition to preview if has items
            const nextStep = items.length > 0 ? 'preview' : state.step;

            return {
                ...state,
                parseResult: result,
                items: items,
                step: nextStep,
                selectedId: firstItemId,
            };
        }

        case 'PARSE_ERROR':
            // Parse errors don't change step - stay on upload
            // Error display should be handled by UI (toast/alert)
            console.error('[ImportReducer] Parse error:', action.payload);
            return state;

        // ========================================
        // Item Management (using ID)
        // ========================================

        case 'UPDATE_ITEM': {
            const { id, updates } = action.payload;
            const itemIndex = state.items.findIndex(item => getItemId(item) === id);

            if (itemIndex === -1) return state;

            const newItems = [...state.items];
            const item = newItems[itemIndex];

            if ('tag_names' in updates) {
                newItems[itemIndex] = {
                    ...item,
                    tag_names: (updates as { tag_names: string[] }).tag_names,
                };
            } else {
                newItems[itemIndex] = {
                    ...item,
                    question: { ...item.question, ...updates },
                };
            }

            return { ...state, items: newItems };
        }

        case 'UPDATE_ITEM_FIELD': {
            const { id, field, value } = action.payload;
            const itemIndex = state.items.findIndex(item => getItemId(item) === id);

            if (itemIndex === -1) return state;

            const newItems = [...state.items];
            const item = newItems[itemIndex];

            // Handle top-level fields
            if (field === 'subject_name') {
                newItems[itemIndex] = { ...item, subject_name: value as string };
            } else if (field === 'tag_names') {
                newItems[itemIndex] = { ...item, tag_names: value as string[] };
            } else {
                // Handle question fields
                newItems[itemIndex] = {
                    ...item,
                    question: { ...item.question, [field]: value },
                };
            }

            return { ...state, items: newItems };
        }

        case 'DELETE_ITEM': {
            const idToDelete = action.payload;
            const newItems = state.items.filter(item => getItemId(item) !== idToDelete);

            // If deleted item was selected, select next/prev
            let newSelectedId = state.selectedId;
            if (state.selectedId === idToDelete) {
                const deletedIndex = state.items.findIndex(
                    item => getItemId(item) === idToDelete
                );
                const nextItem = newItems[deletedIndex] || newItems[deletedIndex - 1];
                newSelectedId = nextItem ? getItemId(nextItem) : null;
            }

            return {
                ...state,
                items: newItems,
                selectedId: newSelectedId,
            };
        }

        case 'AUTO_CLEANUP': {
            // Smart cleanup: fix what can be fixed, remove what can't
            const fixedItems = state.items
                .map(item => {
                    const q = item.question;
                    const updates: Partial<typeof q> = {};

                    // 1. Trim title whitespace
                    if (q.title && q.title !== q.title.trim()) {
                        updates.title = q.title.trim();
                    }

                    // 2. Auto-fill correct_answer.type if missing
                    const ans = q.correct_answer as Record<string, unknown> | undefined;
                    if (ans && Object.keys(ans).length > 0 && !ans.type) {
                        updates.correct_answer = { ...ans, type: q.question_type };
                    }

                    // 3. Generate correct_answer from correct_answer_text if empty
                    const isEmptyAnswer = !ans || Object.keys(ans).length === 0;
                    if (isEmptyAnswer && q.correct_answer_text?.trim()) {
                        const tokens = q.correct_answer_text.split(/[;,、\n]+/).map(s => s.trim()).filter(Boolean);
                        if (tokens.length > 0) {
                            if (q.question_type === 'fill_blank') {
                                updates.correct_answer = { type: 'fill_blank', blanks: tokens };
                            } else if (q.question_type === 'short_answer') {
                                updates.correct_answer = { type: 'short_answer', answers: tokens };
                            }
                        }
                    }

                    // Apply updates if any
                    if (Object.keys(updates).length > 0) {
                        return {
                            ...item,
                            question: { ...q, ...updates }
                        };
                    }
                    return item;
                })
                // Filter out items with empty titles (truly unfixable)
                .filter(item => item.question.title?.trim());

            // Adjust selection if needed
            let newSelectedId = state.selectedId;
            if (state.selectedId) {
                const stillExists = fixedItems.some(
                    item => getItemId(item) === state.selectedId
                );
                if (!stillExists) {
                    newSelectedId = fixedItems.length > 0 ? getItemId(fixedItems[0]) : null;
                }
            }

            return {
                ...state,
                items: fixedItems,
                selectedId: newSelectedId,
            };
        }

        // ========================================
        // Preview Navigation (using ID)
        // ========================================

        case 'SELECT_ITEM':
            return {
                ...state,
                selectedId: action.payload,
                // Reset preview state when changing items
                previewRevealed: false,
                previewUserAnswer: null,
                jsonErrors: {
                    correct_answer: null,
                    hints: null,
                    metadata: null,
                },
            };

        case 'SET_FILTER_MODE':
            return { ...state, filterMode: action.payload };

        case 'SET_WORKBENCH_MODE':
            return { ...state, workbenchMode: action.payload };

        case 'SET_SEARCH_QUERY':
            return { ...state, searchQuery: action.payload };

        case 'TOGGLE_SIDEBAR':
            return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

        // ========================================
        // Preview Interaction
        // ========================================

        case 'SET_PREVIEW_USER_ANSWER':
            return { ...state, previewUserAnswer: action.payload };

        case 'SET_PREVIEW_REVEALED':
            return { ...state, previewRevealed: action.payload };

        case 'SET_JSON_ERROR':
            return {
                ...state,
                jsonErrors: {
                    ...state.jsonErrors,
                    [action.payload.field]: action.payload.error,
                },
            };

        case 'RESET_JSON_ERRORS':
            return {
                ...state,
                jsonErrors: {
                    correct_answer: null,
                    hints: null,
                    metadata: null,
                },
            };

        case 'FOCUS_FIELD':
            return { ...state, focusTrigger: action.payload };

        case 'RETRY_FAILED': {
            const { failedRows } = action.payload; // Destructure object payload
            const failedSet = new Set(failedRows);
            const remainingItems = state.items.filter(item => failedSet.has(item.__row));

            return {
                ...state,
                items: remainingItems,
                step: 'preview',
                selectedId: remainingItems.length > 0 ? getItemId(remainingItems[0]) : null,
                filterMode: 'error', // Auto-filter to errors for focus
            };
        }

        case 'SET_DUPLICATES':
            return {
                ...state,
                duplicates: action.payload.duplicates,
            };

        case 'SET_ALLOW_DUPLICATES':
            return {
                ...state,
                allowDuplicates: action.payload,
            };

        default:
            return state;
    }
}
