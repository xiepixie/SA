import {
    autocompletion,
    CompletionContext,
} from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

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
                        type: 'text',
                        apply: '',
                        boost: -1,
                    },
                ],
                filter: false,
            };
        }

        try {
            const notes = await debouncedSearch(searchTerm);

            const options: Completion[] = notes.map((note) => ({
                label: note.title || `Note ${note.id.slice(0, 8)}`,
                type: 'text',
                apply: `${note.title || note.id}]]`,
                detail: note.type === 'QUESTION' ? '📝 Question' : '📄 Global',
                info: `ID: ${note.id}`,
            }));

            // Add option to create new if no matches
            if (options.length === 0) {
                options.push({
                    label: searchTerm,
                    type: 'text',
                    apply: `${searchTerm}]]`,
                    detail: '✨ Create new link',
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
