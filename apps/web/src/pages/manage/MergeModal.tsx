import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Combine, ArrowRight, Search, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';
import { EntityBadge } from '../../components/ui/EntityBadge';

interface Asset {
    id: string;
    name: string;
    color: string;
    questionCount?: number;
    nodeCount?: number;
}

interface MergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMerge: (sourceId: string, targetId: string) => Promise<void>;
    items: Asset[];
    type: 'subject' | 'tag';
}

export const MergeModal: React.FC<MergeModalProps> = ({
    isOpen, onClose, onMerge, items, type
}) => {
    const { t } = useTranslation();
    const [sourceId, setSourceId] = useState<string>('');
    const [targetId, setTargetId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredItems = useMemo(() =>
        items.filter((item: Asset) => item.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [items, searchTerm]);

    if (!isOpen) return null;

    const source = items.find(i => i.id === sourceId);
    const target = items.find(i => i.id === targetId);

    const handleMerge = async () => {
        if (!sourceId || !targetId || sourceId === targetId) return;
        setIsSubmitting(true);
        try {
            await onMerge(sourceId, targetId);
            onClose();
        } catch (err) {
            // Error managed by parent
        } finally {
            setIsSubmitting(false);
        }
    };


    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-300/40 backdrop-blur-md animate-in fade-in duration-500"
                onClick={onClose}
            />

            <div
                className="relative w-full max-w-4xl bg-base-100 border border-base-content/10 rounded-[2.5rem] overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-8 border-b border-base-content/5 flex justify-between items-center bg-base-content/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 text-primary rounded-2xl shadow-sm">
                            <Combine className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-base-content tracking-tight uppercase">
                                {t('manage.merge.title')}
                            </h3>
                            <p className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em] mt-1">
                                {t('manage.merge.subtitle', { type: t(`manage.types.${type}`) })}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-base-content/5 rounded-full transition-colors text-base-content/20 hover:text-base-content/60">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Left: Selector */}
                    <div className="flex-[1.2] border-r border-base-content/5 p-8 overflow-hidden flex flex-col gap-6 bg-base-content/[0.01]">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/20 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder={t('manage.merge.filter', { type: t(`manage.types.${type}`) })}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-12 pl-12 pr-4 bg-base-content/[0.03] border border-base-content/5 rounded-xl text-sm font-bold focus:bg-base-content/[0.06] focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {filteredItems.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        if (!sourceId) setSourceId(item.id);
                                        else if (!targetId && item.id !== sourceId) setTargetId(item.id);
                                        else if (item.id === sourceId) setSourceId('');
                                        else if (item.id === targetId) setTargetId('');
                                        else setTargetId(item.id);
                                    }}
                                    className={cn(
                                        "p-4 rounded-2xl flex items-center justify-between cursor-pointer border-2 transition-all active:scale-[0.98]",
                                        sourceId === item.id ? "border-primary bg-primary/5 shadow-premium-sm" :
                                            targetId === item.id ? "border-secondary bg-secondary/5 shadow-premium-sm" :
                                                "border-transparent bg-base-content/[0.02] hover:bg-base-content/[0.04]"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <EntityBadge
                                            name={item.name}
                                            color={item.color}
                                            size="sm"
                                        />
                                        <div>
                                            <p className="text-[9px] font-bold text-base-content/30 uppercase leading-none mt-0.5">{item.questionCount || item.nodeCount || 0} {t('manage.subjects.questions')}</p>
                                        </div>
                                    </div>
                                    {sourceId === item.id && <span className="text-[9px] font-black uppercase text-primary bg-primary/10 px-2 py-1 rounded-md">{t('manage.merge.source')}</span>}
                                    {targetId === item.id && <span className="text-[9px] font-black uppercase text-secondary bg-secondary/10 px-2 py-1 rounded-md">{t('manage.merge.target')}</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Flow Visualizer */}
                    <div className="flex-1 p-10 flex flex-col items-center justify-between text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-secondary/[0.02] pointer-events-none" />

                        <div className="space-y-10 w-full flex flex-col items-center relative z-10">
                            <div className="space-y-2 uppercase">
                                <span className="text-[10px] font-black text-base-content/20 tracking-[0.3em]">{t('manage.merge.pipeline')}</span>
                                <div className="h-px w-12 bg-base-content/10 mx-auto" />
                            </div>

                            <div className="flex flex-col items-center gap-6 w-full">
                                {/* Source Card */}
                                <div className={cn(
                                    "w-full max-w-[240px] p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3",
                                    source ? "border-primary bg-primary/5 shadow-premium-lg" : "border-dashed border-base-content/10 text-base-content/10 p-10"
                                )}>
                                    {source ? (
                                        <>
                                            <EntityBadge
                                                name={source.name}
                                                color={source.color}
                                                size="md"
                                                className="shadow-premium-xl"
                                                interactive
                                            />
                                            <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-2">{t('manage.merge.deleted_hint')}</p>
                                        </>
                                    ) : (
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('manage.merge.select_source')}</p>
                                    )}
                                </div>

                                <div className="text-base-content/10 animate-pulse">
                                    <ArrowRight className="w-8 h-8 rotate-90 md:rotate-0" />
                                </div>

                                {/* Target Card */}
                                <div className={cn(
                                    "w-full max-w-[240px] p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3",
                                    target ? "border-secondary bg-secondary/5 shadow-premium-lg" : "border-dashed border-base-content/10 text-base-content/10 p-10"
                                )}>
                                    {target ? (
                                        <>
                                            <EntityBadge
                                                name={target.name}
                                                color={target.color}
                                                size="md"
                                                className="shadow-premium-xl ring-4 ring-secondary/20"
                                                interactive
                                            />
                                            <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-2">{t('manage.merge.absorb_hint')}</p>
                                        </>
                                    ) : (
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('manage.merge.select_target')}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="w-full space-y-6 relative z-10">
                            <div className="flex items-start gap-4 p-5 rounded-2xl bg-warning/10 border border-warning/20 text-left">
                                <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold text-amber-700/80 leading-relaxed uppercase tracking-tight">
                                    {t('manage.merge.critical_warning')}
                                </p>
                            </div>

                            <button
                                onClick={handleMerge}
                                disabled={!sourceId || !targetId || isSubmitting}
                                className="w-full h-14 bg-primary text-primary-content rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale"
                            >
                                {isSubmitting ? <span className="loading loading-spinner loading-xs" /> : t('manage.merge.btn_initiate')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
