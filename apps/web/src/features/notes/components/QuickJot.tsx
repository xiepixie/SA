import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateNote, useNotes, useUpdateNote } from '../../../queries/notes';
import { ExternalLink, Edit3, Save, CheckCircle2, Palette } from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { MarkdownRenderer } from '../../../components/LatexRenderer';
import { useAppStore } from '../../../app/state/useAppStore';
import { NOTE_COLORS, COLOR_KEYS, type NoteColor } from '../types/NoteTheme';

// Lazy load CodeMirror editor for better initial bundle size
const QuickJotEditor = lazy(() => import('../editor/QuickJotEditor'));

interface QuickJotProps {
    questionId: string;
    onPopOut?: () => void;
    className?: string;
    minimal?: boolean; // New prop to hide internal header
}

// Expose save trigger to parent (used by NotesPanel before pop-out)
export interface QuickJotHandle {
    save: () => Promise<void>;
}

export const QuickJot = forwardRef<QuickJotHandle, QuickJotProps>(({ questionId, onPopOut, className, minimal }, ref) => {
    const { t } = useTranslation();

    // 1. Fetch existing Jot for this question
    const { data: notesPage, isFetched } = useNotes({ questionId, type: 'QUESTION', limit: 1 });
    const existingJot = notesPage?.pages?.[0]?.items?.[0];

    // ✅ P0: Check if existingJot is a temp note (creation in progress)
    const isCreatingNote = existingJot?.id?.startsWith('temp-') ?? false;
    // Get the real note (non-temp) - if it's temp, treat as if no note exists yet
    const realJot = isCreatingNote ? undefined : existingJot;

    const createNote = useCreateNote();
    const updateNote = useUpdateNote();

    const [text, setText] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // ✅ 使用 ref 追踪最新值，避免闭包陈旧问题
    const textRef = useRef(text);
    textRef.current = text;

    // ✅ 追踪上次成功保存的内容，避免重复保存
    const lastSavedContentRef = useRef<string | null>(null);

    // ✅ 追踪上一次服务端同步的内容，用于区分"新数据"和"旧数据"
    const prevServerContentRef = useRef<string | null>(null);

    // ✅ 追踪是否正在进行保存操作，防止竞态
    const saveInProgressRef = useRef(false);

    // ✅ 3. Reset state when question changes (P0-3)
    useEffect(() => {
        setText('');
        setIsEditing(false);
        setIsSaving(false);
        setLastSaved(null);
        textRef.current = '';
        lastSavedContentRef.current = null;
        prevServerContentRef.current = null;
        saveInProgressRef.current = false;
    }, [questionId]);

    // 2. Global UI Sync
    const noteColor = useAppStore(s => s.noteSettings[questionId]?.color || 'yellow');
    const setNoteSetting = useAppStore(s => s.setNoteSetting);
    const theme = NOTE_COLORS[noteColor as NoteColor] || NOTE_COLORS.yellow;

    // 获取服务端内容
    const serverContent = useMemo(() => {
        if (!existingJot) return '';
        const content = existingJot.content as { markdown?: string } | null;
        return content?.markdown || existingJot.plain_text || '';
    }, [existingJot]);

    // ✅ 初始化 / 同步外部数据 - 实现"只进不退"的同步策略
    useEffect(() => {
        // 如果正在编辑或保存，绝对不打断用户
        if (isEditing || isSaving || saveInProgressRef.current) return;

        // ✅ P1-1: 使用 isFetched 判断是否首次 hydration
        if (prevServerContentRef.current === null && isFetched) {
            setText(serverContent);
            prevServerContentRef.current = serverContent;
            lastSavedContentRef.current = serverContent;
            return;
        }

        // 核心同步逻辑 (Issue 1 修复):
        // 我们维护 prevServerContentRef 作为我们已知的、真实的服务器状态。
        // 我们维护 lastSavedContentRef 作为我们最后一次尝试推送给服务器的状态。

        if (serverContent !== prevServerContentRef.current) {
            // 服务器内容变了

            // 场景 A: 服务器内容变成了我们刚才保存的内容（同步达标）
            if (serverContent === lastSavedContentRef.current) {
                prevServerContentRef.current = serverContent;
                // 此时 text 应该已经和 lastSavedContentRef 相等了，无需 setText
                return;
            }

            // 场景 B: 服务器内容变了，且不是我们刚保存的内容。
            // 这意味着：
            // 1. 这是一个全新的远程修改（来自其他端）
            // 2. 或者这是一个更旧的数据回滚（但 serverContent !== prevServerContentRef 意味着它确实和“上一次我们见到的服务器值”不一样了）

            // 只有当服务器确实带来了“新东西”且本地并没有正在努力同步（即 text 已经等于 lastSavedContentRef）时，我们更新本地。
            // 如果本地 text 不同于 lastSavedContentRef 且没有在保存中，那这属于脏状态，逻辑已经在首行 return 了。

            // 最终判断：如果服务端内容不仅变了，而且确实不是我们刚存的东西，就同步。
            // 防止回滚的关键是：handleSave 里不要乐观更新 prevServerContentRef。
            setText(serverContent);
            prevServerContentRef.current = serverContent;
            lastSavedContentRef.current = serverContent;
        }
    }, [serverContent, isEditing, isSaving, isFetched]);

    // Focus editor when entering edit mode
    useEffect(() => {
        if (isEditing && editorContainerRef.current) {
            const editorFocus = (editorContainerRef.current as any).editorFocus;
            if (typeof editorFocus === 'function') {
                editorFocus();
            }
        }
    }, [isEditing]);


    // ✅ 重构保存逻辑 - 使用 ref 获取最新值
    const handleSave = useCallback(async (textToSave?: string) => {
        // 使用传入的值或 ref 中的最新值
        const contentToSave = textToSave ?? textRef.current;

        // 防止重复保存相同内容
        if (contentToSave === lastSavedContentRef.current) {
            setIsEditing(false);
            return;
        }

        // 防止并发保存
        if (saveInProgressRef.current) {
            return;
        }

        // 空内容且没有已存在的笔记，不保存
        if (!contentToSave.trim() && !realJot) {
            setIsEditing(false);
            return;
        }

        saveInProgressRef.current = true;
        setIsSaving(true);
        setIsEditing(false);

        // ✅ 立即更新上次保存内容为当前内容（用于同步识别）
        const previousSaved = lastSavedContentRef.current;
        lastSavedContentRef.current = contentToSave;

        // 注意：这里不再乐观更新 prevServerContentRef.current
        // 让服务器真正的响应来更新它，从而在同步 effect 里起到“节拍器”的作用。

        try {
            // ✅ P0: 使用 realJot 而不是 existingJot，避免对 temp note 进行 update
            if (realJot) {
                await updateNote.mutateAsync({
                    id: realJot.id,
                    content: { markdown: contentToSave },
                    plainText: contentToSave,
                    questionId // 传递 questionId 用于 IDB 草稿清理
                });
            } else {
                // 如果正在创建中 (isCreatingNote)，不要再次创建，等待当前创建完成
                if (isCreatingNote) {
                    console.warn('Note creation already in progress, skipping duplicate create');
                    // Don't leave save flags stuck — clean up immediately
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
            // 保存成功
            setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            console.error("Failed to save jot", err);
            // 保存失败，回滚状态
            lastSavedContentRef.current = previousSaved;
            setIsEditing(true);
        } finally {
            saveInProgressRef.current = false;
            setIsSaving(false);
        }
    }, [realJot, isCreatingNote, questionId, updateNote, createNote]);

    // Expose save method to parent via ref
    useImperativeHandle(ref, () => ({
        save: () => handleSave(),
    }), [handleSave]);

    // ✅ P0: 点击外部区域退出编辑模式
    useEffect(() => {
        if (!isEditing) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                handleSave(); // 使用 ref 获取最新值
            }
        };

        // 延迟添加事件监听，避免立即触发
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
                "group relative flex flex-col overflow-hidden shadow-sm hover:shadow-premium-lg",
                !minimal && "min-h-[200px] rounded-2xl", // Increased min-height
                !minimal && theme.bg,
                // Border removed for cleaner look
                isEditing && !minimal && "ring-4 ring-primary/10 shadow-premium-xl translate-y-[-2px] z-10",
                // Allow vertical resize if not minimal
                !minimal && "resize-y",
                className
            )}
            style={{ maxHeight: '80vh' }} // Cap max height for safety
        >
            {/* Header / Toolbar */}
            {!minimal && (
                <div className="flex items-center justify-between px-4 py-2 bg-base-content/[0.02] select-none border-b border-base-content/[0.03]">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-50 group-hover:opacity-100 transition-opacity">
                        <Edit3 size={12} className={theme.muted} />
                        <span className={theme.muted}>{t('notes.quick_jot.title', 'Quick Jot')}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Status Indicators */}
                        {isSaving ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-base-content/5">
                                <span className={cn("loading loading-spinner loading-xs", theme.text)}></span>
                                <span className="text-[10px] opacity-60">Saving...</span>
                            </div>
                        ) : lastSaved && (
                            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-base-content/5 opacity-0 group-hover:opacity-100 transition-opacity", theme.muted)}>
                                <CheckCircle2 size={10} />
                                <span className="text-[10px] font-medium opacity-80">{lastSaved}</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-base-content/10">
                            <button
                                onClick={() => {
                                    const colors = COLOR_KEYS;
                                    const next = colors[(colors.indexOf(noteColor as any) + 1) % colors.length];
                                    setNoteSetting(questionId, { color: next });
                                }}
                                className={cn("btn btn-ghost btn-xs btn-square rounded-md", theme.hover)}
                                title="Change Color"
                            >
                                <Palette size={14} className={theme.muted} />
                            </button>

                            {onPopOut && (
                                <button
                                    onClick={onPopOut}
                                    className={cn("btn btn-ghost btn-xs btn-square rounded-md", theme.hover)}
                                    title={t('notes.quick_jot.pop_out', 'Pop out')}
                                >
                                    <ExternalLink size={14} className={theme.muted} />
                                </button>
                            )}

                            {isEditing ? (
                                <button
                                    onClick={() => handleSave()}
                                    className={cn("btn btn-ghost btn-xs btn-square rounded-md", theme.text, theme.hover)}
                                    title={t('common.actions.save', 'Save') + " (Esc)"}
                                >
                                    <Save size={14} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    disabled={isSaving}
                                    className={cn("btn btn-ghost btn-xs btn-square rounded-md", theme.muted, theme.hover, isSaving && "opacity-50 cursor-not-allowed")}
                                    title={t('common.actions.edit', 'Edit')}
                                >
                                    <Edit3 size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 relative min-h-0 h-full w-full">
                {isEditing ? (
                    <Suspense fallback={
                        <div className="w-full h-full flex items-center justify-center opacity-50">
                            <span className="loading loading-spinner loading-sm"></span>
                        </div>
                    }>
                        <QuickJotEditor
                            ref={editorContainerRef}
                            value={text}
                            onChange={setText}
                            onSave={() => handleSave()}
                            theme={noteColor as NoteColor}
                            placeholder={t('notes.quick_jot.placeholder', 'Type notes here... (MD & LaTeX supported)')}
                            className={cn("w-full h-full", theme.text)}
                            autoFocus
                        />
                    </Suspense>
                ) : (
                    <div
                        className={cn("w-full h-full p-4 overflow-y-auto custom-scrollbar group/content", !isSaving && "cursor-text")}
                        onDoubleClick={(e) => {
                            // ✅ P0: Disable editing while saving
                            if (isSaving) return;
                            e.preventDefault();
                            setIsEditing(true);
                        }}
                    >
                        {text.trim() ? (
                            <div
                                className={cn(
                                    // ✅ KEY: jot-markdown-content connects to overrides.css
                                    // which uses !important to override .markdown-body's hardcoded system colors
                                    "jot-markdown-content prose prose-sm max-w-none",
                                    theme.text
                                )}
                                style={{
                                    // Match editor font settings from noteTheme.ts
                                    fontSize: '15px',
                                    fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
                                    lineHeight: '1.6',
                                }}
                            >
                                {/* ✅ KEY: jot-markdown connects to markdown.css Jot sizing overrides
                                    prose-none prevents inner MarkdownRenderer from adding its own prose colors */}
                                <MarkdownRenderer
                                    content={text}
                                    className="jot-markdown prose-none !text-inherit bg-transparent"
                                />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none py-8">
                                <Edit3 size={24} className="mb-2 opacity-50" />
                                <span className="text-xs font-semibold uppercase tracking-wider">
                                    {t('notes.quick_jot.double_click', 'Double-click to edit')}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Editing Status Bar / Footer */}
            {isEditing && (
                <div className={cn(
                    "flex items-center justify-between px-3 py-1 text-[10px] font-medium border-t select-none",
                    // No theme.bg here — the container already has theme.bg;
                    // stacking two semi-transparent layers creates a visible color mismatch
                    "border-black/5 dark:border-white/5",
                    theme.muted
                )}>
                    <div className="flex items-center gap-4">
                        <span className="opacity-70">{text.length} chars</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-70">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 rounded bg-black/5 dark:bg-white/10 font-sans">Esc</kbd>
                            <span>save</span>
                        </span>
                        <span className="hidden sm:inline">Click outside to save</span>
                    </div>
                </div>
            )}
        </div>
    );
});

QuickJot.displayName = 'QuickJot';
