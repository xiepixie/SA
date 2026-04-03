import React, { useState, useDeferredValue, useEffect, useCallback } from 'react';
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
import { api } from '../lib/eden';

export const NotebookPage: React.FC = () => {
    const { t } = useTranslation(['notes', 'common']);
    const [searchParams, setSearchParams] = useSearchParams();
    const noteId = searchParams.get('noteId');
    const [showPreview, setShowPreview] = useState(false);
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

    const handleSelectNote = useCallback((id: string) => {
        setSearchParams({ noteId: id });
    }, [setSearchParams]);

    const handleNewNote = useCallback(async () => {
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
    }, [createNote, t, handleSelectNote]);

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

    const handleWikiLinkClick = (type: 'q' | 'n', id: string) => {
        if (type === 'n') {
            handleSelectNote(id);
        } else if (type === 'q') {
            // Navigate to question detail
            window.open(`/questions/${id}`, '_blank');
        }
    };

    const handleWikiLinkCreate = async (linkTitle: string) => {
        try {
            // First, silently check if a note with this EXACT title already exists to prevent duplicates
            const { data, error } = await api.api.v1.notes.search.get({
                query: { q: linkTitle, limit: 5 }
            });

            let targetNoteIdStr = null;
            let targetTypePrefix = 'n';

            if (!error && data?.results) {
                // Find exact match (case-insensitive)
                const exactMatch = data.results.find((n: any) => n.title.toLowerCase() === linkTitle.toLowerCase());
                if (exactMatch) {
                    targetNoteIdStr = exactMatch.id;
                    targetTypePrefix = String(exactMatch.type).toLowerCase() === 'question' ? 'q' : 'n';
                }
            }

            // If no exact match, create a new note
            if (!targetNoteIdStr) {
                const newNote: any = await createNote.mutateAsync({
                    type: 'GLOBAL',
                    title: linkTitle,
                    content: { markdown: '' },
                    plainText: ''
                });
                targetNoteIdStr = newNote?.id;
                targetTypePrefix = 'n';
            }

            if (targetNoteIdStr) {
                // Dynamically replace the unresolved link syntax in the code 
                const currentDoc = editorView?.state.doc.toString() || content;
                const searchStr = `[[${linkTitle}]]`;
                const replaceStr = `[[${linkTitle}|${targetTypePrefix}:${targetNoteIdStr}]]`;

                if (currentDoc.includes(searchStr)) {
                    const newContent = currentDoc.split(searchStr).join(replaceStr);
                    setContent(newContent);
                    // Let the debounced save handle it or forceSave
                    setTimeout(() => forceSave(), 100);
                }

                // Navigate
                if (targetTypePrefix === 'n') {
                    handleSelectNote(targetNoteIdStr);
                } else {
                    window.open(`/questions/${targetNoteIdStr}`, '_blank');
                }
            }
        } catch (err) {
            console.error('Failed to auto-resolve or create note from wiki link:', err);
        }
    };

    return (
        <div className="flex h-[100vh] w-full bg-base-100 overflow-hidden">
            {/* Sidebar Panel */}
            <motion.div
                animate={{ width: sidebarCollapsed ? 0 : 260 }}
                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                className={cn(
                    "h-full border-r border-base-content/10 bg-base-100/50 backdrop-blur-xl relative z-20 flex-shrink-0",
                    sidebarCollapsed && "overflow-hidden border-none"
                )}
            >
                <div className="w-[260px] h-full">
                    <NotesSidebar
                        selectedNoteId={noteId}
                        onSelectNote={handleSelectNote}
                        onNewNote={handleNewNote}
                    />
                </div>
            </motion.div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-base-100 relative">
                {/* Collapse/Expand Sidebar Trigger (Floating & Sleek) */}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className={cn(
                        "absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center transition-all duration-300 shadow-premium-lg group",
                        sidebarCollapsed
                            ? "left-0 w-6 h-16 bg-base-100/90 backdrop-blur-md rounded-r-xl border border-l-0 border-base-content/10 hover:w-8 text-base-content/50 hover:text-primary"
                            : "-left-4 w-8 h-12 bg-base-100 rounded-full border border-base-content/10 hover:-left-2 text-base-content/30 hover:text-primary opacity-0 hover:opacity-100 focus:opacity-100" // Hide when expanded unless hovered
                    )}
                >
                    <div className="transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
                        {sidebarCollapsed ? <ChevronRight size={16} strokeWidth={3} /> : <ChevronLeft size={16} strokeWidth={3} />}
                    </div>
                </button>

                {/* Toolbar / Header */}
                <div className="h-14 border-b border-base-content/5 flex items-center justify-between px-6 shrink-0 bg-base-100/30 backdrop-blur-md">
                    <div className="flex items-center gap-4 min-w-0 flex-1 pl-6">
                        {/* Status area moved to left for cleaner look */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/[0.03] border border-base-content/5 transition-all">
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--p),0.5)]" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t('notes.editor.saving')}</span>
                                </div>
                            ) : isDirty ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-warning active-pulsate" />
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
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Word Count */}
                        <div className="hidden lg:flex items-center px-2 py-1 rounded bg-base-content/5 text-[9px] font-black uppercase tracking-widest opacity-40 mr-2">
                            {content.length} {t('notes.quick_jot.chars')}
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
                        <button
                            className="btn btn-ghost btn-sm px-3"
                            title={t('common:common.actions.share', 'Share')}
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                // Optional: You could fire a toast here if you have a global toast system
                                alert(t('common:common.status.copied', '已复制链接到剪贴板！'));
                            }}
                        >
                            <Share2 size={16} />
                        </button>
                        <div className="dropdown dropdown-end">
                            <button tabIndex={0} className="btn btn-ghost btn-sm px-1 m-1" title={t('common:common.actions.more', 'More')}>
                                <MoreVertical size={16} />
                            </button>
                            <ul tabIndex={0} className="dropdown-content z-[100] menu p-2 shadow-premium-lg bg-base-100 rounded-box w-52 border border-base-content/10 backdrop-blur-xl">
                                <li>
                                    <a onClick={() => forceSave()}>
                                        <Share2 size={14} className="opacity-50" />
                                        {t('common:common.actions.save', 'Save')}
                                    </a>
                                </li>
                                <li>
                                    <a className="text-error border-t border-base-content/5 rounded-none mt-1 pt-2" onClick={() => alert(t('common:common.experimental', '该功能敬请期待'))}>
                                        {t('common:common.actions.delete', 'Delete')}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Editor Toolbar (Floating) */}
                <AnimatePresence>
                    {noteId && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, x: "-50%" }}
                            animate={{ opacity: 1, y: 0, x: "-50%" }}
                            exit={{ opacity: 0, y: -20, x: "-50%" }}
                            className="absolute top-16 left-1/2 z-30"
                        >
                            <NoteEditorToolbar view={editorView} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Editor Container */}
                <div className="flex-1 flex overflow-hidden">
                    <div className={cn(
                        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
                        showPreview ? "max-w-[calc(100%-380px)]" : "max-w-full"
                    )}>
                        {noteId ? (
                            <div className="flex-1 overflow-y-auto px-6 lg:px-16 py-12 custom-scrollbar scroll-smooth">
                                <div className="max-w-[800px] mx-auto w-full flex flex-col items-stretch">
                                    {/* Document Title aligned with editor content */}
                                    <div className="mb-6 lg:mb-10 w-full group relative">
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder={t('notes.editor.untitled', 'Untitled Note')}
                                            className="w-full bg-transparent border-none text-4xl lg:text-5xl font-black text-base-content focus:outline-none placeholder:opacity-30 py-2 selection:bg-primary/20 
                                            leading-tight transition-all duration-300"
                                        />
                                        <div className="h-0.5 w-0 bg-primary/20 transition-all duration-500 group-focus-within:w-12 mt-2 rounded-full"></div>
                                    </div>

                                    <div className="w-full">
                                        <NoteEditorCore
                                            value={content}
                                            onChange={setContent}
                                            noteId={noteId}
                                            onWikiLinkClick={handleWikiLinkClick}
                                            onWikiLinkCreate={handleWikiLinkCreate}
                                            onViewCreated={setEditorView}
                                        />
                                    </div>

                                    {/* Embedded Backlinks (Document Flow) */}
                                    <div className="w-full mt-24 mb-16">
                                        <BacklinksList noteId={noteId} variant="document" />
                                    </div>
                                </div>
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
                                animate={{ width: 380, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="w-[380px] border-l border-base-content/5 bg-base-100/50 backdrop-blur-xl flex flex-col"
                            >
                                <div className="h-14 border-b border-base-content/5 flex items-center px-4 shrink-0">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('notes.editor.preview_title')}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                                    <div className="mb-12">
                                        <MarkdownRenderer content={deferredContent} />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <Share2 size={14} />
                                        </div>
                                        <h3 className="text-xs font-black uppercase tracking-widest opacity-60">{t('notes.editor.preview_title', 'Preview Render')}</h3>
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
