import React, { useState, useDeferredValue, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NotesSidebar } from '../features/notes/components/NotesSidebar.tsx';
import { NoteEditorCore } from '../features/notes/editor/NoteEditorCore.tsx';
import { useNoteEditor } from '../features/notes/hooks/useNoteEditor.ts';
import { useTranslation } from 'react-i18next';
import { Columns, Layout, Share2, MoreVertical, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '../app/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../components/LatexRenderer';
import { BacklinksList } from '../features/notes/components/BacklinksList.tsx';
import { NoteEditorToolbar } from '../features/notes/components/NoteEditorToolbar.tsx';
import { EditorView } from '@codemirror/view';
import { useCreateNote } from '../queries/notes';

export const NotebookPage: React.FC = () => {
    const { t } = useTranslation(['notes', 'common']);
    const [searchParams, setSearchParams] = useSearchParams();
    const noteId = searchParams.get('noteId');
    const [showPreview, setShowPreview] = useState(true);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [editorView, setEditorView] = useState<EditorView | null>(null);

    const {
        title,
        content,
        isDirty,
        isSaving,
        lastSavedAt,
        saveError,
        isLoading,
        setContent,
        setTitle,
        forceSave
    } = useNoteEditor(noteId);

    const deferredContent = useDeferredValue(content);

    const createNote = useCreateNote();

    const handleNewNote = async () => {
        try {
            const newNote: any = await createNote.mutateAsync({
                type: 'GLOBAL',
                title: t('notes.editor.untitled'),
                content: { markdown: '' },
                plainText: ''
            });
            if (newNote?.id) handleSelectNote(newNote.id);
        } catch (err) {
            console.error('Failed to create note:', err);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 's') {
                    e.preventDefault();
                    forceSave();
                } else if (e.key === 'n') {
                    e.preventDefault();
                    handleNewNote();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [forceSave, handleNewNote]);

    const handleSelectNote = (id: string) => {
        setSearchParams({ noteId: id });
    };

    const handleWikiLinkClick = (type: 'q' | 'n', id: string) => {
        if (type === 'n') {
            handleSelectNote(id);
        } else if (type === 'q') {
            // Navigate to question detail
            window.open(`/questions/${id}`, '_blank');
        }
    };

    return (
        <div className="flex h-[100vh] w-full bg-base-100 overflow-hidden">
            {/* Sidebar Panel */}
            <motion.div
                animate={{ width: sidebarCollapsed ? 0 : 280 }}
                className={cn(
                    "h-full border-r border-base-content/5 bg-base-100/50 backdrop-blur-xl relative z-20 flex-shrink-0",
                    sidebarCollapsed && "overflow-hidden border-none"
                )}
            >
                <div className="w-[280px] h-full">
                    <NotesSidebar
                        selectedNoteId={noteId}
                        onSelectNote={handleSelectNote}
                    />
                </div>
            </motion.div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-base-100 relative">
                {/* Collapse/Expand Sidebar Trigger (Floating) */}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-12 bg-base-100 border border-base-content/5 rounded-full shadow-lg z-30 flex items-center justify-center text-base-content/40 hover:text-primary transition-colors"
                >
                    {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Toolbar / Header */}
                <div className="h-14 border-b border-base-content/5 flex items-center justify-between px-6 shrink-0 bg-base-100/30 backdrop-blur-md">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t('notes.editor.untitled', 'Untitled Note')}
                            className="bg-transparent border-none text-lg font-bold text-base-content focus:outline-none placeholder:opacity-30 flex-1 truncate"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Word Count */}
                        <div className="hidden md:flex items-center px-2 py-1 rounded bg-base-content/5 text-[9px] font-black uppercase tracking-widest opacity-40">
                            {content.length} {t('notes.quick_jot.chars')}
                        </div>

                        {/* Save Status */}
                        <div className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded-full bg-base-content/[0.03] border border-base-content/5">
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t('notes.editor.saving')}</span>
                                </div>
                            ) : isDirty ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-warning" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t('notes.editor.unsaved')}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-success" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                                        {lastSavedAt ? t('notes.editor.saved_at', { time: lastSavedAt }) : t('common:common.status.ready')}
                                    </span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className={cn(
                                "btn btn-ghost btn-sm px-3",
                                showPreview && "text-primary bg-primary/10"
                            )}
                            title={t('notes.tooltips.toggle_preview')}
                        >
                            <Columns size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm px-3" title={t('common:common.actions.share', 'Share')}>
                            <Share2 size={16} />
                        </button>
                        <button className="btn btn-ghost btn-sm px-1" title={t('common:common.actions.more', 'More')}>
                            <MoreVertical size={16} />
                        </button>
                    </div>
                </div>

                {/* Editor Toolbar (Floating) */}
                <AnimatePresence>
                    {noteId && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-16 left-1/2 -translate-x-1/2 z-30"
                        >
                            <NoteEditorToolbar view={editorView} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Editor Container */}
                <div className="flex-1 flex overflow-hidden">
                    <div className={cn(
                        "flex-1 flex flex-col overflow-hidden",
                        showPreview ? "max-w-[calc(100%-340px)]" : "max-w-full"
                    )}>
                        {noteId ? (
                            <div className="flex-1 overflow-y-auto px-8 py-10 custom-scrollbar">
                                <NoteEditorCore
                                    value={content}
                                    onChange={setContent}
                                    noteId={noteId}
                                    onWikiLinkClick={handleWikiLinkClick}
                                    onViewCreated={setEditorView}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-30 select-none">
                                <Layout size={64} className="mb-6 opacity-20" />
                                <h3 className="text-xl font-bold mb-2">{t('notes.editor.welcome_title')}</h3>
                                <p className="text-sm max-w-[280px]">{t('notes.editor.welcome_desc')}</p>
                            </div>
                        )}
                    </div>

                    {/* Preview Panel */}
                    <AnimatePresence>
                        {showPreview && noteId && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 340, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="w-[340px] border-l border-base-content/5 bg-base-100/50 backdrop-blur-xl flex flex-col"
                            >
                                <div className="h-14 border-b border-base-content/5 flex items-center px-4 shrink-0">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('notes.editor.preview_title')}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                                    <div className="mb-12">
                                        <MarkdownRenderer content={deferredContent} />
                                    </div>

                                    <div className="mt-12 pt-8 border-t border-base-content/5">
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <Share2 size={14} />
                                            </div>
                                            <h3 className="text-xs font-black uppercase tracking-widest opacity-60">{t('notes.backlinks.title')}</h3>
                                        </div>
                                        <BacklinksList noteId={noteId} />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Loading / Error States (Overlay) */}
                <AnimatePresence>
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-base-100/60 backdrop-blur-sm flex items-center justify-center"
                        >
                            <div className="flex flex-col items-center gap-4">
                                <span className="loading loading-ring loading-lg text-primary"></span>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{t('notes.editor.loading_note')}</span>
                            </div>
                        </motion.div>
                    )}
                    {saveError && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50"
                        >
                            <div className="alert alert-error shadow-lg rounded-2xl border-none text-white font-bold py-3 pr-4 pl-6">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs">{t('notes.editor.save_failed')}: {saveError}</span>
                                    <button onClick={() => forceSave()} className="btn btn-ghost btn-xs bg-white/20 hover:bg-white/30 text-white rounded-lg">{t('common:common.actions.retry')}</button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default NotebookPage;
