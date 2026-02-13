import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    MatchDecorator,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

/**
 * Wiki Link format: [[Display Title|type:id]]
 * type is 'q' for question, 'n' for note.
 */

const wikiLinkMatcher = new MatchDecorator({
    regexp: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    decoration: (match) => {
        const title = match[1];
        const target = match[2]; // type:id

        return Decoration.mark({
            class: 'cm-wiki-link',
            attributes: {
                'data-title': title,
                'data-target': target || '',
                title: target ? `Ctrl+Click to open: ${title}` : `Link: ${title} (unresolved)`,
            },
        });
    },
});

const wikiLinkPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = wikiLinkMatcher.createDeco(view);
        }

        update(update: ViewUpdate) {
            this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
        }
    },
    {
        decorations: (v) => v.decorations,
        eventHandlers: {
            mousedown: (e, view) => {
                // Check for Ctrl/Cmd + click
                if (!(e.ctrlKey || e.metaKey)) return false;

                const target = e.target as HTMLElement;
                const wikiLink = target.closest('.cm-wiki-link');
                if (!wikiLink) return false;

                const targetData = wikiLink.getAttribute('data-target');
                if (!targetData) return false;

                const [type, id] = targetData.split(':');
                if (!type || !id) return false;

                // Stop propagation and handle navigation
                e.preventDefault();
                e.stopPropagation();

                // Dispatch a custom event from the editor container 
                // so the parent component can handle it
                view.dom.dispatchEvent(new CustomEvent('wiki-link-click', {
                    detail: { type, id },
                    bubbles: true
                }));

                return true;
            }
        }
    }
);

export function wikiLink() {
    return wikiLinkPlugin;
}
