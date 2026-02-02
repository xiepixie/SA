import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { type NoteColor } from '../../types/NoteTheme';

// Color definitions matching NoteTheme.ts (extracted hex values for CM6)
const COLOR_PALETTE: Record<NoteColor, { bg: string; text: string; muted: string; accent: string; selection: string }> = {
    primary: {
        bg: 'oklch(var(--p) / 0.1)',
        text: 'oklch(var(--p))',
        muted: 'oklch(var(--p) / 0.6)',
        accent: 'oklch(var(--p) / 0.2)',
        selection: 'oklch(var(--p) / 0.15)',
    },
    yellow: {
        bg: '#fff9db',
        text: '#5c4402',
        muted: '#856404',
        accent: '#fcc419',
        selection: 'rgba(252, 196, 25, 0.2)',
    },
    blue: {
        bg: '#e7f5ff',
        text: '#004a8f',
        muted: '#1864ab',
        accent: '#339af0',
        selection: 'rgba(51, 154, 240, 0.2)',
    },
    green: {
        bg: '#ebfbee',
        text: '#0d5a1f',
        muted: '#2b8a3e',
        accent: '#40c057',
        selection: 'rgba(64, 192, 87, 0.2)',
    },
    plum: {
        bg: '#f8f0fc',
        text: '#5f1970',
        muted: '#862e9c',
        accent: '#ae3ec9',
        selection: 'rgba(174, 62, 201, 0.2)',
    },
    graphite: {
        bg: '#f1f3f5',
        text: '#212529',
        muted: '#495057',
        accent: '#adb5bd',
        selection: 'rgba(173, 181, 189, 0.2)',
    },
};

const DARK_PALETTE: Record<NoteColor, { bg: string; text: string; muted: string; accent: string; selection: string }> = {
    primary: {
        bg: 'oklch(var(--p) / 0.2)',
        text: 'oklch(var(--pc))',
        muted: 'oklch(var(--pc) / 0.6)',
        accent: 'oklch(var(--p) / 0.3)',
        selection: 'oklch(var(--p) / 0.25)',
    },
    yellow: {
        bg: '#3d3a2b',
        text: '#ffde7a',
        muted: '#f3d371',
        accent: '#fcc419',
        selection: 'rgba(252, 196, 25, 0.25)',
    },
    blue: {
        bg: '#1a2b3b',
        text: '#a5d8ff',
        muted: '#74c0fc',
        accent: '#339af0',
        selection: 'rgba(51, 154, 240, 0.25)',
    },
    green: {
        bg: '#1b2b1e',
        text: '#b2f2bb',
        muted: '#8ce99a',
        accent: '#40c057',
        selection: 'rgba(64, 192, 87, 0.25)',
    },
    plum: {
        bg: '#2b1b2d',
        text: '#eebefa',
        muted: '#da77f2',
        accent: '#ae3ec9',
        selection: 'rgba(174, 62, 201, 0.25)',
    },
    graphite: {
        bg: '#25262b',
        text: '#f8f9fa',
        muted: '#ced4da',
        accent: '#adb5bd',
        selection: 'rgba(173, 181, 189, 0.25)',
    },
};

export function createNoteEditorTheme(color: NoteColor, isDark: boolean): Extension {
    const palette = isDark ? DARK_PALETTE[color] : COLOR_PALETTE[color];

    const baseTheme = EditorView.theme({
        '&': {
            backgroundColor: 'transparent',
            color: palette.text,
            fontSize: '15px', // Slightly larger font for readability
            fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
            // ✅ P0 FIX: 移除固定 height: 100%，让编辑器自适应内容高度
            // 父容器使用 flex 布局来控制整体高度
            minHeight: '120px',
            maxHeight: '100%',
        },
        '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'inherit',
        },
        '.cm-content': {
            caretColor: palette.accent,
            padding: '12px 16px', // Compact padding for better space utilization
            lineHeight: '1.6',
            maxWidth: '100%',
            userSelect: 'text', // Force selection enabled (fix for shortcuts)
            cursor: 'text',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: palette.accent,
            borderLeftWidth: '2.5px', // Thicker cursor for high visibility
            // ✅ P0: 增强光标可见性 - 发光效果
            boxShadow: `0 0 6px 1px ${palette.accent}, 0 0 12px 2px ${palette.accent}40`,
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: palette.selection,
        },
        '.cm-activeLine': {
            backgroundColor: 'transparent', // Minimalist: no active line bg, or very subtle
        },
        '.cm-gutters': {
            display: 'none',
        },
        '.cm-placeholder': {
            color: palette.muted,
            fontStyle: 'normal',
            opacity: 0.7,
        },
        // LaTeX preview tooltip styles
        '.cm-latex-preview': {
            backgroundColor: isDark ? '#2d2d2d' : '#ffffff',
            border: `1px solid ${palette.accent}`,
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            maxWidth: '400px',
            overflow: 'auto',
            zIndex: 100, // Ensure tooltip is above other content
        },
        '.cm-latex-preview .katex': {
            fontSize: '1.1em',
        },
        // Wiki link styles
        '.cm-wiki-link': {
            color: palette.accent,
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            cursor: 'pointer',
        },
        // Autocomplete panel
        '.cm-tooltip-autocomplete': {
            backgroundColor: isDark ? '#2d2d2d' : '#ffffff',
            border: `1px solid ${palette.muted}`,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        },
        '.cm-tooltip-autocomplete ul li': {
            padding: '6px 12px',
        },
        '.cm-tooltip-autocomplete ul li[aria-selected]': {
            backgroundColor: palette.selection,
        },
    }, { dark: isDark });

    const highlightStyle = HighlightStyle.define([
        { tag: tags.heading1, fontWeight: 'bold', fontSize: '1.4em' },
        { tag: tags.heading2, fontWeight: 'bold', fontSize: '1.2em' },
        { tag: tags.heading3, fontWeight: 'bold', fontSize: '1.1em' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: tags.strong, fontWeight: 'bold' },
        { tag: tags.strikethrough, textDecoration: 'line-through' },
        { tag: tags.link, color: palette.accent, textDecoration: 'underline' },
        { tag: tags.url, color: palette.muted },
        { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', backgroundColor: palette.selection },
        { tag: tags.processingInstruction, color: palette.accent }, // LaTeX delimiters
    ]);

    return [baseTheme, syntaxHighlighting(highlightStyle)];
}
