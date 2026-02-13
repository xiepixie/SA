import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, placeholder as cmPlaceholder, keymap, scrollPastEnd } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
    smartList,
    bracketPairing,
    latexPreview,
    wikiLink,
    wikiLinkCompletion
} from './extensions';
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
        latexPreview(),
        wikiLink(),
        wikiLinkCompletion(searchNotes),
        cmPlaceholder(placeholder),
        EditorView.lineWrapping,
        scrollPastEnd(),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
            }
        }),
        // Basic styling for the editor area
        EditorView.theme({
            "&": {
                height: "100%",
                fontSize: "15px",
            },
            ".cm-content": {
                fontFamily: "var(--font-editor, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
                padding: "0",
                lineHeight: "1.7",
            },
            ".cm-line": {
                padding: "0 4px",
            },
            "&.cm-focused": {
                outline: "none",
            }
        })
    ], [searchNotes, placeholder]);

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

    // Listen for wiki-link-click events from extensions
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWikiLink = (e: any) => {
            const { type, id } = e.detail;
            onWikiLinkClick?.(type, id);
        };

        container.addEventListener('wiki-link-click', handleWikiLink as EventListener);
        return () => container.removeEventListener('wiki-link-click', handleWikiLink as EventListener);
    }, [onWikiLinkClick]);

    return (
        <div
            ref={containerRef}
            className={cn("h-full w-full", className)}
        />
    );
});

NoteEditorCore.displayName = 'NoteEditorCore';
