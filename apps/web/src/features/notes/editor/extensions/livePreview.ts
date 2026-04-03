import {
    Decoration,
    EditorView,
    ViewPlugin,
    ViewUpdate,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Range } from '@codemirror/state';

/**
 * Obsidian-style Live Preview for CodeMirror
 *
 * Headings:        always styled; `#` markers hidden unless cursor is on that line
 * Bold/Italic/~~:  markers hidden unless cursor is INSIDE the specific marker pair
 *
 * This gives the user instant WYSIWYG feel while still allowing precise editing
 * by simply placing the cursor inside any formatted range.
 */

// ── Reusable singletons ──
const hideMark = Decoration.replace({});
const boldMark = Decoration.mark({ class: 'cm-lp-bold' });
const italicMark = Decoration.mark({ class: 'cm-lp-italic' });
const strikeMark = Decoration.mark({ class: 'cm-lp-strike' });
const inlineCodeMark = Decoration.mark({ class: 'cm-lp-code' });

const headingLine: Record<number, Decoration> = {};
for (let i = 1; i <= 6; i++) {
    headingLine[i] = Decoration.line({
        attributes: { class: `cm-lp-heading cm-lp-h${i}` },
    });
}

// ── Inline match descriptor ──
interface InlineMatch {
    from: number;       // absolute start in doc
    to: number;         // absolute end in doc
    markerStartLen: number;  // length of opening marker
    markerEndLen: number;    // length of closing marker
    style?: Decoration;  // optional mark decoration for content
}

// ── Plugin ──
const livePreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.build(view);
        }

        update(u: ViewUpdate) {
            if (u.docChanged || u.selectionSet || u.viewportChanged) {
                this.decorations = this.build(u.view);
            }
        }

        build(view: EditorView): DecorationSet {
            const decs: Range<Decoration>[] = [];
            const { main } = view.state.selection;
            const cursorPos = main.head;
            const cursorLine = view.state.doc.lineAt(cursorPos).number;

            for (const { from, to } of view.visibleRanges) {
                for (let pos = from; pos <= to;) {
                    const line = view.state.doc.lineAt(pos);
                    const isActiveLine = line.number === cursorLine;

                    // ── Heading ──
                    const hMatch = line.text.match(/^(#{1,6})\s/);
                    if (hMatch) {
                        const lvl = hMatch[1].length;
                        decs.push(headingLine[lvl].range(line.from));
                        if (!isActiveLine) {
                            decs.push(hideMark.range(line.from, line.from + lvl + 1));
                        }
                    }

                    // ── Inline formatting ──
                    // Always scan, but decide per-match whether to hide markers
                    this.inlineDecos(line.text, line.from, cursorPos, decs);

                    pos = line.to + 1;
                }
            }

            try {
                return Decoration.set(decs, true);
            } catch {
                return Decoration.none;
            }
        }

        /**
         * Scan a single line for bold / italic / strikethrough / inline code.
         * For each match, if cursor is INSIDE the match span, show raw markers.
         * Otherwise, hide markers and apply styling.
         */
        inlineDecos(text: string, base: number, cursor: number, out: Range<Decoration>[]) {
            const matches: InlineMatch[] = [];
            const used = new Set<number>(); // track used positions to avoid overlaps
            let m: RegExpExecArray | null;

            // 1) Bold  **…**
            const boldRe = /\*\*(.+?)\*\*/g;
            while ((m = boldRe.exec(text)) !== null) {
                const from = base + m.index;
                const to = from + m[0].length;
                matches.push({ from, to, markerStartLen: 2, markerEndLen: 2, style: boldMark });
                for (let i = m.index; i < m.index + m[0].length; i++) used.add(i);
            }

            // 2) Italic  *…*  (not adjacent to another *)
            const italicRe = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
            while ((m = italicRe.exec(text)) !== null) {
                let skip = false;
                for (let i = m.index; i < m.index + m[0].length; i++) {
                    if (used.has(i)) { skip = true; break; }
                }
                if (skip) continue;
                const from = base + m.index;
                const to = from + m[0].length;
                matches.push({ from, to, markerStartLen: 1, markerEndLen: 1, style: italicMark });
            }

            // 3) Strikethrough  ~~…~~
            const strikeRe = /~~(.+?)~~/g;
            while ((m = strikeRe.exec(text)) !== null) {
                const from = base + m.index;
                const to = from + m[0].length;
                matches.push({ from, to, markerStartLen: 2, markerEndLen: 2, style: strikeMark });
            }

            // 4) Inline code  `…`
            const codeRe = /(?<!`)(`)((?!`).+?)`(?!`)/g;
            while ((m = codeRe.exec(text)) !== null) {
                let skip = false;
                for (let i = m.index; i < m.index + m[0].length; i++) {
                    if (used.has(i)) { skip = true; break; }
                }
                if (skip) continue;
                const from = base + m.index;
                const to = from + m[0].length;
                matches.push({ from, to, markerStartLen: 1, markerEndLen: 1, style: inlineCodeMark });
            }

            // 5) Wiki links [[title|type:id]]
            const wikiRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
            while ((m = wikiRe.exec(text)) !== null) {
                const from = base + m.index;
                const to = from + m[0].length;
                const targetStr = m[2];
                // start marker [[ is always 2
                const endLen = targetStr ? 1 + targetStr.length + 2 : 2; // either '|target]]' or ']]'
                matches.push({ from, to, markerStartLen: 2, markerEndLen: endLen });
                // We do NOT apply style here; `wikiLink.ts` handles the coloring (.cm-wiki-link)
            }

            // Apply decorations per match
            for (const match of matches) {
                const cursorInside = cursor >= match.from && cursor <= match.to;

                if (cursorInside) {
                    // Cursor is inside: show raw markers, STILL apply style to content if applicable
                    if (match.style) {
                        out.push(match.style.range(match.from + match.markerStartLen, match.to - match.markerEndLen));
                    }
                } else {
                    // Cursor is outside: hide markers, apply style if applicable
                    out.push(hideMark.range(match.from, match.from + match.markerStartLen));
                    if (match.style) {
                        out.push(match.style.range(match.from + match.markerStartLen, match.to - match.markerEndLen));
                    }
                    out.push(hideMark.range(match.to - match.markerEndLen, match.to));
                }
            }
        }
    },
    { decorations: v => v.decorations }
);

// ── Theme ──
const livePreviewTheme = EditorView.theme({
    '.cm-lp-heading': {
        fontWeight: '700',
        letterSpacing: '-0.01em',
    },
    '.cm-lp-h1': { fontSize: '1.75em', lineHeight: '1.3' },
    '.cm-lp-h2': { fontSize: '1.45em', lineHeight: '1.35' },
    '.cm-lp-h3': { fontSize: '1.2em', lineHeight: '1.4' },
    '.cm-lp-h4': { fontSize: '1.1em', lineHeight: '1.45' },
    '.cm-lp-h5': { fontSize: '1.05em' },
    '.cm-lp-h6': { fontSize: '1em' },
    '.cm-lp-bold': { fontWeight: '700' },
    '.cm-lp-italic': { fontStyle: 'italic' },
    '.cm-lp-strike': { textDecoration: 'line-through', opacity: '0.5' },
    '.cm-lp-code': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.9em',
        padding: '1px 5px',
        borderRadius: '4px',
    },
});

export function livePreview() {
    return [livePreviewPlugin, livePreviewTheme];
}
