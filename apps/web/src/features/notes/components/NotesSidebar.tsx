import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search,
    FolderPlus,
    FilePlus,
    Clock,
    Folders,
    MoreVertical,
    FileText,
    Folder
} from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import {
    useRecentNotes,
    useGlobalNotes,
    useSearchNotes,
    useCreateNote,
    useUpdateNote,
    useDeleteNote,
    useMoveNote,
    useAllFolders
} from '../../../queries/notes';
import { motion, AnimatePresence } from 'framer-motion';

interface NotesSidebarProps {
    selectedNoteId: string | null;
    onSelectNote: (id: string) => void;
    onNewNote: () => void;
}

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
    selectedNoteId,
    onSelectNote,
    onNewNote
}) => {
    const { t } = useTranslation(['notes', 'common']);
    const [view, setView] = useState<'folders' | 'recents'>('folders');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: recentNotes, isLoading: isRecentLoading } = useRecentNotes();
    const { data: rootNotes, isLoading: isFoldersLoading } = useGlobalNotes(null);
    const { data: searchResults } = useSearchNotes(searchQuery);

    const createNote = useCreateNote();

    const handleNewFolder = async () => {
        try {
            await createNote.mutateAsync({
                type: 'GLOBAL',
                title: t('notes.sidebar.new_folder'),
                isFolder: true
            });
        } catch (err) {
            console.error('Failed to create folder:', err);
        }
    };

    const [movingNoteId, setMovingNoteId] = useState<string | null>(null);
    const { data: allFolders } = useAllFolders();
    const moveNote = useMoveNote();

    const handleMove = async (newParentId: string | null) => {
        if (!movingNoteId) return;
        try {
            await moveNote.mutateAsync({ id: movingNoteId, parentId: newParentId });
        } catch (error) {
            console.error("Failed to move note:", error);
        }
        setMovingNoteId(null);
    };

    return (
        <div className="flex flex-col h-full bg-base-200/50 relative">
            {/* Header: Actions & Search */}
            <div className="p-4 space-y-4 shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-black uppercase tracking-widest text-base-content/40">{t('notes.sidebar.title')}</h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleNewFolder}
                            className="btn btn-ghost btn-xs btn-square"
                            title={t('notes.sidebar.new_folder')}
                        >
                            <FolderPlus size={14} />
                        </button>
                        <button
                            onClick={onNewNote}
                            className="btn btn-ghost btn-xs btn-square"
                            title={t('notes.sidebar.new_note')}
                        >
                            <FilePlus size={14} />
                        </button>
                    </div>
                </div>

                <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-base-content/30 group-focus-within:text-primary transition-colors">
                        <Search size={14} />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('notes.sidebar.search_placeholder')}
                        className="w-full h-9 pl-9 pr-4 bg-base-content/[0.03] border border-base-content/5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 focus:bg-base-100 placeholder:opacity-40 transition-all"
                    />
                </div>

                {/* View Selector */}
                <div className="flex p-1 bg-base-content/[0.03] rounded-xl border border-base-content/5">
                    <button
                        onClick={() => setView('folders')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                            view === 'folders' ? "bg-base-100 text-primary shadow-premium-sm" : "text-base-content/40 hover:text-base-content/60"
                        )}
                    >
                        <Folders size={12} />
                        {t('notes.sidebar.all_notes')}
                    </button>
                    <button
                        onClick={() => setView('recents')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                            view === 'recents' ? "bg-base-100 text-primary shadow-premium-sm" : "text-base-content/40 hover:text-base-content/60"
                        )}
                    >
                        <Clock size={12} />
                        {t('notes.sidebar.recents')}
                    </button>
                </div>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto px-2 pb-6 custom-scrollbar relative">
                {(isRecentLoading || isFoldersLoading) && (
                    <div className="absolute inset-0 z-10 bg-base-100/30 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="loading loading-spinner loading-sm text-primary/40"></span>
                    </div>
                )}
                <AnimatePresence mode="wait">
                    {searchQuery ? (
                        <motion.div
                            key="search"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-1"
                        >
                            <div className="px-2 mb-2 text-[8px] font-black uppercase text-base-content/30 tracking-[0.2em]">{t('common:common.search_results')}</div>
                            {searchResults?.results?.map((res: any) => (
                                <NoteItem
                                    key={`${res.type}:${res.id}`}
                                    id={res.id}
                                    title={res.title}
                                    type={res.type === 'note' ? 'GLOBAL' : 'QUESTION'}
                                    selected={selectedNoteId === res.id}
                                    onClick={() => onSelectNote(res.id)}
                                    onSelectNote={onSelectNote}
                                    selectedNoteId={selectedNoteId}
                                    onMoveNote={setMovingNoteId}
                                />
                            ))}
                            {(!searchResults?.results || searchResults.results.length === 0) && (
                                <div className="p-8 text-center opacity-30 text-[10px] font-bold">{t('common:common.no_results')}</div>
                            )}
                        </motion.div>
                    ) : view === 'recents' ? (
                        <motion.div
                            key="recents"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-1"
                        >
                            {recentNotes?.map((note: any) => (
                                <NoteItem
                                    key={note.id}
                                    id={note.id}
                                    title={note.title || t('notes.editor.untitled')}
                                    type={note.type}
                                    selected={selectedNoteId === note.id}
                                    onClick={() => onSelectNote(note.id)}
                                    onSelectNote={onSelectNote}
                                    selectedNoteId={selectedNoteId}
                                    onMoveNote={setMovingNoteId}
                                />
                            ))}
                            {recentNotes?.length === 0 && (
                                <div className="p-8 text-center opacity-20 text-[11px]">{t('notes.sidebar.no_recent')}</div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="folders"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-1"
                        >
                            {rootNotes?.map((note: any) => (
                                <NoteItem
                                    key={note.id}
                                    id={note.id}
                                    title={note.title || (note.is_folder ? t('notes.sidebar.new_folder') : t('notes.editor.untitled'))}
                                    type={note.type}
                                    isFolder={note.is_folder}
                                    selected={selectedNoteId === note.id}
                                    onClick={() => onSelectNote(note.id)}
                                    onSelectNote={onSelectNote}
                                    selectedNoteId={selectedNoteId}
                                    onMoveNote={setMovingNoteId}
                                />
                            ))}
                            {rootNotes?.length === 0 && (
                                <div className="flex flex-col items-center justify-center p-12 opacity-20 space-y-4">
                                    <Folders size={24} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t('notes.sidebar.empty_library')}</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Move Dialog */}
            <AnimatePresence>
                {movingNoteId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-base-100/80 backdrop-blur-sm flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-base-100 border border-base-content/10 shadow-premium-2xl rounded-2xl w-full max-w-sm flex flex-col max-h-full overflow-hidden"
                        >
                            <div className="p-4 border-b border-base-content/5 font-bold text-sm">
                                {t('notes.sidebar.move_title', 'Move to folder')}
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1 max-h-[50vh]">
                                <button
                                    onClick={() => handleMove(null)}
                                    className="w-full text-left px-4 py-3 hover:bg-base-content/5 rounded-xl text-xs font-bold transition-colors"
                                >
                                    / {t('notes.sidebar.root', 'Root')}
                                </button>
                                {allFolders?.filter((f: any) => f.id !== movingNoteId).map((f: any) => (
                                    <button
                                        key={f.id}
                                        onClick={() => handleMove(f.id)}
                                        className="w-full flex items-center gap-2 text-left px-4 py-3 hover:bg-base-content/5 rounded-xl text-xs font-bold transition-colors truncate"
                                    >
                                        <Folder size={14} className="opacity-40" />
                                        {f.title || t('notes.sidebar.new_folder')}
                                    </button>
                                ))}
                            </div>
                            <div className="p-4 border-t border-base-content/5 flex justify-end">
                                <button onClick={() => setMovingNoteId(null)} className="btn btn-sm btn-ghost">{t('common:common.actions.cancel', 'Cancel')}</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface NoteItemProps {
    id: string;
    title: string;
    type?: 'GLOBAL' | 'QUESTION';
    isFolder?: boolean;
    selected: boolean;
    onClick: () => void;
    onSelectNote: (id: string) => void;
    selectedNoteId: string | null;
    onMoveNote: (id: string) => void;
}

const NoteItem: React.FC<NoteItemProps & { parentId?: string }> = ({
    id,
    title,
    isFolder,
    selected,
    onClick,
    onSelectNote,
    selectedNoteId,
    onMoveNote,
    parentId
}) => {
    const { t } = useTranslation(['notes', 'common']);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const shouldFetchSubNotes = !!(isFolder && isExpanded);
    const { data: subNotes } = useGlobalNotes(shouldFetchSubNotes ? id : null, shouldFetchSubNotes);
    const createNote = useCreateNote();
    const updateNote = useUpdateNote();
    const deleteNote = useDeleteNote();

    const handleToggle = (e: React.MouseEvent) => {
        if (isFolder) {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
        }
    };

    const handleNewSubNote = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        try {
            const newNote: any = await createNote.mutateAsync({
                type: 'GLOBAL',
                title: t('notes.editor.untitled'),
                parentId: id
            });
            if (newNote?.id) onSelectNote(newNote.id);
            if (!isExpanded) setIsExpanded(true);
        } catch (err) { }
    };

    const handleNewSubFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        try {
            await createNote.mutateAsync({
                type: 'GLOBAL',
                title: t('notes.sidebar.new_folder'),
                isFolder: true,
                parentId: id
            });
            if (!isExpanded) setIsExpanded(true);
        } catch (err) { }
    };

    const handleRename = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        const newTitle = window.prompt(t('notes.sidebar.rename_prompt'), title);
        if (newTitle && newTitle !== title) {
            await updateNote.mutateAsync({ id, title: newTitle });
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        if (window.confirm(t('notes.sidebar.delete_confirm', { type: isFolder ? t('notes.sidebar.new_folder').toLowerCase() : t('notes.editor.untitled').toLowerCase() }))) {
            await deleteNote.mutateAsync({ id, parentId });
        }
    };

    return (
        <div className="flex flex-col">
            <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                    if (isFolder) {
                        handleToggle(e);
                    } else {
                        onClick();
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isFolder) {
                            handleToggle(e as any);
                        } else {
                            onClick();
                        }
                    }
                }}
                onContextMenu={(e) => { e.preventDefault(); setIsMenuOpen(!isMenuOpen); }}
                className={cn(
                    "w-full group flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-300 relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    selected
                        ? "bg-primary text-primary-content shadow-premium-sm"
                        : "hover:bg-base-content/5 text-base-content/70 hover:text-base-content"
                )}
            >
                <div
                    onClick={handleToggle}
                    className={cn(
                        "shrink-0 transition-all group-hover:scale-110 flex items-center justify-center w-5 h-5",
                        selected ? "text-primary-content" : "text-base-content/30 group-active:scale-95"
                    )}
                >
                    {isFolder ? (
                        <div className="relative">
                            <Folder size={16} />
                            {isExpanded ? (
                                <div className="absolute -bottom-1.5 -right-1 text-[8px] font-black opacity-60">−</div>
                            ) : (
                                <div className="absolute -bottom-1.5 -right-1 text-[8px] font-black opacity-60">+</div>
                            )}
                        </div>
                    ) : (
                        <FileText size={16} />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate leading-tight">
                        {title}
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                        className={cn(
                            "p-1 rounded-lg hover:bg-base-content/10 transition-opacity",
                            isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                        )}
                    >
                        <MoreVertical size={12} />
                    </button>

                    <AnimatePresence>
                        {isMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute right-0 top-full mt-1 w-32 bg-base-100 border border-base-content/10 rounded-xl shadow-premium-lg z-50 overflow-hidden"
                            >
                                {isFolder && (
                                    <>
                                        <button onClick={handleNewSubNote} className="w-full px-4 py-2 text-left text-[10px] font-bold hover:bg-base-content/5 transition-colors">{t('notes.sidebar.new_note')}</button>
                                        <button onClick={handleNewSubFolder} className="w-full px-4 py-2 text-left text-[10px] font-bold hover:bg-base-content/5 transition-colors">{t('notes.sidebar.new_folder')}</button>
                                        <div className="h-px bg-base-content/5 w-full my-1"></div>
                                    </>
                                )}
                                <button onClick={handleRename} className="w-full px-4 py-2 text-left text-[10px] font-bold hover:bg-base-content/5 transition-colors">{t('notes.sidebar.rename')}</button>
                                <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onMoveNote(id); }} className="w-full px-4 py-2 text-left text-[10px] font-bold hover:bg-base-content/5 transition-colors">{t('notes.sidebar.move', 'Move')}</button>
                                <button onClick={handleDelete} className="w-full px-4 py-2 text-left text-[10px] font-bold text-error hover:bg-error/10 transition-colors">{t('notes.sidebar.delete')}</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Sub-items for Folder */}
            <AnimatePresence>
                {isFolder && isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="pl-6 border-l border-base-content/5 ml-5 mt-1 space-y-1 overflow-hidden"
                    >
                        {subNotes?.map((sub: any) => (
                            <NoteItem
                                key={sub.id}
                                id={sub.id}
                                title={sub.title || (sub.is_folder ? t('notes.sidebar.new_folder') : t('notes.editor.untitled'))}
                                type={sub.type}
                                isFolder={sub.is_folder}
                                selected={selectedNoteId === sub.id}
                                onClick={() => onSelectNote(sub.id)}
                                onSelectNote={onSelectNote}
                                selectedNoteId={selectedNoteId}
                                onMoveNote={onMoveNote}
                                parentId={id}
                            />
                        ))}
                        {subNotes?.length === 0 && (
                            <div className="py-2 px-3 text-[9px] font-bold opacity-20 uppercase tracking-widest italic">{t('notes.sidebar.empty_folder')}</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
