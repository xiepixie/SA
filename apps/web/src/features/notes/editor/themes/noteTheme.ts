import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { type NoteColor } from '../../types/NoteTheme';

// Color definitions matching NoteTheme.ts (extracted hex values for CM6)
// 🎨 Refined Color Palette System (Light & Dark)
const COLOR_PALETTE: Record<NoteColor, {
    bg: string;
    surface: string;
    border: string;
    text: string;
    heading: string;
    muted: string;
    accent: string;
    selection: string;
}> = {
    primary: {
        bg: 'oklch(var(--b1))',
        surface: 'oklch(var(--p) / 0.04)',
        border: 'oklch(var(--p) / 0.15)',
        text: 'oklch(var(--bc))',
        heading: 'oklch(var(--p))',
        muted: 'oklch(var(--bc) / 0.6)',
        accent: 'oklch(var(--p))',
        selection: 'oklch(var(--p) / 0.15)',
    },
    yellow: {
        bg: '#fffdf5', surface: '#fff9db', border: '#fcc41966',
        text: '#453401', heading: '#5c4402', muted: '#856404cc',
        accent: '#fcc419', selection: 'rgba(252, 196, 25, 0.2)',
    },
    blue: {
        bg: '#f8fbff', surface: '#e7f5ff', border: '#339af066',
        text: '#002b5e', heading: '#004a8f', muted: '#1864abcc',
        accent: '#339af0', selection: 'rgba(51, 154, 240, 0.2)',
    },
    green: {
        bg: '#f8fff9', surface: '#ebfbee', border: '#40c05766',
        text: '#083a15', heading: '#0d5a1f', muted: '#2b8a3ecc',
        accent: '#40c057', selection: 'rgba(64, 192, 87, 0.2)',
    },
    plum: {
        bg: '#fffafd', surface: '#f8f0fc', border: '#ae3ec966',
        text: '#420b4f', heading: '#5f1970', muted: '#862e9ccc',
        accent: '#ae3ec9', selection: 'rgba(174, 62, 201, 0.2)',
    },
    graphite: {
        bg: '#f8f9fa', surface: '#f1f3f5', border: '#adb5bd66',
        text: '#1a1d21', heading: '#212529', muted: '#495057cc',
        accent: '#adb5bd', selection: 'rgba(173, 181, 189, 0.2)',
    },
};

const DARK_PALETTE: Record<NoteColor, {
    bg: string;
    surface: string;
    border: string;
    text: string;
    heading: string;
    muted: string;
    accent: string;
    selection: string;
}> = {
    primary: {
        bg: 'oklch(var(--b1))',
        surface: 'oklch(var(--p) / 0.1)',
        border: 'oklch(var(--p) / 0.3)',
        text: 'oklch(var(--bc))',
        heading: 'oklch(var(--p))',
        muted: 'oklch(var(--bc) / 0.5)',
        accent: 'oklch(var(--p))',
        selection: 'oklch(var(--p) / 0.25)',
    },
    yellow: {
        bg: '#1c1b14', surface: '#2b291d', border: '#fcc41944',
        text: '#fff5d6', heading: '#ffde7a', muted: '#f3d371aa',
        accent: '#fcc419', selection: 'rgba(252, 196, 25, 0.25)',
    },
    blue: {
        bg: '#0d1117', surface: '#161b22', border: '#339af044',
        text: '#e6f4ff', heading: '#a5d8ff', muted: '#74c0fcaa',
        accent: '#339af0', selection: 'rgba(51, 154, 240, 0.25)',
    },
    green: {
        bg: '#0f1410', surface: '#1b231c', border: '#40c05744',
        text: '#e6ffec', heading: '#b2f2bb', muted: '#8ce99aaa',
        accent: '#40c057', selection: 'rgba(64, 192, 87, 0.25)',
    },
    plum: {
        bg: '#141016', surface: '#231b26', border: '#ae3ec944',
        text: '#fbe6ff', heading: '#eebefa', muted: '#da77f2aa',
        accent: '#ae3ec9', selection: 'rgba(174, 62, 201, 0.25)',
    },
    graphite: {
        bg: '#1a1b1e', surface: '#25262b', border: '#adb5bd44',
        text: '#f1f3f5', heading: '#ced4da', muted: '#adb5bdaa',
        accent: '#adb5bd', selection: 'rgba(173, 181, 189, 0.25)',
    },
};

export function createNoteEditorTheme(color: NoteColor, isDark: boolean): Extension {
    const palette = isDark ? DARK_PALETTE[color] : COLOR_PALETTE[color];

    const baseTheme = EditorView.theme({
        '&': {
            backgroundColor: palette.bg,
            color: palette.text,
            fontSize: '16px',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            height: 'auto',
            minHeight: '200px',
        },
        '.cm-scroller': { overflow: 'visible' },
        '.cm-content': {
            caretColor: palette.accent,
            padding: '40px 24px 80px 24px', // Reduced horizontal padding for tighter focus
            lineHeight: '1.7',
            cursor: 'text',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: palette.accent,
            borderLeftWidth: '2px',
            boxShadow: `0 0 8px ${palette.accent}44`,
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: palette.selection,
        },
        '.cm-gutters': { display: 'none' },

        // ── Active LaTeX Sync Styling (UX Redesign) ──
        '.cm-latex-source-active': {
            backgroundColor: `color-mix(in oklch, ${palette.accent} 12%, transparent)`,
            borderBottom: `2px dashed ${palette.accent}`,
            color: palette.accent,
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: '600',
            borderRadius: '4px',
            padding: '2px 4px',
        },
        '.cm-latex-sync': {
            zIndex: 10,
            pointerEvents: 'none',
            animation: 'cm-fade-in 400ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            // Increase base math size slightly for better legibility
            '& .katex': { fontSize: '1.25em' },
        },
        '.cm-latex-sync-inline': {
            display: 'inline-flex',
            padding: '2px 8px',
            borderRadius: '8px',
            backgroundColor: palette.surface,
            border: `1px solid ${palette.border}`,
            boxShadow: `0 4px 12px -4px color-mix(in oklch, ${palette.text} 15%, transparent)`,
            verticalAlign: 'middle',
            marginLeft: '8px',
            zIndex: 50
        },
        '.cm-latex-sync-block': {
            display: 'flex',
            width: '100%',
            justifyContent: 'center',
            padding: '40px 0',
            marginTop: '16px',
            marginBottom: '16px',
            borderRadius: '16px',
            backgroundColor: palette.surface,
            border: `1px solid color-mix(in oklch, ${palette.accent} 30%, transparent)`,
            boxShadow: `0 24px 48px -12px color-mix(in oklch, ${palette.text} 8%, transparent)`,
            '& .katex': { fontSize: '1.4em' },
        },

        // ── Live Preview Typography ──
        '.cm-lp-h1': { fontSize: '2.2em', fontWeight: '850', color: palette.heading, letterSpacing: '-0.03em', paddingBottom: '0.2em', paddingTop: '0.8em' },
        '.cm-lp-h2': { fontSize: '1.8em', fontWeight: '750', color: palette.heading, letterSpacing: '-0.02em', paddingBottom: '0.2em', paddingTop: '0.6em' },
        '.cm-lp-h3': { fontSize: '1.45em', fontWeight: '700', color: palette.heading, letterSpacing: '-0.01em', paddingTop: '0.4em' },
        '.cm-lp-h4': { fontSize: '1.25em', fontWeight: '650', color: palette.text, paddingTop: '0.2em' },
        '.cm-lp-bold': { fontWeight: '750', color: palette.heading },
        '.cm-lp-italic': { fontStyle: 'italic', opacity: 0.95 },
        '.cm-lp-strike': { textDecoration: 'line-through', opacity: 0.5 },
        '.cm-lp-code': {
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.9em',
            padding: '2px 6px',
            borderRadius: '6px',
            backgroundColor: palette.surface,
            color: palette.accent,
            border: `1px solid ${palette.border}`,
        },
        // Wiki links
        '.cm-wiki-link': {
            color: palette.accent,
            fontWeight: '650',
            textDecoration: 'underline',
            textDecorationStyle: 'dashed',
            textUnderlineOffset: '4px',
            textDecorationThickness: '1px',
            backgroundColor: `color-mix(in oklch, ${palette.accent} 8%, transparent)`,
            padding: '2px 6px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            '&:hover': {
                backgroundColor: `color-mix(in oklch, ${palette.accent} 15%, transparent)`,
                textDecorationStyle: 'solid',
                boxShadow: `0 2px 8px -2px color-mix(in oklch, ${palette.accent} 30%, transparent)`
            }
        },

        '.cm-wiki-link-unresolved': {
            opacity: 0.6,
            textDecorationStyle: 'dotted',
            backgroundColor: `color-mix(in oklch, ${palette.text} 5%, transparent)`,
            color: palette.text,
            '&:hover': {
                backgroundColor: `color-mix(in oklch, ${palette.accent} 10%, transparent)`,
                color: palette.accent,
                opacity: 1,
            }
        },

        // Standard CodeMirror elements
        '.cm-tooltip': {
            backgroundColor: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: '12px',
            backdropFilter: 'blur(20px)',
            boxShadow: `0 12px 32px -8px color-mix(in oklch, ${palette.text} 15%, transparent)`,
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            overflow: 'hidden',
        },

        // ── Autocomplete / WikiLink UI ──
        '.cm-tooltip-autocomplete': {
            padding: '6px',
        },
        '.cm-tooltip-autocomplete > ul': {
            fontFamily: 'inherit',
            maxHeight: '400px',
        },
        '.cm-tooltip-autocomplete > ul > li': {
            padding: '8px 12px',
            borderRadius: '8px',
            marginBottom: '2px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.85em',
            transition: 'background 0.1s ease',
            lineHeight: '1.4',
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
            backgroundColor: palette.selection,
            color: palette.text,
        },
        '.cm-completionIcon': {
            marginRight: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            backgroundColor: `color-mix(in oklch, ${palette.text} 5%, transparent)`,
            fontSize: '1em',
            flexShrink: 0,
        },
        '.cm-completionIcon-wiki-question': { backgroundColor: `color-mix(in oklch, var(--color-warning) 15%, transparent)` },
        '.cm-completionIcon-wiki-question::after': { content: '"📝"' },
        '.cm-completionIcon-wiki-global': { backgroundColor: `color-mix(in oklch, var(--color-info) 15%, transparent)` },
        '.cm-completionIcon-wiki-global::after': { content: '"📄"' },
        '.cm-completionIcon-wiki-new': { backgroundColor: `color-mix(in oklch, var(--color-success) 15%, transparent)` },
        '.cm-completionIcon-wiki-new::after': { content: '"✨"' },
        '.cm-completionIcon-wiki-search::after': { content: '"🔍"' },

        '.cm-completionLabel': {
            fontWeight: '700',
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        },
        '.cm-completionDetail': {
            color: palette.muted,
            marginLeft: 'auto',
            paddingLeft: '12px',
            fontSize: '0.8em',
            fontStyle: 'normal',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
        },
        '.cm-completionMatchedText': {
            color: palette.accent,
            textDecoration: 'none',
        },

        '@keyframes cm-fade-in': {
            from: { opacity: '0', transform: 'scale(0.97)' },
            to: { opacity: '1', transform: 'scale(1)' },
        }
    }, { dark: isDark });

    const highlightStyle = HighlightStyle.define([
        { tag: tags.heading1, fontWeight: 'bold' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: tags.strong, fontWeight: 'bold' },
        { tag: tags.link, color: palette.accent, textDecoration: 'underline' },
        { tag: tags.processingInstruction, color: palette.accent },
        { tag: tags.comment, color: palette.muted, fontStyle: 'italic' },
    ]);

    return [baseTheme, syntaxHighlighting(highlightStyle)];
}
