import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateNote, useNotes, useUpdateNote } from '../../../queries/notes';
import { ExternalLink, Edit3, Save, CheckCircle2, Palette } from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { MarkdownRenderer } from '../../../components/LatexRenderer';
import { useAppStore } from '../../../app/state/useAppStore';
import { NOTE_COLORS, type NoteColor } from '../types/NoteTheme';

// Lazy load CodeMirror editor for better initial bundle size
const QuickJotEditor = lazy(() => import('../editor/QuickJotEditor'));

interface QuickJotProps {
    questionId: string;
    onPopOut?: () => void;
    className?: string;
    minimal?: boolean; // New prop to hide internal header
}

export interface QuickJotHandle {
    save: () => Promise<void>;
}

export const QuickJot = forwardRef<QuickJotHandle, QuickJotProps>(({ questionId, onPopOut, className, minimal }, ref) => {
    const { t } = useTranslation();

    // 1. Core State
    const [text, setText] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    // Refs for synchronization and precise tracking
    const isSyncingRef = useRef(false);
    const lastSyncedContentRef = useRef('');
    const textRef = useRef('');
    const lastSavedContentRef = useRef<string | null>(null);
    const saveInProgressRef = useRef(false);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    textRef.current = text;

    // 2. Data Fetching
    const { data: notesPage, isFetched } = useNotes({ questionId, type: 'QUESTION', limit: 1 });
    const existingJot = notesPage?.pages?.[0]?.items?.[0];

    const isCreatingNote = existingJot?.id?.startsWith('temp-') ?? false;
    const realJot = isCreatingNote ? undefined : existingJot;

    const createNote = useCreateNote();
    const updateNote = useUpdateNote();

    // 3. Handlers
    const handleTextChange = useCallback((newText: string) => {
        if (isSyncingRef.current) {
            isSyncingRef.current = false;
            return;
        }
        setText(newText);
    }, []);

    // Memoized server content to detect changes
    const serverContent = useMemo(() => {
        if (!existingJot) return '';
        const content = (existingJot as any)?.content as { markdown?: string } | null;
        return content?.markdown || (existingJot as any)?.plain_text || '';
    }, [existingJot]);

    // Cleanup on question change
    useEffect(() => {
        setText('');
        setIsEditing(false);
        setIsSaving(false);
        setLastSaved(null);
        textRef.current = '';
        lastSavedContentRef.current = null;
        saveInProgressRef.current = false;
        lastSyncedContentRef.current = '';
    }, [questionId]);

    // Global theeming
    const noteColor = useAppStore(s => s.noteSettings[questionId]?.color || 'yellow');
    const setNoteSetting = useAppStore(s => s.setNoteSetting);
    const theme = NOTE_COLORS[noteColor as NoteColor] || NOTE_COLORS.yellow;

    // Remote sync effect
    useEffect(() => {
        if (isEditing || isSaving || saveInProgressRef.current) return;

        if (isFetched && serverContent !== lastSyncedContentRef.current) {
            isSyncingRef.current = true;
            setText(serverContent);
            lastSyncedContentRef.current = serverContent;
            lastSavedContentRef.current = serverContent;
        }
    }, [serverContent, isEditing, isSaving, isFetched]);

    // Editor Focus
    useEffect(() => {
        if (isEditing && editorContainerRef.current) {
            const editorFocus = (editorContainerRef.current as any).editorFocus;
            if (typeof editorFocus === 'function') {
                editorFocus();
            }
        }
    }, [isEditing]);

    const handleSave = useCallback(async (textToSave?: string) => {
        const contentToSave = textToSave ?? textRef.current;

        if (contentToSave === lastSavedContentRef.current) {
            setIsEditing(false);
            return;
        }

        if (saveInProgressRef.current) return;

        if (!contentToSave.trim() && !realJot) {
            setIsEditing(false);
            return;
        }

        saveInProgressRef.current = true;
        setIsSaving(true);
        setIsEditing(false);

        const previousSaved = lastSavedContentRef.current;
        lastSavedContentRef.current = contentToSave;

        try {
            if (realJot) {
                await updateNote.mutateAsync({
                    id: realJot.id,
                    content: { markdown: contentToSave },
                    plainText: contentToSave,
                    questionId
                });
            } else {
                if (isCreatingNote) {
                    saveInProgressRef.current = false;
                    setIsSaving(false);
                    return;
                }
                await createNote.mutateAsync({
                    type: 'QUESTION',
                    questionId,
                    title: `Jot for Q${questionId.slice(0, 8)}`,
                    content: { markdown: contentToSave },
                    plainText: contentToSave
                });
            }
            setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (err: any) {
            console.error("Failed to save jot", err);
            lastSavedContentRef.current = previousSaved;
            setIsEditing(true);
        } finally {
            saveInProgressRef.current = false;
            setIsSaving(false);
        }
    }, [realJot, isCreatingNote, questionId, updateNote, createNote]);

    useImperativeHandle(ref, () => ({
        save: () => handleSave(),
    }), [handleSave]);

    useEffect(() => {
        if (!isEditing) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                handleSave();
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing, handleSave]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "group relative flex flex-col overflow-hidden shadow-sm hover:shadow-premium-lg transition-all duration-300",
                !minimal && "min-h-[200px] rounded-2xl",
                !minimal && theme.bg,
                isEditing && !minimal && "ring-4 ring-primary/10 shadow-premium-xl translate-y-[-2px] z-10",
                !minimal && "resize-y",
                className
            )}
            style={{ maxHeight: '80vh' }}
        >
            {!minimal && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 bg-white/10 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", isEditing ? "bg-primary animate-pulse" : "bg-black/20")} />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('notes.quick_jot.title')}</span>
                    </div>

                    <div className="flex items-center gap-1">
                        <div className="flex items-center px-1.5 py-0.5 rounded bg-black/5 mr-2">
                            <Palette size={10} className="opacity-30 mr-1" />
                            <div className="flex gap-1">
                                {(['yellow', 'blue', 'green', 'rose', 'purple'] as NoteColor[]).map((c) => (
                                    <button
                                        key={c}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setNoteSetting(questionId, { color: c });
                                        }}
                                        className={cn(
                                            "w-2.5 h-2.5 rounded-full transition-transform hover:scale-125",
                                            NOTE_COLORS[c].bg,
                                            noteColor === c && "ring-1 ring-black/20 scale-110"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>

                        {onPopOut && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onPopOut(); }}
                                className="p-1.5 rounded-lg hover:bg-black/5 opacity-40 hover:opacity-100 transition-all"
                            >
                                <ExternalLink size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex-1 relative overflow-hidden flex flex-col">
                {isEditing ? (
                    <div className="flex-1 overflow-hidden" ref={editorContainerRef}>
                        <Suspense fallback={<div className="p-4 opacity-20 animate-pulse text-xs">{t('common.status.loading')}...</div>}>
                            <QuickJotEditor
                                value={text}
                                onChange={handleTextChange}
                                placeholder={t('notes.quick_jot.placeholder')}
                                onSave={() => handleSave()}
                                theme={noteColor as NoteColor}
                            />
                        </Suspense>
                    </div>
                ) : (
                    <div
                        className="flex-1 overflow-y-auto p-4 md:p-6 cursor-text relative custom-scrollbar hover:bg-black/[0.02] transition-colors"
                        onDoubleClick={() => setIsEditing(true)}
                    >
                        {text.trim() ? (
                            <div className="prose prose-sm max-w-none">
                                <MarkdownRenderer content={text} />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 pointer-events-none py-8">
                                <Edit3 size={32} strokeWidth={1} className="mb-2" />
                                <p className="text-xs font-medium">{t('notes.quick_jot.placeholder')}</p>
                                <p className="text-[10px] mt-1 italic">{t('notes.quick_jot.double_click')}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {(isEditing || isSaving || lastSaved) && !minimal && (
                <div className="px-4 py-2 border-t border-black/5 bg-white/5 backdrop-blur-sm flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        {isSaving ? (
                            <>
                                <Save size={12} className="animate-bounce text-primary" />
                                <span className="text-[10px] font-bold text-primary opacity-80 uppercase tracking-wider">{t('notes.editor.saving')}</span>
                            </>
                        ) : lastSaved ? (
                            <>
                                <CheckCircle2 size={12} className="text-success" />
                                <span className="text-[10px] font-medium opacity-50 uppercase tracking-wider">{t('notes.editor.saved_at', { time: lastSaved })}</span>
                            </>
                        ) : null}
                    </div>

                    {isEditing && (
                        <div className="flex items-center gap-2 text-[10px] font-medium opacity-30 select-none">
                            <span className="hidden sm:inline">ESC {t('common.actions.save')}</span>
                            <span className="hidden sm:inline">・</span>
                            <span>{text.length} chars</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

QuickJot.displayName = 'QuickJot';
