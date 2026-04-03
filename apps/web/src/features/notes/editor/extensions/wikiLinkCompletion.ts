import {
    autocompletion,
    CompletionContext,
} from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface WikiLinkSearchFn {
    (query: string): Promise<Array<{ id: string; title: string; type: string }>>;
}

// Debounce helper
function debounce<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    delay: number
): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastPromise: Promise<any> | null = null;

    return ((...args: any[]) => {
        if (timeoutId) clearTimeout(timeoutId);

        return new Promise((resolve) => {
            timeoutId = setTimeout(async () => {
                lastPromise = fn(...args);
                resolve(await lastPromise);
            }, delay);
        });
    }) as T;
}

/**
 * Create a wiki link completion source
 * @param searchNotes - Function to search notes by query
 */
export function createWikiLinkCompletionSource(searchNotes: WikiLinkSearchFn) {
    const debouncedSearch = debounce(searchNotes, 200);

    return async function wikiLinkCompletions(
        context: CompletionContext
    ): Promise<CompletionResult | null> {
        // Match [[ followed by any characters except ]
        const before = context.matchBefore(/\[\[[^\]]*$/);
        if (!before) return null;

        // Extract search term (remove [[)
        const searchTerm = before.text.slice(2);

        // If empty, show recent notes or placeholder
        if (searchTerm.length === 0) {
            return {
                from: before.from + 2,
                options: [
                    {
                        label: 'Type to search notes...',
                        type: 'wiki-search',
                        apply: '',
                        boost: -1,
                    },
                ],
                filter: false,
            };
        }

        try {
            const notes = await debouncedSearch(searchTerm);

            const options: Completion[] = notes.map((note) => {
                const typePrefix = note.type === 'QUESTION' ? 'q' : 'n';
                const displayTitle = note.title || `Note ${note.id.slice(0, 8)}`;
                // Resolved format: Title|type:id]]
                const insertText = `${displayTitle}|${typePrefix}:${note.id}]]`;

                return {
                    label: displayTitle,
                    type: note.type === 'QUESTION' ? 'wiki-question' : 'wiki-global',
                    detail: note.type === 'QUESTION' ? 'Question' : 'Global Note',
                    info: `ID: ${note.id}`,
                    // Custom apply to consume auto-paired ]] if present
                    apply: (view: EditorView, _completion: Completion, applyFrom: number, applyTo: number) => {
                        const afterCursor = view.state.doc.sliceString(applyTo, applyTo + 2);
                        const consumeEnd = afterCursor === ']]' ? applyTo + 2 : applyTo;
                        view.dispatch(view.state.update({
                            changes: { from: applyFrom, to: consumeEnd, insert: insertText },
                            selection: { anchor: applyFrom + insertText.length },
                        }));
                    },
                };
            });

            // Add option to create new if no matches
            if (options.length === 0) {
                const insertText = `${searchTerm}]]`;
                options.push({
                    label: searchTerm,
                    type: 'wiki-new',
                    detail: 'Create new link',
                    apply: (view: EditorView, _completion: Completion, applyFrom: number, applyTo: number) => {
                        const afterCursor = view.state.doc.sliceString(applyTo, applyTo + 2);
                        const consumeEnd = afterCursor === ']]' ? applyTo + 2 : applyTo;
                        view.dispatch(view.state.update({
                            changes: { from: applyFrom, to: consumeEnd, insert: insertText },
                            selection: { anchor: applyFrom + insertText.length },
                        }));
                    },
                });
            }

            return {
                from: before.from + 2,
                options,
                filter: false, // We already filtered server-side
            };
        } catch (error) {
            console.error('Wiki link search failed:', error);
            return null;
        }
    };
}

/**
 * Wiki link autocompletion extension
 * @param searchNotes - Function to search notes
 */
export function wikiLinkCompletion(searchNotes: WikiLinkSearchFn): Extension {
    return autocompletion({
        override: [createWikiLinkCompletionSource(searchNotes)],
        activateOnTyping: true,
        defaultKeymap: true,
        maxRenderedOptions: 10,
        icons: false,
    });
}
