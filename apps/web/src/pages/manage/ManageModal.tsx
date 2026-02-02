import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Bookmark, Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';
import { getEntityVisuals } from '../../app/utils/colorSystem';
import { EntityBadge } from '../../components/ui/EntityBadge';

interface ManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string, color: string }) => Promise<void>;
    initialData?: { name: string, color: string };
    type: 'subject' | 'tag';
    mode: 'create' | 'edit';
}

export const ManageModal: React.FC<ManageModalProps> = ({
    isOpen, onClose, onSubmit, initialData, type, mode
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialData?.name || '');
    const [color, setColor] = useState(initialData?.color || (type === 'subject' ? 'primary' : 'indigo'));
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || '');
            setColor(initialData?.color || (type === 'subject' ? 'primary' : 'secondary'));
        }
    }, [isOpen, initialData, type]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit({ name, color });
            onClose();
        } catch (err) {
            // Error handling is usually done by the parent via toast
        } finally {
            setIsSubmitting(false);
        }
    };

    const colorOptions = [
        { name: 'primary', class: 'bg-primary' },
        { name: 'indigo', class: 'bg-indigo-500' },
        { name: 'violet', class: 'bg-violet-500' },
        { name: 'teal', class: 'bg-teal-500' },
        { name: 'success', class: 'bg-emerald-500' },
        { name: 'info', class: 'bg-sky-500' },
        { name: 'warning', class: 'bg-amber-500' },
        { name: 'orange', class: 'bg-orange-500' },
        { name: 'error', class: 'bg-rose-500' },
        { name: 'fuchsia', class: 'bg-fuchsia-500' },
        { name: 'neutral', class: 'bg-slate-500' },
        { name: 'yellow', class: 'bg-yellow-600' },
    ];

    const visuals = getEntityVisuals(color, name);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-300/40 backdrop-blur-md animate-in fade-in duration-500"
                onClick={onClose}
            />

            <div
                className="relative w-full max-w-2xl bg-base-100 border border-base-content/10 rounded-[2.5rem] overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col md:flex-row min-h-[400px]">
                    {/* Left: Form */}
                    <form onSubmit={handleSubmit} className="flex-1 p-8 md:p-10 space-y-8">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 block">
                                {t('manage.modals.portal')}
                            </span>
                            <h3 className="text-3xl font-black text-base-content tracking-tight uppercase">
                                {mode === 'create' ? t(`manage.modals.create_${type}`) : t(`manage.modals.edit_${type}`)}
                            </h3>
                        </div>

                        <div className="space-y-6">
                            <div className="form-control w-full">
                                <label className="label py-1">
                                    <span className="label-text text-[10px] font-black uppercase tracking-widest text-base-content/40">{t('manage.modals.name_label')}</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder={t('manage.modals.name_ph')}
                                    className="input input-lg w-full bg-base-content/[0.03] border-base-content/10 rounded-2xl text-base font-black focus:border-primary/50 focus:bg-base-content/[0.06] focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text text-[10px] font-black uppercase tracking-widest text-base-content/40">{t('manage.modals.color_label')}</span>
                                </label>
                                <div className="grid grid-cols-6 gap-3 mt-2 w-fit">
                                    {colorOptions.map(c => {
                                        const optVis = getEntityVisuals(c.name);
                                        return (
                                            <button
                                                key={c.name}
                                                type="button"
                                                onClick={() => setColor(c.name)}
                                                className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2 shadow-sm",
                                                    optVis.dot,
                                                    color === c.name
                                                        ? "border-base-content ring-2 ring-offset-2 ring-offset-base-100 ring-base-content/30 scale-110 shadow-lg"
                                                        : "border-transparent hover:scale-110 opacity-70 hover:opacity-100"
                                                )}
                                            >
                                                {color === c.name && <Check className="w-5 h-5 text-white drop-shadow-md animate-in zoom-in duration-200" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                className="btn btn-ghost flex-1 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-base-content/5"
                                onClick={onClose}
                            >
                                {t('common.actions.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !name.trim()}
                                className="btn btn-primary flex-[2] h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all"
                            >
                                {isSubmitting ? <span className="loading loading-spinner loading-xs" /> : (mode === 'create' ? t('manage.modals.btn_deploy') : t('manage.modals.btn_save'))}
                            </button>
                        </div>
                    </form>

                    {/* Right: Live Preview */}
                    <div className="hidden md:flex w-72 bg-base-content/[0.02] border-l border-base-content/5 p-10 flex-col items-center justify-center text-center space-y-6 grayscale-[0.2] hover:grayscale-0 transition-all duration-500">
                        <div className="space-y-2 uppercase">
                            <span className="text-[10px] font-black text-base-content/20 tracking-widest">{t('manage.modals.preview_title')}</span>
                            <div className="h-px w-8 bg-base-content/10 mx-auto" />
                        </div>

                        {/* Preview Card */}
                        <div
                            className={cn(
                                "w-full aspect-square rounded-[2rem] p-8 flex flex-col justify-between items-center text-center shadow-2xl relative overflow-hidden border-2 transition-all duration-700",
                                visuals.bg,
                                visuals.border
                            )}
                            style={visuals.style as any}
                        >
                            <div
                                className={cn(
                                    "absolute inset-0 opacity-10 pointer-events-none bg-current",
                                    visuals.text,
                                    visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]"
                                )}
                            />

                            <div className={cn(
                                "w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-700 relative overflow-hidden border",
                                visuals.bg,
                                visuals.text,
                                visuals.border,
                                visuals.style && "bg-[hsla(var(--brand-h),var(--brand-s),var(--brand-l),0.1)]"
                            )}>
                                {type === 'subject' ? <Bookmark className="w-10 h-10" /> : <Hash className="w-10 h-10" />}
                            </div>

                            <div className="space-y-3 z-10">
                                <EntityBadge
                                    name={name || t('manage.modals.new_asset')}
                                    color={color}
                                    size="lg"
                                    showHash={type === 'tag'}
                                />
                                <p className="text-[10px] font-bold text-base-content/40 tracking-[0.3em] uppercase opacity-40">
                                    {t('manage.modals.preview_mode')}
                                </p>
                            </div>

                            <div className={cn(
                                "w-12 h-1 rounded-full",
                                visuals.dot,
                                visuals.style && "bg-[hsl(var(--brand-h),var(--brand-s),var(--brand-l))]"
                            )} />
                        </div>

                        <p className="text-[9px] font-bold text-base-content/30 uppercase leading-relaxed max-w-[140px]">
                            {t('manage.modals.propagate_hint')}
                        </p>
                    </div>
                </div>

                {/* Close Button (Floating) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-base-content/5 text-base-content/20 hover:text-base-content/60 transition-all z-20"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>,
        document.body
    );
};
