import React, { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
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

export const QuickJot: React.FC<QuickJotProps> = ({ questionId, onPopOut, className, minimal }) => {
    const { t } = useTranslation();

    // 1. Fetch existing Jot for this question
    const { data: notesPage, dataUpdatedAt } = useNotes({ questionId, type: 'QUESTION', limit: 1 });
    const existingJot = notesPage?.pages?.[0]?.items?.[0];

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

    // ✅ 追踪是否正在进行保存操作，防止竞态
    const saveInProgressRef = useRef(false);

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

    // ✅ 初始化 / 同步外部数据 - 仅在非编辑状态且数据更新时
    useEffect(() => {
        // 不在编辑中、不在保存中、且不是刚保存过相同内容
        if (!isEditing && !isSaving && !saveInProgressRef.current) {
            // 只有当服务端内容与上次保存内容不同时才更新
            if (serverContent !== lastSavedContentRef.current) {
                setText(serverContent);
                lastSavedContentRef.current = serverContent;
            }
        }
    }, [serverContent, isEditing, isSaving, dataUpdatedAt]);

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
        if (!contentToSave.trim() && !existingJot) {
            setIsEditing(false);
            return;
        }

        saveInProgressRef.current = true;
        setIsSaving(true);
        setIsEditing(false);

        try {
            if (existingJot) {
                await updateNote.mutateAsync({
                    id: existingJot.id,
                    content: { markdown: contentToSave },
                    plainText: contentToSave,
                    questionId // 传递 questionId 用于 IDB 草稿清理
                });
            } else {
                await createNote.mutateAsync({
                    type: 'QUESTION',
                    questionId,
                    title: `Jot for Q${questionId.slice(0, 8)}`,
                    content: { markdown: contentToSave },
                    plainText: contentToSave
                });
            }
            // 保存成功，更新追踪
            lastSavedContentRef.current = contentToSave;
            setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            console.error("Failed to save jot", err);
            // 保存失败，恢复编辑模式让用户重试
            setIsEditing(true);
        } finally {
            setIsSaving(false);
            saveInProgressRef.current = false;
        }
    }, [existingJot, questionId, updateNote, createNote]);

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
    }, [isEditing, handleSave]); // 移除 text 依赖，handleSave 内部使用 ref

    return (
        <div
            ref={containerRef}
            className={cn(
                "group relative flex flex-col transition-all duration-500 ease-in-out overflow-hidden shadow-sm hover:shadow-premium-lg",
                !minimal && "min-h-[160px] rounded-2xl border-2",
                !minimal && theme.bg,
                !minimal && theme.border,
                isEditing && !minimal && "ring-4 ring-primary/10 shadow-premium-xl translate-y-[-2px]",
                className
            )}
        >
            {/* Header / Toolbar - No border-b to keep it clean */}
            {!minimal && (
                <div className="flex items-center justify-between px-4 py-2 bg-base-content/[0.01] select-none">
                    <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity duration-500">
                        <Edit3 size={12} className={theme.muted} />
                        <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", theme.muted)}>
                            {t('notes.quick_jot.title', 'Quick Jot')}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 opacity-20 group-hover:opacity-100 transition-opacity duration-500">
                        {isSaving ? (
                            <span className={cn("loading loading-spinner loading-[10px]", theme.text)}></span>
                        ) : lastSaved ? (
                            <div className={cn("flex items-center gap-1 scale-90", theme.muted)}>
                                <CheckCircle2 size={10} className="opacity-100" />
                                <span className="text-[9px] font-bold se-mono">{lastSaved}</span>
                            </div>
                        ) : null}

                        <div className="flex items-center gap-0.5 ml-1">
                            {/* Palette Toggle synced globally */}
                            <button
                                onClick={() => {
                                    const colors = COLOR_KEYS;
                                    const next = colors[(colors.indexOf(noteColor as any) + 1) % colors.length];
                                    setNoteSetting(questionId, { color: next });
                                }}
                                className={cn("btn btn-ghost btn-xs btn-circle", theme.hover)}
                                title="Change Color"
                            >
                                <Palette size={12} className={theme.muted} />
                            </button>
                            {isEditing ? (
                                <button
                                    onClick={() => handleSave()}
                                    className={cn("btn btn-ghost btn-xs btn-circle", theme.text, theme.hover)}
                                    title={t('common.actions.save', 'Save') + " (Esc)"}
                                >
                                    <Save size={12} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className={cn("btn btn-ghost btn-xs btn-circle", theme.muted, theme.hover)}
                                    title={t('common.actions.edit', 'Edit')}
                                >
                                    <Edit3 size={12} />
                                </button>
                            )}
                            {onPopOut && (
                                <button
                                    onClick={onPopOut}
                                    className={cn("btn btn-ghost btn-xs btn-circle", theme.muted, theme.hover)}
                                    title={t('notes.quick_jot.pop_out', 'Pop out')}
                                >
                                    <ExternalLink size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 relative min-h-0 overflow-hidden h-full">
                {isEditing ? (
                    <Suspense fallback={
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="loading loading-spinner loading-sm"></span>
                        </div>
                    }>
                        <QuickJotEditor
                            ref={editorContainerRef}
                            value={text}
                            onChange={setText}
                            // ✅ P0 FIX: 移除 onBlur，改用 Escape/Ctrl+Enter 保存退出
                            onSave={() => handleSave()}
                            theme={noteColor as NoteColor}
                            placeholder={t('notes.quick_jot.placeholder', 'Type notes here... (LaTeX & Markdown supported)')}
                            className={cn("w-full", theme.text)}
                            autoFocus
                        />
                    </Suspense>
                ) : (
                    <div
                        className="w-full h-full p-3 overflow-y-auto custom-scrollbar cursor-text group/content"
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsEditing(true);
                        }}
                    >
                        {text.trim() ? (
                            <div className={cn(
                                "prose prose-sm max-w-none prose-compact jot-markdown-content",
                                theme.text
                            )}>
                                <MarkdownRenderer content={text} />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
                                <div className="w-8 h-8 rounded-full bg-base-content/5 flex items-center justify-center mb-2">
                                    <Edit3 size={14} />
                                </div>
                                <span className="text-[10px] uppercase font-bold tracking-wider">
                                    {t('notes.quick_jot.double_click', 'Double-click to edit')}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Shortcut Hint - 移到底部中央，添加背景 */}
            {isEditing && (
                <div className={cn(
                    "absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full",
                    "text-[9px] font-medium opacity-60 pointer-events-none select-none",
                    "flex items-center gap-3 bg-base-content/5 backdrop-blur-sm",
                    theme.muted
                )}>
                    {/* 字数统计 */}
                    <span className="opacity-60">{text.length} {t('notes.quick_jot.chars', 'chars')}</span>
                    <span className="opacity-30">|</span>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 rounded bg-base-content/10 text-[8px] font-bold">Esc</kbd>
                        <span>{t('notes.quick_jot.to_save', 'save')}</span>
                    </span>
                    <span className="opacity-30">|</span>
                    <span>{t('notes.quick_jot.click_outside', 'click outside to save')}</span>
                </div>
            )}
        </div>
    );
};
