import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bold,
    Italic,
    Strikethrough,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Code,
    FileJson,
    Type,
    Link2,
    Quote
} from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { EditorView } from '@codemirror/view';

interface ToolbarButtonProps {
    icon: React.ReactNode;
    onClick: () => void;
    title?: string;
    active?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, onClick, title, active }) => (
    <button
        onClick={onClick}
        title={title}
        className={cn(
            "p-2 rounded-lg transition-all duration-200 flex items-center justify-center",
            active
                ? "bg-primary/10 text-primary"
                : "text-base-content/40 hover:text-base-content hover:bg-base-content/5"
        )}
    >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 16 })}
    </button>
);

const Separator = () => <div className="w-px h-4 bg-base-content/10 mx-1" />;

interface NoteEditorToolbarProps {
    view: EditorView | null;
    className?: string;
}

export const NoteEditorToolbar: React.FC<NoteEditorToolbarProps> = ({ view, className }) => {
    const { t } = useTranslation();

    // ── Helper: wrap selection or insert at cursor ──
    const wrapSelection = (prefix: string, suffix: string) => {
        if (!view) return;
        const { from, to } = view.state.selection.main;

        if (from === to) {
            // No selection: insert prefix+suffix and place cursor between
            view.dispatch(view.state.update({
                changes: { from, insert: prefix + suffix },
                selection: { anchor: from + prefix.length },
            }));
        } else {
            // Wrap selected text
            const selected = view.state.doc.sliceString(from, to);
            view.dispatch(view.state.update({
                changes: { from, to, insert: prefix + selected + suffix },
                selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
            }));
        }
        view.focus();
    };

    // ── Helper: toggle or set heading level at beginning of current line ──
    const setHeading = (level: number) => {
        if (!view) return;
        const { head } = view.state.selection.main;
        const line = view.state.doc.lineAt(head);
        const lineText = line.text;
        const newPrefix = '#'.repeat(level) + ' ';

        // Check if line already has a heading prefix
        const existingMatch = lineText.match(/^(#{1,6})\s/);
        if (existingMatch) {
            const existingLevel = existingMatch[1].length;
            if (existingLevel === level) {
                // Same level: toggle off (remove heading)
                view.dispatch(view.state.update({
                    changes: { from: line.from, to: line.from + existingLevel + 1, insert: '' },
                }));
            } else {
                // Different level: replace
                view.dispatch(view.state.update({
                    changes: { from: line.from, to: line.from + existingLevel + 1, insert: newPrefix },
                }));
            }
        } else {
            // No heading: add prefix at line start
            view.dispatch(view.state.update({
                changes: { from: line.from, insert: newPrefix },
            }));
        }
        view.focus();
    };

    // ── Helper: toggle line prefix (for list items, blockquote) ──
    const toggleLinePrefix = (prefix: string) => {
        if (!view) return;
        const { head } = view.state.selection.main;
        const line = view.state.doc.lineAt(head);

        if (line.text.startsWith(prefix)) {
            // Remove prefix
            view.dispatch(view.state.update({
                changes: { from: line.from, to: line.from + prefix.length, insert: '' },
            }));
        } else {
            // Add prefix at line start
            view.dispatch(view.state.update({
                changes: { from: line.from, insert: prefix },
            }));
        }
        view.focus();
    };

    // ── Helper: insert ordered list (with auto number) ──
    const insertOrderedList = () => {
        if (!view) return;
        const { head } = view.state.selection.main;
        const line = view.state.doc.lineAt(head);

        const match = line.text.match(/^(\d+)\.\s/);
        if (match) {
            // Remove existing ordered list prefix
            view.dispatch(view.state.update({
                changes: { from: line.from, to: line.from + match[0].length, insert: '' },
            }));
        } else {
            // Find the previous line's number if it has one
            let num = 1;
            if (line.number > 1) {
                const prevLine = view.state.doc.line(line.number - 1);
                const prevMatch = prevLine.text.match(/^(\d+)\.\s/);
                if (prevMatch) num = parseInt(prevMatch[1], 10) + 1;
            }
            view.dispatch(view.state.update({
                changes: { from: line.from, insert: `${num}. ` },
            }));
        }
        view.focus();
    };

    // ── Helper: insert code block ──
    const insertCodeBlock = () => {
        if (!view) return;
        const { from, to } = view.state.selection.main;

        if (from === to) {
            const insert = '```\n\n```';
            view.dispatch(view.state.update({
                changes: { from, insert },
                selection: { anchor: from + 4 }, // cursor inside block
            }));
        } else {
            const selected = view.state.doc.sliceString(from, to);
            view.dispatch(view.state.update({
                changes: { from, to, insert: '```\n' + selected + '\n```' },
                selection: { anchor: from + 4, head: from + 4 + selected.length },
            }));
        }
        view.focus();
    };

    return (
        <div className={cn("flex items-center gap-1 p-1 bg-base-100/50 backdrop-blur-md border border-base-content/5 rounded-xl shadow-premium-sm", className)}>
            <ToolbarButton
                icon={<Heading1 />}
                onClick={() => setHeading(1)}
                title={t('notes.toolbar.h1')}
            />
            <ToolbarButton
                icon={<Heading2 />}
                onClick={() => setHeading(2)}
                title={t('notes.toolbar.h2')}
            />
            <ToolbarButton
                icon={<Heading3 />}
                onClick={() => setHeading(3)}
                title={t('notes.toolbar.h3')}
            />
            <Separator />
            <ToolbarButton
                icon={<Bold />}
                onClick={() => wrapSelection('**', '**')}
                title={t('notes.toolbar.bold')}
            />
            <ToolbarButton
                icon={<Italic />}
                onClick={() => wrapSelection('*', '*')}
                title={t('notes.toolbar.italic')}
            />
            <ToolbarButton
                icon={<Strikethrough />}
                onClick={() => wrapSelection('~~', '~~')}
                title={t('notes.toolbar.strikethrough', '删除线')}
            />
            <Separator />
            <ToolbarButton
                icon={<List />}
                onClick={() => toggleLinePrefix('- ')}
                title={t('notes.toolbar.list')}
            />
            <ToolbarButton
                icon={<ListOrdered />}
                onClick={() => insertOrderedList()}
                title={t('notes.toolbar.ordered_list', '有序列表')}
            />
            <ToolbarButton
                icon={<Quote />}
                onClick={() => toggleLinePrefix('> ')}
                title={t('notes.toolbar.blockquote', '引用')}
            />
            <Separator />
            <ToolbarButton
                icon={<Code />}
                onClick={() => wrapSelection('`', '`')}
                title={t('notes.toolbar.code')}
            />
            <ToolbarButton
                icon={<FileJson />}
                onClick={() => insertCodeBlock()}
                title={t('notes.toolbar.code_block')}
            />
            <Separator />
            <ToolbarButton
                icon={<Type />}
                onClick={() => wrapSelection('$', '$')}
                title={t('notes.toolbar.latex')}
            />
            <ToolbarButton
                icon={<Link2 />}
                onClick={() => wrapSelection('[[', ']]')}
                title={t('notes.toolbar.wiki')}
            />
        </div>
    );
};
