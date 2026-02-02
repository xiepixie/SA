import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, placeholder as cmPlaceholder, keymap, scrollPastEnd } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { smartList, bracketPairing, latexPreview, wikiLink } from './extensions';
import { createNoteEditorTheme } from './themes/noteTheme';
import { type NoteColor } from '../types/NoteTheme';

interface QuickJotEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    onSave?: () => void;
    theme?: NoteColor;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
}

export const QuickJotEditor = forwardRef<HTMLDivElement, QuickJotEditorProps>(({
    value,
    onChange,
    onBlur,
    onSave,
    theme = 'yellow',
    placeholder = 'Type notes here... (LaTeX & Markdown supported)',
    className,
    autoFocus = false,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // Combine refs
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onBlurRef = useRef(onBlur);
    const onSaveRef = useRef(onSave);

    // Compartments for dynamic reconfiguration
    const themeCompartment = useMemo(() => new Compartment(), []);
    const placeholderCompartment = useMemo(() => new Compartment(), []);

    // Keep refs updated
    useEffect(() => {
        onChangeRef.current = onChange;
        onBlurRef.current = onBlur;
        onSaveRef.current = onSave;
    }, [onChange, onBlur, onSave]);

    // Detect dark mode - check on every render for simplicity
    // Theme reconfigure effect will apply the correct theme
    const isDark = typeof window !== 'undefined' && (
        document.documentElement.getAttribute('data-theme')?.includes('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );



    // Create extensions
    const extensions = useMemo(() => [
        // Basic editing
        history(),
        keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            // Escape to save
            {
                key: 'Escape',
                run: () => {
                    onSaveRef.current?.();
                    return true;
                },
            },
            // Ctrl/Cmd+Enter to save
            {
                key: 'Mod-Enter',
                run: () => {
                    onSaveRef.current?.();
                    return true;
                },
            },
        ]),

        // Markdown language support
        markdown(),

        // Custom extensions
        smartList(),
        bracketPairing(),
        latexPreview(),
        wikiLink(),

        // Dynamic Extensions (Compartments)
        themeCompartment.of(createNoteEditorTheme(theme, isDark)),
        placeholderCompartment.of(cmPlaceholder(placeholder)),

        // Update listener
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const newValue = update.state.doc.toString();
                onChangeRef.current(newValue);
            }
        }),

        // ✅ P0 FIX: 移除 blur 处理器 - 它导致了编辑模式秒关的问题
        // 改用 Escape/Ctrl+Enter 保存，或者由父组件通过点击外部来关闭编辑模式

        // Line wrapping & Scroll past end
        EditorView.lineWrapping,
        scrollPastEnd(),
    ], [themeCompartment, placeholderCompartment]); // Initial setup only, actually depend on compartments which are stable

    // Initialize editor
    useEffect(() => {
        if (!containerRef.current) return;

        const state = EditorState.create({
            doc: value,
            extensions,
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        if (autoFocus) {
            view.focus();
            // Move cursor to end
            view.dispatch({
                selection: { anchor: view.state.doc.length },
            });
        }

        // Expose focus method via custom property on the container for legacy compatibility
        // QuickJot.tsx calls (containerRef.current as any).editorFocus = focus;
        (containerRef.current as any).editorFocus = () => view.focus();

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Sync external value changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        const currentValue = view.state.doc.toString();
        if (value !== currentValue) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: currentValue.length,
                    insert: value,
                },
            });
        }
    }, [value]);

    // Update theme when it changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        view.dispatch({
            effects: themeCompartment.reconfigure(createNoteEditorTheme(theme, isDark)),
        });
    }, [theme, isDark, themeCompartment]);

    // Update placeholder when it changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        view.dispatch({
            effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder))
        });
    }, [placeholder, placeholderCompartment]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ minHeight: '120px', maxHeight: '400px' }}
        />
    );
});

export default QuickJotEditor;
