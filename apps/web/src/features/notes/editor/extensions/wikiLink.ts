import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    MatchDecorator,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

// Decorator for [[...]] wiki links
const wikiLinkMatcher = new MatchDecorator({
    regexp: /\[\[([^\]]+)\]\]/g,
    decoration: (match) =>
        Decoration.mark({
            class: 'cm-wiki-link',
            attributes: {
                'data-target': match[1],
                title: `Link to: ${match[1]}`,
            },
        }),
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
    }
);

export function wikiLink() {
    return wikiLinkPlugin;
}
