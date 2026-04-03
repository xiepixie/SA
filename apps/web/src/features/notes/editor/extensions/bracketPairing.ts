import { EditorView, keymap } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * bracketPairing — Smart auto-pairing for Markdown/LaTeX editing
 *
 * Execution order (critical!):
 *   1. Selection wrapping
 *   2. Special combos: [[ → [[|]] and $$ → $$|$$
 *   3. Skip-over closing brackets / mirror chars
 *   4. Standard open brackets: ( [ {
 *   5. Mirror pairs: " ' ` $
 *
 * Features:
 * - Auto-close brackets: ( [ { " ' ` $
 * - Special [[ → [[|]] for wiki links
 * - Special $$ → $$|$$ for display math
 * - Skip-over: typing ] when next char is ] just moves cursor
 * - Backspace: deletes the pair if cursor is between empty pair
 * - Selection wrapping: selecting text then pressing ( wraps it in ()
 */

const OPEN_CLOSE: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
};

const MIRROR_PAIRS: Record<string, string> = {
    '"': '"',
    "'": "'",
    '`': '`',
    '$': '$',
};

const ALL_CLOSERS = new Set([']', ')', '}', '"', "'", '`', '$']);

export function bracketPairing(): Extension {
    return [
        // ── Input handler for auto-pairing ──
        EditorView.inputHandler.of((view, from, to, text) => {
            if (text.length !== 1) return false;

            const state = view.state;
            const hasSelection = from !== to;
            const nextChar = state.doc.sliceString(to, to + 1);
            const prevChar = from > 0 ? state.doc.sliceString(from - 1, from) : '';

            // ═══════════════════════════════════════════════
            // 1. Selection wrapping
            // ═══════════════════════════════════════════════
            if (hasSelection) {
                const selectedText = state.doc.sliceString(from, to);
                const closer = OPEN_CLOSE[text] || MIRROR_PAIRS[text];
                if (closer) {
                    view.dispatch(state.update({
                        changes: { from, to, insert: text + selectedText + closer },
                        selection: { anchor: from + 1, head: from + 1 + selectedText.length },
                    }));
                    return true;
                }
                return false;
            }

            // ═══════════════════════════════════════════════
            // 2. Special combos (MUST be before skip-over!)
            // ═══════════════════════════════════════════════

            // ── [[ → [[|]] wiki link ──
            // After typing first [, auto-pair gives [|]
            // When second [ is typed, we need: [[|]]
            if (text === '[' && prevChar === '[') {
                if (nextChar === ']') {
                    // Inside auto-pair: [|] → [[|]]
                    // Replace the auto-paired ] with []]
                    view.dispatch(state.update({
                        changes: { from, to: from + 1, insert: '[]]' },
                        selection: { anchor: from + 1 },
                    }));
                } else {
                    // No auto-pair present: [|xxx → [[|]]xxx
                    view.dispatch(state.update({
                        changes: { from, insert: '[]]' },
                        selection: { anchor: from + 1 },
                    }));
                }
                return true;
            }

            // ── $$ → $$|$$ display math ──
            // After typing first $, auto-pair gives $|$
            // When second $ is typed, we need: $$|$$
            if (text === '$' && prevChar === '$') {
                // Don't trigger for $$$ (already inside display math)
                const prevPrevChar = from > 1 ? state.doc.sliceString(from - 2, from - 1) : '';
                if (prevPrevChar !== '$') {
                    if (nextChar === '$') {
                        // Inside auto-pair: $|$ → $$|$$
                        // Replace the auto-paired $ with $$$
                        view.dispatch(state.update({
                            changes: { from, to: from + 1, insert: '$$$' },
                            selection: { anchor: from + 1 },
                        }));
                    } else {
                        // No auto-pair present: $|xxx → $$|$$xxx
                        view.dispatch(state.update({
                            changes: { from, insert: '$$$' },
                            selection: { anchor: from + 1 },
                        }));
                    }
                    return true;
                }
                // prevPrevChar is $ — we're inside $$..$$, fall through to skip-over
            }

            // ═══════════════════════════════════════════════
            // 3. Skip-over closing bracket / mirror char
            // ═══════════════════════════════════════════════
            if (ALL_CLOSERS.has(text) && nextChar === text) {
                const isMirror = MIRROR_PAIRS[text] !== undefined;
                const isCloser = text === ')' || text === ']' || text === '}';

                if (isMirror || isCloser) {
                    view.dispatch(state.update({
                        selection: { anchor: from + 1 },
                    }));
                    return true;
                }
            }

            // ═══════════════════════════════════════════════
            // 4. Standard open brackets: ( [ {
            // ═══════════════════════════════════════════════
            if (OPEN_CLOSE[text]) {
                view.dispatch(state.update({
                    changes: { from, to, insert: text + OPEN_CLOSE[text] },
                    selection: { anchor: from + 1 },
                }));
                return true;
            }

            // ═══════════════════════════════════════════════
            // 5. Mirror pairs: " ' ` $
            // ═══════════════════════════════════════════════
            if (MIRROR_PAIRS[text]) {
                // Don't pair ' after word characters (contractions: don't)
                if (text === "'" && /\w/.test(prevChar)) {
                    return false;
                }
                // Don't pair ` if prev is ` (e.g. user building ``` code fence)
                if (text === '`' && prevChar === '`') {
                    return false;
                }

                view.dispatch(state.update({
                    changes: { from, to, insert: text + MIRROR_PAIRS[text] },
                    selection: { anchor: from + 1 },
                }));
                return true;
            }

            return false;
        }),

        // ── Backspace handler: delete pair when between empty brackets ──
        keymap.of([{
            key: 'Backspace',
            run: (view) => {
                const { main } = view.state.selection;
                if (!main.empty) return false;

                const pos = main.head;
                if (pos === 0) return false;

                const before = view.state.doc.sliceString(pos - 1, pos);
                const after = view.state.doc.sliceString(pos, pos + 1);

                // Check [[ ]] wiki link pair deletion (check first — more specific)
                if (pos >= 2) {
                    const twoBack = view.state.doc.sliceString(pos - 2, pos);
                    const twoForward = view.state.doc.sliceString(pos, pos + 2);
                    if (twoBack === '[[' && twoForward === ']]') {
                        view.dispatch(view.state.update({
                            changes: { from: pos - 2, to: pos + 2 },
                            selection: { anchor: pos - 2 },
                        }));
                        return true;
                    }
                    // Check $$ $$ display math pair deletion
                    if (twoBack === '$$' && twoForward === '$$') {
                        view.dispatch(view.state.update({
                            changes: { from: pos - 2, to: pos + 2 },
                            selection: { anchor: pos - 2 },
                        }));
                        return true;
                    }
                }

                // Check standard pairs: () [] {} "" '' `` $$
                const expectedClose = OPEN_CLOSE[before] || MIRROR_PAIRS[before];
                if (expectedClose && after === expectedClose) {
                    view.dispatch(view.state.update({
                        changes: { from: pos - 1, to: pos + 1 },
                        selection: { anchor: pos - 1 },
                    }));
                    return true;
                }

                return false;
            },
        }]),
    ];
}
