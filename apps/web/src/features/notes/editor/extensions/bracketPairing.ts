import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

// Custom bracket pairs for notes (beyond standard closeBrackets)
const CUSTOM_PAIRS: Record<string, { close: string; skipIfBefore?: RegExp }> = {
    '$': { close: '$', skipIfBefore: /^\$/ },  // LaTeX inline
    '[': { close: ']' },
    '{': { close: '}' },
    '(': { close: ')' },
    '"': { close: '"' },
    "'": { close: "'" },
    '`': { close: '`' },
};

// Special handling for [[ wiki links
function handleDoubleOpenBracket(state: EditorState, pos: number): { changes: any; selection: any } | null {
    // Check if previous char is [
    if (pos > 0) {
        const prevChar = state.doc.sliceString(pos - 1, pos);
        if (prevChar === '[') {
            // Insert ]] and place cursor in the middle
            return {
                changes: { from: pos, insert: ']]' },
                selection: { anchor: pos },
            };
        }
    }
    return null;
}

// Special handling for $$ display math
function handleDoubleDollar(state: EditorState, pos: number): { changes: any; selection: any } | null {
    if (pos > 0) {
        const prevChar = state.doc.sliceString(pos - 1, pos);
        if (prevChar === '$') {
            // Insert $$ and place cursor in the middle
            return {
                changes: { from: pos, insert: '$$' },
                selection: { anchor: pos },
            };
        }
    }
    return null;
}

export function bracketPairing(): Extension {
    return EditorView.inputHandler.of((view, from, to, text) => {
        // Only handle single character insertions
        if (text.length !== 1 || from !== to) return false;

        const state = view.state;

        // Handle [[ for wiki links
        if (text === '[') {
            const result = handleDoubleOpenBracket(state, from);
            if (result) {
                view.dispatch(state.update(result));
                return true;
            }
        }

        // Handle $$ for display math
        if (text === '$') {
            const result = handleDoubleDollar(state, from);
            if (result) {
                view.dispatch(state.update(result));
                return true;
            }
        }

        // Handle standard pairs
        const pair = CUSTOM_PAIRS[text];
        if (pair) {
            // Check if we should skip (e.g., don't pair $ if next char is already $)
            if (pair.skipIfBefore) {
                const nextChar = state.doc.sliceString(from, from + 1);
                if (pair.skipIfBefore.test(nextChar)) {
                    return false;
                }
            }

            // Check if next character is the same (typing over existing)
            const nextChar = state.doc.sliceString(from, from + 1);
            if (nextChar === text && (text === '"' || text === "'" || text === '`' || text === '$')) {
                // Move cursor past the existing character
                view.dispatch(state.update({
                    selection: { anchor: from + 1 },
                }));
                return true;
            }

            // Insert pair
            view.dispatch(state.update({
                changes: { from, to, insert: text + pair.close },
                selection: { anchor: from + 1 },
            }));
            return true;
        }

        // Handle closing brackets - skip if next char is the same
        const closingBrackets = [']', '}', ')', '"', "'", '`', '$'];
        if (closingBrackets.includes(text)) {
            const nextChar = state.doc.sliceString(from, from + 1);
            if (nextChar === text) {
                view.dispatch(state.update({
                    selection: { anchor: from + 1 },
                }));
                return true;
            }
        }

        return false;
    });
}
