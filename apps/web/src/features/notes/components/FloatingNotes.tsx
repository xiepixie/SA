import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { QuickJot } from './QuickJot';
import { X, Pin, PinOff, Palette, GripVertical, ChevronRight } from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { useAppStore } from '../../../app/state/useAppStore';
import { COLOR_KEYS, NOTE_COLORS, type NoteColor } from '../types/NoteTheme';

interface FloatingNotesProps {
    questionId: string;
    isOpen: boolean;
    onClose: () => void;
    isPinned: boolean;
    onTogglePin: () => void;
    onDock?: () => void;
}

export const FloatingNotes: React.FC<FloatingNotesProps> = ({
    questionId,
    isOpen,
    onClose,
    isPinned,
    onTogglePin,
    onDock
}) => {
    const { t } = useTranslation();
    const noteColor = useAppStore(s => s.noteSettings[questionId]?.color || 'yellow');
    const setNoteSetting = useAppStore(s => s.setNoteSetting);
    const theme = NOTE_COLORS[noteColor as NoteColor] || NOTE_COLORS.yellow;

    // Local state for dragging/position
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: window.innerWidth - 380, y: 120 });
    const [size, setSize] = useState({ width: 320, height: 380 });

    const [isDraggingState, setIsDraggingState] = useState(false);
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ w: 0, h: 0, x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        if (panelRef.current) {
            isDragging.current = true;
            setIsDraggingState(true);
            const rect = panelRef.current.getBoundingClientRect();
            dragOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            panelRef.current.setPointerCapture(e.pointerId);
        }
    };

    const handleResizeDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        isResizing.current = true;
        resizeStart.current = {
            w: size.width,
            h: size.height,
            x: e.clientX,
            y: e.clientY
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging.current) {
            const newX = e.clientX - dragOffset.current.x;
            const newY = e.clientY - dragOffset.current.y;
            setPosition({
                x: Math.max(0, Math.min(newX, window.innerWidth - size.width)),
                y: Math.max(0, Math.min(newY, window.innerHeight - size.height))
            });
        } else if (isResizing.current) {
            const deltaX = e.clientX - resizeStart.current.x;
            const deltaY = e.clientY - resizeStart.current.y;
            setSize({
                width: Math.max(280, resizeStart.current.w + deltaX),
                height: Math.max(200, resizeStart.current.h + deltaY)
            });
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDragging.current = false;
        setIsDraggingState(false);
        isResizing.current = false;
        panelRef.current?.releasePointerCapture(e.pointerId);
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={panelRef}
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                position: 'fixed',
                zIndex: 1000
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={cn(
                "rounded-2xl overflow-hidden flex flex-col shadow-premium-2xl backdrop-blur-xl border-2 ease-out transform-gpu",
                !isDraggingState && "transition-all duration-300",
                theme.bg, theme.border
            )}
        >
            {/* Unified Header & Toolbar */}
            <div
                className={cn(
                    "h-10 flex items-center justify-between px-3 select-none border-b transition-colors cursor-grab active:cursor-grabbing shrink-0",
                    "border-base-content/5 bg-base-content/[0.02]"
                )}
                onPointerDown={handlePointerDown}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <GripVertical size={12} className={theme.muted} />
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest", theme.muted)}>
                        {t('notes.floating.title', 'Floating Jot')}
                    </span>
                </div>

                <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    {/* Palette Toggle */}
                    <button
                        onClick={() => {
                            const colors = COLOR_KEYS;
                            const next = colors[(colors.indexOf(noteColor as any) + 1) % colors.length];
                            setNoteSetting(questionId, { color: next });
                        }}
                        className={cn("btn btn-ghost btn-xs btn-circle transition-colors", theme.hover)}
                        title={t('notes.floating.tooltip_theme', 'Style Theme')}
                    >
                        <Palette size={14} className={theme.text} strokeWidth={2.5} />
                    </button>

                    {/* Pin Logic Toggle */}
                    <button
                        onClick={onTogglePin}
                        className={cn(
                            "btn btn-ghost btn-xs btn-circle transition-all",
                            isPinned ? "text-primary bg-primary/10" : cn(theme.muted, theme.hover)
                        )}
                        title={isPinned ? t('notes.floating.tooltip_pin_locked', 'Pinned to current question (locked)') : t('notes.floating.tooltip_pin_dynamic', 'Following active question (dynamic)')}
                    >
                        {isPinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
                    </button>

                    {/* Dock Button (Restore to Sidebar) */}
                    {onDock && (
                        <button
                            onClick={onDock}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={cn("btn btn-ghost btn-xs btn-circle transition-all", theme.muted, theme.hover)}
                            title={t('notes.floating.tooltip_dock', 'Dock back to panel')}
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="btn btn-ghost btn-xs btn-circle opacity-30 hover:opacity-100 hover:bg-red-500/20 hover:text-red-600 transition-all ml-1"
                        title={t('notes.floating.tooltip_dismiss', 'Dismiss')}
                    >
                        <X size={14} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden flex flex-col">
                <QuickJot
                    questionId={questionId}
                    minimal={true}
                    className="flex-1 h-full"
                />
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-center p-1 group/resize"
                onPointerDown={handleResizeDown}
            >
                <div className="w-2 h-2 rounded-tl-sm border-r-2 border-b-2 border-base-content/20 group-hover/resize:border-primary/50 transition-colors" />
            </div>

            {/* Visual Indicator of Connection */}
            <div className="h-1.5 shrink-0 w-12 bg-base-content/5 mx-auto rounded-full mb-1 opacity-20 pointer-events-none" />
        </div>,
        document.body
    );
};
