import {
    EditorView,
    Decoration,
    WidgetType,
    ViewPlugin,
    ViewUpdate,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Range } from '@codemirror/state';
import katex from 'katex';
import { sanitizeLatex } from '@v2/markdown-parser';

// ── Types ──
interface LaTeXRange {
    from: number;
    to: number;
    tex: string;
    displayMode: boolean;
}

// ── Regex scanning ──
function findLatexRanges(doc: any): LaTeXRange[] { // Changed doc: string to doc: any to match state.doc type
    const ranges: LaTeXRange[] = [];
    const docStr = doc.toString();

    // Display math: $$ ... $$
    const displayRegex = /\$\$([\s\S]+?)\$\$/g;
    let match;
    while ((match = displayRegex.exec(docStr)) !== null) {
        ranges.push({
            from: match.index,
            to: match.index + match[0].length,
            tex: match[1].trim(),
            displayMode: true,
        });
    }

    // Inline math: $ ... $
    const inlineRegex = /(?<!\$)\$(?!\$)([^\n$\\]*(?:\\.[^\n$\\]*)*)\$(?!\$)/g;
    while ((match = inlineRegex.exec(docStr)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const overlaps = ranges.some(r => !(end <= r.from || start >= r.to));
        if (!overlaps && match[1].trim().length > 0) {
            ranges.push({ from: start, to: end, tex: match[1].trim(), displayMode: false });
        }
    }

    return ranges.sort((a, b) => a.from - b.from);
}

// ── Rendered KaTeX Widget (Inactive state) ──
class LaTeXWidget extends WidgetType {
    tex: string;
    displayMode: boolean;
    constructor(tex: string, displayMode: boolean) {
        super();
        this.tex = tex;
        this.displayMode = displayMode;
    }

    eq(other: LaTeXWidget) {
        return other.tex === this.tex && other.displayMode === this.displayMode;
    }

    toDOM() {
        const el = document.createElement(this.displayMode ? 'div' : 'span');
        el.className = this.displayMode ? 'math-block is-rendered' : 'math-inline is-rendered';
        el.setAttribute('data-math-tex', this.tex);

        try {
            katex.render(sanitizeLatex(this.tex), el, {
                displayMode: this.displayMode,
                throwOnError: false,
                errorColor: '#cc0000',
            });
        } catch (e) {
            console.error('KaTeX render error:', e);
        }
        return el;
    }

    ignoreEvent() { return true; }
}

// ── Sync-Insertion Preview Widget (Active state) ──
class LaTeXSyncWidget extends WidgetType {
    tex: string;
    displayMode: boolean;
    constructor(tex: string, displayMode: boolean) {
        super();
        this.tex = tex;
        this.displayMode = displayMode;
    }

    eq(other: LaTeXSyncWidget) {
        return other.tex === this.tex && other.displayMode === this.displayMode;
    }

    toDOM() {
        const wrap = document.createElement('div');
        wrap.className = this.displayMode
            ? 'cm-latex-sync cm-latex-sync-block'
            : 'cm-latex-sync cm-latex-sync-inline';

        const katexWrap = document.createElement(this.displayMode ? 'div' : 'span');
        katexWrap.className = this.displayMode ? 'math-block' : 'math-inline';
        wrap.appendChild(katexWrap);

        if (!this.tex) {
            katexWrap.innerHTML = '';
            return wrap;
        }
        try {
            katex.render(sanitizeLatex(this.tex), katexWrap, {
                displayMode: this.displayMode,
                throwOnError: false,
                errorColor: '#cc0000',
            });
        } catch (e) {
            katexWrap.textContent = `⚠ ${this.tex}`;
            katexWrap.style.color = 'var(--color-error)';
            katexWrap.style.fontSize = '0.8em';
        }
        return wrap;
    }

    updateDOM(dom: HTMLElement) {
        const isBlock = dom.classList.contains('cm-latex-sync-block');
        if (isBlock !== this.displayMode) return false;
        const katexWrap = dom.querySelector('.math-block, .math-inline') as HTMLElement;
        if (katexWrap) {
            if (!this.tex) {
                katexWrap.innerHTML = '';
                return true;
            }
            try {
                katex.render(sanitizeLatex(this.tex), katexWrap, {
                    displayMode: this.displayMode,
                    throwOnError: false,
                    errorColor: '#cc0000',
                });
            } catch (e) {
                katexWrap.textContent = `⚠ ${this.tex}`;
                katexWrap.style.color = 'var(--color-error)';
                katexWrap.style.fontSize = '0.8em';
            }
        }
        return true;
    }

    ignoreEvent() { return true; }
}

// ── State Management ──
const latexPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = buildDecos(view.state, view.hasFocus);
        }
        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.focusChanged) {
                this.decorations = buildDecos(update.state, update.view.hasFocus);
            }
        }
    },
    {
        decorations: v => v.decorations,
    }
);

function buildDecos(state: any, hasFocus: boolean): DecorationSet {
    const decs: Range<Decoration>[] = [];
    const ranges = findLatexRanges(state.doc);
    const { main } = state.selection;

    for (const r of ranges) {
        // Selection touches or inside range AND editor is focused
        const active = hasFocus && main.from <= r.to && main.to >= r.from;

        if (active) {
            // Expanded Source
            decs.push(Decoration.mark({ class: 'cm-latex-source-active' }).range(r.from, r.to));

            if (r.tex.length > 0) {
                decs.push(Decoration.widget({
                    widget: new LaTeXSyncWidget(r.tex, r.displayMode),
                    side: 1,
                    block: r.displayMode
                }).range(r.to));
            }
        } else if (r.tex.length > 0) {
            // Compressed Preview
            decs.push(Decoration.replace({
                widget: new LaTeXWidget(r.tex, r.displayMode),
                inclusive: true
            }).range(r.from, r.to));
        }
    }
    return Decoration.set(decs.sort((a, b) => a.from - b.from), true);
}

export function latexPreview() {
    return [
        latexPlugin,
        EditorView.domEventHandlers({
            mousedown(event, view) {
                const target = event.target as HTMLElement;
                const mathEl = target.closest('.is-rendered, .cm-latex-sync');
                if (mathEl) {
                    const pos = view.posAtDOM(mathEl);
                    if (pos >= 0) {
                        const isBlock = mathEl.classList.contains('math-block') || mathEl.classList.contains('cm-latex-sync-block');
                        const offset = isBlock ? 2 : 1;

                        // Small delay to allow browser to handle the mousedown focusing the editor first
                        setTimeout(() => {
                            view.dispatch({
                                selection: { anchor: pos + offset, head: pos + offset },
                                scrollIntoView: true,
                                userEvent: 'select.math'
                            });
                        }, 10);

                        return true;
                    }
                }
                return false;
            }
        }),
        EditorView.theme({
            '@keyframes cm-latex-sync-in': {
                from: { opacity: '0', transform: 'translateY(4px)' },
                to: { opacity: '1', transform: 'translateY(0)' },
            },
        })
    ];
}
