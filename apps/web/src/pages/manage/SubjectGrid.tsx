import React, { useState } from 'react';
import { Layers, Edit3, Trash2, Plus, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';
import { getEntityVisuals } from '../../app/utils/colorSystem';

// Import shared type from central API layer
import { type Subject } from '../../app/api/views';
export type { Subject } from '../../app/api/views';

interface SubjectGridProps {
    subjects: Subject[];
    onEdit: (subject: Subject) => void;
    onDelete: (subject: Subject) => void;
    onCreate: () => void;
    onQuickUpdate: (id: string, color: string) => Promise<void>;
}

export const SubjectGrid: React.FC<SubjectGridProps> = ({ subjects, onEdit, onDelete, onCreate, onQuickUpdate }) => {
    return (
        <div className="manage-grid animate-in fade-in slide-in-from-bottom-6 duration-700">
            {subjects.map((subject) => (
                <SubjectCard
                    key={subject.id}
                    subject={subject}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onQuickUpdate={onQuickUpdate}
                />
            ))}

            {/* Create Card (Ghost Variant) */}
            <div
                onClick={onCreate}
                className="relative group min-h-[280px] rounded-[2rem] border-2 border-dashed border-base-content/10 flex flex-col items-center justify-center gap-6 cursor-pointer transition-all duration-500 hover:border-primary/40 hover:bg-primary/[0.02] active:scale-[0.98] overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                <div className="w-16 h-16 rounded-[1.5rem] bg-base-content/[0.03] border border-base-content/5 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-500 relative z-10 shadow-sm">
                    <Plus className="w-8 h-8" />
                </div>

                <div className="text-center relative z-10">
                    <span className="text-sm font-black uppercase tracking-[0.2em] block text-base-content/40 group-hover:text-primary transition-colors duration-500">
                        New Subject
                    </span>
                    <span className="text-[10px] font-bold text-base-content/15 uppercase tracking-tight mt-2 block">
                        Tap to create a new shelf
                    </span>
                </div>

                {/* Decorative dots in corners */}
                <div className="absolute top-4 left-4 w-1 h-1 rounded-full bg-base-content/10" />
                <div className="absolute top-4 right-4 w-1 h-1 rounded-full bg-base-content/10" />
                <div className="absolute bottom-4 left-4 w-1 h-1 rounded-full bg-base-content/10" />
                <div className="absolute bottom-4 right-4 w-1 h-1 rounded-full bg-base-content/10" />
            </div>
        </div>
    );
};

const SubjectCard: React.FC<{
    subject: Subject;
    onEdit: (s: Subject) => void;
    onDelete: (s: Subject) => void;
    onQuickUpdate: (id: string, color: string) => Promise<void>;
}> = ({ subject, onEdit, onDelete, onQuickUpdate }) => {
    const { t } = useTranslation();
    const [previewColor, setPreviewColor] = useState<string>(subject.color);
    const [isUpdating, setIsUpdating] = useState(false);

    const visuals = getEntityVisuals(previewColor, subject.name);

    const handleQuickUpdate = async (color: string) => {
        if (color === subject.color) return;
        setIsUpdating(true);
        try {
            await onQuickUpdate(subject.id, color);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div
            className={cn(
                "manage-card group transition-all duration-700 relative overflow-hidden flex flex-col justify-between border-2 pt-1.5",
                visuals.border,
                visuals.style ? "shadow-lg" : "shadow-xl",
                isUpdating ? "scale-[0.98] opacity-60 pointer-events-none" : "hover:scale-[1.02] shadow-premium-xl"
            )}
            style={visuals.style as any}
            onMouseLeave={() => setPreviewColor(subject.color)}
        >
            {/* Top Accent Bar (Liquid Glow) */}
            <div className={cn(
                "absolute top-0 left-0 right-0 h-1.5 transition-all duration-700 z-20",
                visuals.dot,
                visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]",
                "shadow-[0_2px_10px_rgba(0,0,0,0.1)]"
            )} />

            {/* Ambient Background Tint (Subtle Radial) */}
            <div className={cn(
                "absolute inset-0 bg-current opacity-[0.03] transition-colors duration-700",
                visuals.text,
                visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]"
            )} />

            {/* Inner Glow Aura */}
            <div className={cn(
                "absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[80px] transition-colors duration-1000 opacity-20",
                visuals.bg,
                visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]"
            )} />

            {isUpdating && (
                <div className="absolute inset-0 bg-base-100/40 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="flex flex-col items-center gap-2">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Updating</span>
                    </div>
                </div>
            )}

            <div className="relative z-10 flex justify-between items-start mb-6">
                <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-700 relative overflow-hidden group-hover:rotate-6 border",
                    visuals.bg,
                    visuals.text,
                    visuals.border,
                    visuals.style && "bg-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),0.1)] text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-5%))]"
                )}>
                    {/* Inner Glow Effect */}
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <Layers className="w-8 h-8 relative z-10" strokeWidth={1.5} />
                </div>

                {/* Quick Actions & Palette */}
                <div className="flex flex-col items-end gap-3 translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <button
                            onClick={() => onEdit(subject)}
                            className="p-2.5 rounded-xl bg-base-100/50 backdrop-blur-md border border-base-content/5 text-base-content/40 hover:text-primary hover:border-primary/30 transition-all shadow-sm"
                        >
                            <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onDelete(subject)}
                            className="p-2.5 rounded-xl bg-base-100/50 backdrop-blur-md border border-base-content/5 text-base-content/40 hover:text-error hover:border-error/30 transition-all shadow-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Premium Glass Palette Container */}
                    <div className="grid grid-cols-6 gap-2 p-2 rounded-2xl bg-base-100/40 backdrop-blur-xl border border-base-content/10 opacity-0 group-hover:opacity-100 transition-all duration-700 delay-75 shadow-premium-lg w-fit">
                        {['primary', 'indigo', 'violet', 'teal', 'success', 'info', 'warning', 'orange', 'error', 'fuchsia', 'neutral', 'yellow'].map(c => {
                            const optVis = getEntityVisuals(c);
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onMouseEnter={() => setPreviewColor(c)}
                                    onClick={() => handleQuickUpdate(c)}
                                    className={cn(
                                        "w-3.5 h-3.5 rounded-full cursor-pointer transition-all duration-300 border-2 border-white/20 select-none",
                                        optVis.dot,
                                        previewColor === c
                                            ? "scale-125 ring-4 ring-current/20 z-10 shadow-lg border-white"
                                            : "opacity-40 hover:opacity-100 hover:scale-110"
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="relative z-10 space-y-6">
                <div>
                    {/* Replaced manual dot and text with EntityBadge logic for consistent visuals using the Layers icon */}
                    <div className="flex flex-col gap-3">
                        <h3 className={cn(
                            "text-2xl font-black tracking-tighter leading-none transition-colors duration-700",
                            visuals.text,
                            visuals.style && "text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-10%))]"
                        )}>
                            {subject.name}
                        </h3>
                        <div className="flex items-center gap-2 opacity-60">
                            {/* We can use a small EntityBadge or just keep the text ref, let's keep it simple for now as per user request to fix colors/icons */}
                            <div className={cn(
                                "w-2 h-2 rounded-full transition-colors duration-700",
                                visuals.dot,
                                visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]"
                            )} />
                            <p className="text-[10px] font-black text-base-content/40 uppercase tracking-[0.2em]">
                                REF: {subject.id.slice(0, 8)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="h-11 px-5 rounded-2xl bg-base-content/[0.03] border border-base-content/[0.02] flex items-center gap-3 transition-all hover:bg-base-content/[0.05]">
                        <span className="text-base font-black text-base-content/80">{subject.questionCount}</span>
                        <span className="text-[10px] font-black text-base-content/30 uppercase tracking-widest">{t('manage.subjects.questions')}</span>
                    </div>
                    <div className="h-11 px-5 rounded-2xl bg-base-content/[0.03] border border-base-content/[0.02] flex items-center gap-3 transition-all hover:bg-base-content/[0.05]">
                        <span className="text-base font-black text-base-content/80">{subject.cardCount}</span>
                        <span className="text-[10px] font-black text-base-content/30 uppercase tracking-widest">{t('manage.subjects.cards')}</span>
                    </div>
                </div>

                <button
                    onClick={() => onEdit(subject)}
                    className={cn(
                        "w-full h-14 rounded-[1.25rem] flex items-center justify-center gap-3 group/btn transition-all duration-700 font-black text-[11px] uppercase tracking-[0.25em] shadow-lg",
                        visuals.bg,
                        visuals.text,
                        visuals.border,
                        visuals.style && "bg-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),0.1)] text-[hsl(var(--brand-h),var(--brand-s),calc(var(--brand-l)-10%))] border-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),0.2)]",
                        "hover:ring-4 hover:ring-current/5 shadow-current/5"
                    )}
                >
                    <span>{t('common.actions.edit')}</span>
                    <ArrowRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1.5" />
                </button>
            </div>
        </div>
    );
};
