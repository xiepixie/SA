import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    WidgetType,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, Range } from '@codemirror/state';
import katex from 'katex';
import { sanitizeLatex } from '@v2/markdown-parser';

// Find LaTeX delimiters in the document
function findLatexRanges(state: EditorState, from = 0, to = state.doc.length): { from: number; to: number; tex: string; displayMode: boolean }[] {
    const doc = state.sliceDoc(from, to);
    const ranges: { from: number; to: number; tex: string; displayMode: boolean }[] = [];

    // Display math: $$ ... $$ (Mult-line supported via [\s\S])
    const displayRegex = /\$\$([\s\S]+?)\$\$/g;
    let match;
    while ((match = displayRegex.exec(doc)) !== null) {
        ranges.push({
            from: from + match.index,
            to: from + match.index + match[0].length,
            tex: match[1].trim(),
            displayMode: true,
        });
    }

    // Inline math: $ ... $ (not preceded or followed by $, and not escaped \$)
    // Matches $...$ where the content doesn't contain unescaped $ or newline (optional)
    // Here we allow any content except unescaped $ to stay robust
    const inlineRegex = /(?<!\\)\$(?!\$)([\s\S]+?)(?<!\\)\$(?!\$)/g;

    while ((match = inlineRegex.exec(doc)) !== null) {
        const start = from + match.index;
        const end = start + match[0].length;

        // Skip if it contains a newline (canonical restriction for inline math)
        if (match[1].includes('\n')) continue;

        // More robust interval intersection check for overlaps
        const overlaps = ranges.some(r => !(end <= r.from || start >= r.to));

        if (!overlaps) {
            ranges.push({
                from: start,
                to: end,
                tex: match[1].trim(),
                displayMode: false,
            });
        }
    }

    return ranges.sort((a, b) => a.from - b.from);
}

// NOTE: getCursorLatexRange removed - replaced by binarySearchRange for O(log n) performance


// Widget to render LaTeX preview
class LaTeXPreviewWidget extends WidgetType {
    tex: string;
    displayMode: boolean;

    constructor(tex: string, displayMode: boolean) {
        super();
        this.tex = tex;
        this.displayMode = displayMode;
    }

    eq(other: LaTeXPreviewWidget) {
        return other.tex === this.tex && other.displayMode === this.displayMode;
    }

    toDOM() {
        const container = document.createElement('div');
        container.className = 'cm-latex-preview';

        try {
            // Apply sanitization before rendering
            const safeTex = sanitizeLatex(this.tex);
            katex.render(safeTex, container, {
                displayMode: this.displayMode,
                throwOnError: false,
                errorColor: '#cc0000',
                trust: false,
                strict: false,
            });
        } catch (e) {
            container.textContent = `LaTeX Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
            container.style.color = '#cc0000';
        }

        return container;
    }

    ignoreEvent() {
        return true;
    }
}

// ✅ P0 优化：使用二分搜索快速查找光标所在的 LaTeX 范围
function binarySearchRange(
    ranges: { from: number; to: number; tex: string; displayMode: boolean }[],
    pos: number
): { from: number; to: number; tex: string; displayMode: boolean } | null {
    let low = 0;
    let high = ranges.length - 1;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        const range = ranges[mid];

        if (pos < range.from) {
            high = mid - 1;
        } else if (pos > range.to) {
            low = mid + 1;
        } else {
            // pos is within [range.from, range.to]
            const delimLen = range.displayMode ? 2 : 1;
            // Check if cursor is inside content (not on delimiters)
            if (pos >= range.from + delimLen && pos <= range.to - delimLen) {
                return range;
            }
            return null;
        }
    }
    return null;
}

// ViewPlugin that creates tooltip decorations when cursor is in LaTeX
const latexPreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        // ✅ P0: 文档版本追踪 - 只在文档变化时重新扫描
        private docVersion: number = -1;
        private cachedRanges: { from: number; to: number; tex: string; displayMode: boolean }[] = [];

        // ✅ P1: 上次光标位置和装饰缓存 - 避免不必要的重建
        private lastCursorPos: number = -1;
        private lastActiveRange: { from: number; to: number } | null = null;

        constructor(view: EditorView) {
            this.updateCache(view);
            this.decorations = this.buildDecorations(view);
        }

        // ✅ P0: 分离缓存更新逻辑
        private updateCache(view: EditorView): void {
            const currentVersion = view.state.doc.length; // 简单版本标识
            if (currentVersion !== this.docVersion) {
                this.docVersion = currentVersion;
                // 全文档扫描，但只在文档变化时执行
                this.cachedRanges = findLatexRanges(view.state);
            }
        }

        update(update: ViewUpdate) {
            // ✅ P0: 文档变化时更新缓存
            if (update.docChanged) {
                this.updateCache(update.view);
                this.lastCursorPos = -1; // 强制重建
                this.lastActiveRange = null;
            }

            // ✅ P1: 智能判断是否需要重建装饰
            const needsRebuild = this.shouldRebuildDecorations(update);
            if (needsRebuild) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        // ✅ P1: 智能重建判断 - 避免频繁更新
        private shouldRebuildDecorations(update: ViewUpdate): boolean {
            if (update.docChanged) return true;

            const { main } = update.state.selection;
            const cursorPos = main.head;

            // 光标位置没变，不需要重建
            if (cursorPos === this.lastCursorPos) return false;

            // 检查光标是否还在同一个 LaTeX 范围内
            if (this.lastActiveRange) {
                const { from, to } = this.lastActiveRange;
                if (cursorPos >= from && cursorPos <= to) {
                    // 光标仍在同一范围内，只更新位置记录
                    this.lastCursorPos = cursorPos;
                    return false;
                }
            }

            // 光标移动到了新位置，需要检查
            this.lastCursorPos = cursorPos;
            return true;
        }

        buildDecorations(view: EditorView): DecorationSet {
            const decorations: Range<Decoration>[] = [];
            const { main } = view.state.selection;

            // 只在光标没有选区时显示预览
            if (!main.empty) {
                this.lastActiveRange = null;
                return Decoration.set(decorations);
            }

            // ✅ P0: 使用二分搜索快速查找
            const latexRange = binarySearchRange(this.cachedRanges, main.head);

            if (latexRange && latexRange.tex.length > 0) {
                // 更新活动范围缓存
                this.lastActiveRange = { from: latexRange.from, to: latexRange.to };

                // Create widget decoration below the LaTeX expression
                const widget = Decoration.widget({
                    widget: new LaTeXPreviewWidget(latexRange.tex, latexRange.displayMode),
                    side: 1, // After the position
                    block: true,
                });

                decorations.push(widget.range(latexRange.to));
            } else {
                this.lastActiveRange = null;
            }

            return Decoration.set(decorations);
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export function latexPreview() {
    return latexPreviewPlugin;
}
