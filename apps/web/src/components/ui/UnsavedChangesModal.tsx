import React from 'react';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UnsavedChangesModalProps {
    isOpen: boolean;
    dirtyFields: string[];
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
}

/**
 * Premium Modal for Unsaved Changes
 * Centered, Glassmorphism, and fully localized.
 */
export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
    isOpen,
    dirtyFields,
    onSave,
    onDiscard,
    onCancel
}) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="sea">
            <div
                className="unsaved-modal-backdrop animate-in fade-in duration-300"
                onClick={onCancel}
            >
                <div
                    className="unsaved-modal animate-in zoom-in-95 slide-in-from-bottom-8 duration-500"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-start gap-5 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center shrink-0 shadow-inner">
                            <AlertTriangle className="w-7 h-7 text-warning" />
                        </div>
                        <div className="pt-1">
                            <h3 className="text-xl font-black mb-1.5 tracking-tight">
                                {t('library.unsaved_modal.title')}
                            </h3>
                            <p className="text-sm opacity-60 leading-relaxed max-w-[320px]">
                                {t('library.unsaved_modal.description')}
                            </p>
                        </div>
                    </div>

                    {/* Dirty Fields */}
                    {dirtyFields.length > 0 && (
                        <div className="mb-8">
                            <div className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-3">
                                {t('library.unsaved_modal.fields_label')}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {dirtyFields.map((field) => (
                                    <span key={field} className="unsaved-modal-chip">
                                        {field}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4">
                        <button
                            onClick={onCancel}
                            className="order-3 sm:order-1 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider bg-base-content/5 hover:bg-base-content/10 transition-all active:scale-95"
                        >
                            <X size={14} className="inline mr-2" />
                            {t('library.unsaved_modal.btn_cancel')}
                        </button>
                        <button
                            onClick={onDiscard}
                            className="order-2 sm:order-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider bg-error/10 text-error hover:bg-error/20 transition-all active:scale-95"
                        >
                            <Trash2 size={14} className="inline mr-2" />
                            {t('library.unsaved_modal.btn_discard')}
                        </button>
                        <button
                            onClick={onSave}
                            className="order-1 sm:order-3 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider bg-primary text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 active:scale-95"
                        >
                            <Save size={14} className="inline mr-2" />
                            {t('library.unsaved_modal.btn_save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UnsavedChangesModal;
