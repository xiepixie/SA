import { keymap } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';
import { EditorState, Transaction } from '@codemirror/state';

// List patterns to detect and continue
const LIST_PATTERNS = [
    // Checkbox: - [ ] or - [x] or * [ ] etc.
    { regex: /^(\s*)([-*+])\s\[[ xX]\]\s(.*)$/, empty: /^(\s*)([-*+])\s\[[ xX]\]\s$/ },
    // Unordered: - item or * item or + item
    { regex: /^(\s*)([-*+])\s(.+)$/, empty: /^(\s*)([-*+])\s$/ },
    // Ordered: 1. item or 1) item
    { regex: /^(\s*)(\d+)([.)]\s)(.+)$/, empty: /^(\s*)(\d+)[.)]\s$/ },
];

function handleEnterInList(state: EditorState): Transaction | null {
    const { main } = state.selection;

    // Only handle if cursor is at end of line (no selection)
    if (!main.empty) return null;

    const line = state.doc.lineAt(main.head);
    const lineText = line.text;

    for (const pattern of LIST_PATTERNS) {
        // Check if current line is an empty list item (just the marker)
        const emptyMatch = lineText.match(pattern.empty);
        if (emptyMatch) {
            // Remove the list marker and don't continue
            return state.update({
                changes: { from: line.from, to: line.to, insert: '' },
                selection: { anchor: line.from },
            });
        }

        // Check if current line is a list item with content
        const match = lineText.match(pattern.regex);
        if (match) {
            const [, indent, marker, separator] = match;
            let newMarker: string;

            if (/^\d+$/.test(marker)) {
                // Ordered list: increment number
                const nextNum = parseInt(marker, 10) + 1;
                newMarker = `${indent}${nextNum}${separator}`;
            } else if (lineText.includes('[ ]') || lineText.includes('[x]') || lineText.includes('[X]')) {
                // Checkbox: continue with unchecked box
                newMarker = `${indent}${marker} [ ] `;
            } else {
                // Unordered list: same marker
                newMarker = `${indent}${marker} `;
            }

            return state.update({
                changes: { from: main.head, insert: '\n' + newMarker },
                selection: { anchor: main.head + 1 + newMarker.length },
            });
        }
    }

    return null;
}

const smartListKeymap: KeyBinding[] = [
    {
        key: 'Enter',
        run: (view) => {
            const transaction = handleEnterInList(view.state);
            if (transaction) {
                view.dispatch(transaction);
                return true;
            }
            return false;
        },
    },
];

export function smartList() {
    return keymap.of(smartListKeymap);
}
