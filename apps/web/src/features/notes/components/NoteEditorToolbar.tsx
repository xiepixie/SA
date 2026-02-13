import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bold,
    Italic,
    Heading1,
    Heading2,
    Heading3,
    List,
    Code,
    FileJson,
    Type,
    Link2
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

interface NoteEditorToolbarProps {
    view: EditorView | null;
    className?: string;
}

export const NoteEditorToolbar: React.FC<NoteEditorToolbarProps> = ({ view, className }) => {
    const { t } = useTranslation();

    const applyFormat = (prefix: string, suffix: string = '') => {
        if (!view) return;
        const { state } = view;
        const { from, to } = state.selection.main;

        let tx;
        if (from === to) {
            // No selection, just insert
            tx = view.state.update({
                changes: { from, insert: prefix + suffix },
                selection: { anchor: from + prefix.length }
            });
        } else {
            // Selection exists, wrap it
            const selectedText = state.doc.sliceString(from, to);
            tx = view.state.update({
                changes: { from, to, insert: prefix + selectedText + suffix },
                selection: { anchor: from + prefix.length + selectedText.length + suffix.length }
            });
        }
        view.dispatch(tx);
        view.focus();
    };

    const applyHeading = (level: number) => {
        if (!view) return;
        const prefix = '#'.repeat(level) + ' ';
        applyFormat(prefix);
    };

    return (
        <div className={cn("flex items-center gap-1 p-1 bg-base-100/50 backdrop-blur-md border border-base-content/5 rounded-xl shadow-premium-sm", className)}>
            <ToolbarButton
                icon={<Heading1 />}
                onClick={() => applyHeading(1)}
                title={t('notes.toolbar.h1')}
            />
            <ToolbarButton
                icon={<Heading2 />}
                onClick={() => applyHeading(2)}
                title={t('notes.toolbar.h2')}
            />
            <ToolbarButton
                icon={<Heading3 />}
                onClick={() => applyHeading(3)}
                title={t('notes.toolbar.h3')}
            />
            <div className="w-px h-4 bg-base-content/10 mx-1" />
            <ToolbarButton
                icon={<Bold />}
                onClick={() => applyFormat('**', '**')}
                title={t('notes.toolbar.bold')}
            />
            <ToolbarButton
                icon={<Italic />}
                onClick={() => applyFormat('_', '_')}
                title={t('notes.toolbar.italic')}
            />
            <div className="w-px h-4 bg-base-content/10 mx-1" />
            <ToolbarButton
                icon={<List />}
                onClick={() => applyFormat('- ')}
                title={t('notes.toolbar.list')}
            />
            <ToolbarButton
                icon={<Code />}
                onClick={() => applyFormat('`', '`')}
                title={t('notes.toolbar.code')}
            />
            <ToolbarButton
                icon={<FileJson />}
                onClick={() => applyFormat('```\n', '\n```')}
                title={t('notes.toolbar.code_block')}
            />
            <div className="w-px h-4 bg-base-content/10 mx-1" />
            <ToolbarButton
                icon={<Type />}
                onClick={() => applyFormat('$', '$')}
                title={t('notes.toolbar.latex')}
            />
            <ToolbarButton
                icon={<Link2 />}
                onClick={() => applyFormat('[[', ']]')}
                title={t('notes.toolbar.wiki')}
            />
        </div>
    );
};
