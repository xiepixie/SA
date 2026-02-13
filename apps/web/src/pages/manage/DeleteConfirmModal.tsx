import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldAlert } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    itemName: string;
    itemType: string;
    title?: string;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
    isOpen, onClose, onConfirm, itemName, itemType, title
}) => {
    const { t } = useTranslation(['library', 'common']);
    const [isDeleting, setIsDeleting] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setIsDeleting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-300/40 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in duration-500"
                onClick={onClose}
            />

            <div
                className="relative w-full max-w-sm bg-base-100 border border-error/20 p-8 rounded-[2.5rem] shadow-premium-2xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 rounded-[2rem] bg-error/10 flex items-center justify-center text-error relative group">
                        <div className="absolute inset-0 bg-error/20 rounded-[2rem] motion-safe:animate-ping opacity-20" />
                        <ShieldAlert className="w-10 h-10 relative z-10 transition-transform duration-500 group-hover:scale-110" />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-2xl font-black text-base-content tracking-tight uppercase">
                            {title || t('manage.delete.title')}
                        </h3>
                        <p className="text-sm font-medium text-base-content/60 leading-relaxed px-4">
                            <Trans
                                i18nKey="library:manage.delete.desc"
                                values={{ type: t(`library:manage.types.${itemType}`), name: itemName }}
                                components={[<span key="name" className="text-error font-black underline underline-offset-4 decoration-current/30" />]}
                            />
                        </p>
                    </div>

                    <div className="flex w-full gap-3 pt-4">
                        <button
                            type="button"
                            className="btn btn-ghost flex-1 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-base-content/5"
                            onClick={onClose}
                            disabled={isDeleting}
                        >
                            {t('common:common.actions.cancel')}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isDeleting}
                            className="btn btn-error flex-1 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-error/20 active:scale-95 transition-all text-error-content font-black"
                        >
                            {isDeleting ? <span className="loading loading-spinner loading-xs" /> : t('common:common.actions.delete')}
                        </button>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-base-content/5 text-base-content/20 hover:text-base-content/60 transition-all"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>,
        document.body
    );
};
