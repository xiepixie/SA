import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, placeholder as cmPlaceholder, keymap, scrollPastEnd } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
    smartList,
    bracketPairing,
    latexPreview,
    livePreview,
    wikiLink,
    wikiLinkCompletion
} from './extensions';
import { createNoteEditorTheme } from './themes/noteTheme';
import { api } from '../../../lib/eden';
import { cn } from '../../../app/utils/cn';

interface NoteEditorCoreProps {
    value: string;
    onChange: (value: string) => void;
    noteId: string;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    onWikiLinkClick?: (type: 'q' | 'n', id: string) => void;
    onWikiLinkCreate?: (title: string) => void;
    onViewCreated?: (view: EditorView) => void;
}



export const NoteEditorCore = forwardRef<HTMLDivElement, NoteEditorCoreProps>(({
    value,
    onChange,
    noteId,
    placeholder = 'Start writing your wisdom... (Markdown & LaTeX supported, use [[ for links)',
    className,
    autoFocus = false,
    onWikiLinkClick,
    onWikiLinkCreate,
    onViewCreated,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Combine refs
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    const onChangeRef = useRef(onChange);

    // Keep ref updated to avoid stale closures in listeners
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Search function for Wiki Links
    const searchNotes = useMemo(() => async (q: string) => {
        const { data, error } = await api.api.v1.notes.search.get({
            query: { q, limit: 10 }
        });
        if (error) throw error;
        // Map to format completion expects
        return (data?.results || []).map((res: any) => ({
            id: res.id,
            title: res.title,
            type: res.type.toUpperCase() // Completion expects 'QUESTION' or 'GLOBAL'
        }));
    }, []);

    // Detect dark mode
    const isDark = typeof window !== 'undefined' && (
        document.documentElement.getAttribute('data-theme')?.includes('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    // Compartments for dynamic reconfiguration
    const themeCompartment = useMemo(() => new Compartment(), []);
    const placeholderCompartment = useMemo(() => new Compartment(), []);

    // Create extensions
    const extensions = useMemo(() => [
        history(),
        keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
        ]),
        markdown(),
        smartList(),
        bracketPairing(),
        livePreview(),
        latexPreview(),
        wikiLink(),
        wikiLinkCompletion(searchNotes),

        // Dynamic Extensions (Compartments)
        themeCompartment.of(createNoteEditorTheme('primary', isDark)),
        placeholderCompartment.of(cmPlaceholder(placeholder)),

        EditorView.lineWrapping,
        scrollPastEnd(),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
            }
        }),
    ], [searchNotes, placeholder, themeCompartment, placeholderCompartment, isDark]);

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
        onViewCreated?.(view);

        if (autoFocus) {
            view.focus();
        }

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId]); // Rebuild only when noteId changes significantly

    // Sync external value changes (carefully)
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
            effects: themeCompartment.reconfigure(createNoteEditorTheme('primary', isDark)),
        });
    }, [isDark, themeCompartment]);

    // Update placeholder when it changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        view.dispatch({
            effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder))
        });
    }, [placeholder, placeholderCompartment]);

    // Listen for wiki-link-click events from extensions
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWikiLinkClickEvent = (e: any) => {
            const { type, id } = e.detail;
            onWikiLinkClick?.(type, id);
        };

        const handleWikiLinkCreateEvent = (e: any) => {
            const { title } = e.detail;
            onWikiLinkCreate?.(title);
        };

        container.addEventListener('wiki-link-click', handleWikiLinkClickEvent as EventListener);
        container.addEventListener('wiki-link-create', handleWikiLinkCreateEvent as EventListener);
        return () => {
            container.removeEventListener('wiki-link-click', handleWikiLinkClickEvent as EventListener);
            container.removeEventListener('wiki-link-create', handleWikiLinkCreateEvent as EventListener);
        }
    }, [onWikiLinkClick, onWikiLinkCreate]);

    return (
        <div
            ref={containerRef}
            className={cn("w-full transition-all duration-300", className)}
        />
    );
});

NoteEditorCore.displayName = 'NoteEditorCore';
