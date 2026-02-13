/**
 * UploadStep - File/Paste upload interface
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Upload, ArrowRight, ClipboardCopy, Plus, FileJson, FileSpreadsheet
} from 'lucide-react';
import { cn } from '../../../../app/utils/cn';
import { ImportStepper } from '../../../../components/import/ImportStepper';
import {
    JSON_TEMPLATE,
    CSV_TEMPLATE,
    downloadTextFile,
} from '../../../../lib/importUtils';
import type { UploadMode } from '../../state/importTypes';

export interface UploadStepProps {
    uploadMode: UploadMode;
    pasteValue: string;
    isDragging: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onUploadModeChange: (mode: UploadMode) => void;
    onPasteValueChange: (value: string) => void;
    onDraggingChange: (dragging: boolean) => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onFileDrop: (file: File) => void;
    onPasteImport: () => void;
    onReset: () => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({
    uploadMode,
    pasteValue,
    isDragging,
    fileInputRef,
    onUploadModeChange,
    onPasteValueChange,
    onDraggingChange,
    onFileUpload,
    onFileDrop,
    onPasteImport,
    // onReset is kept in props for API compatibility but not used in this component
}) => {
    const { t } = useTranslation('import');

    const handleSelectFileClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="relative h-screen w-full flex flex-col bg-base-300 text-base-content overflow-hidden">
            {/* Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-base-300" />
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_left,rgba(var(--p),0.05)_0%,transparent_50%)]" />
            </div>

            {/* Header */}
            <header className="relative z-30 shrink-0 flex items-center justify-between px-4 md:px-10 py-3 md:py-5 border-b border-base-content/5 bg-base-300/80 backdrop-blur-xl">
                {/* Left: Placeholder for layout balance */}
                <div className="flex items-center w-24">
                    {/* Reserved for future controls */}
                </div>

                {/* Center: Stepper */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <ImportStepper currentStep="upload" />
                </div>

                {/* Right: Mode switcher */}
                <div className="flex items-center">
                    <div className="flex p-1 bg-base-content/5 rounded-xl border border-base-content/5">
                        <button
                            onClick={() => onUploadModeChange('file')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                uploadMode === 'file'
                                    ? "bg-base-content text-base-300 shadow-md"
                                    : "text-base-content/40 hover:text-base-content/70"
                            )}
                        >
                            <Upload size={12} />
                            <span className="hidden sm:inline">{t('import.upload.tab_file')}</span>
                        </button>
                        <button
                            onClick={() => onUploadModeChange('paste')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                uploadMode === 'paste'
                                    ? "bg-base-content text-base-300 shadow-md"
                                    : "text-base-content/40 hover:text-base-content/70"
                            )}
                        >
                            <ClipboardCopy size={12} />
                            <span className="hidden sm:inline">{t('import.upload.tab_paste')}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-20 flex-1 flex flex-col overflow-hidden">
                {uploadMode === 'file' ? (
                    /* File Upload Mode */
                    <div
                        onDragOver={(e) => { e.preventDefault(); onDraggingChange(true); }}
                        onDragLeave={() => onDraggingChange(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            onDraggingChange(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) onFileDrop(file);
                        }}
                        onClick={handleSelectFileClick}
                        className={cn(
                            "flex-1 flex flex-col items-center justify-center p-8 cursor-pointer transition-colors duration-500",
                            isDragging ? "bg-primary/5" : "hover:bg-base-content/[0.01]"
                        )}
                    >
                        <div className="flex flex-col items-center text-center max-w-lg space-y-8">
                            {/* Icon */}
                            <div className={cn(
                                "w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-base-content/[0.03] border border-base-content/10 flex items-center justify-center transition-all duration-500",
                                isDragging && "scale-110 border-primary/50 bg-primary/10"
                            )}>
                                <Upload
                                    className={cn(
                                        "w-10 h-10 md:w-14 md:h-14 stroke-[1] transition-colors duration-500",
                                        isDragging ? "text-primary" : "text-base-content/20"
                                    )}
                                />
                            </div>

                            {/* Text */}
                            <div className="space-y-3">
                                <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-base-content">
                                    {isDragging ? t('import.upload.drop_hint') : t('import.upload.dropzone')}
                                </h2>
                                <p className="text-xs md:text-sm text-base-content/40">
                                    {t('import.upload.formats_hint')} • {t('import.upload.dropzone_hint')}
                                </p>
                            </div>

                            {/* Button */}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSelectFileClick(); }}
                                className="h-12 md:h-14 px-8 md:px-12 rounded-2xl bg-base-content text-base-300 text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center gap-3"
                            >
                                <Plus size={18} />
                                {t('import.upload.btn_select')}
                            </button>

                            {/* Template buttons */}
                            <div className="flex items-center gap-6 pt-4">
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadTextFile('template.csv', CSV_TEMPLATE, 'text/csv'); }}
                                    className="flex items-center gap-2 text-xs text-base-content/30 hover:text-primary transition-colors"
                                >
                                    <FileSpreadsheet size={14} />
                                    {t('import.upload.label_csv_template')}
                                </button>
                                <div className="w-px h-4 bg-base-content/10" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadTextFile('template.json', JSON.stringify(JSON_TEMPLATE, null, 2), 'application/json'); }}
                                    className="flex items-center gap-2 text-xs text-base-content/30 hover:text-primary transition-colors"
                                >
                                    <FileJson size={14} />
                                    {t('import.upload.label_json_template')}
                                </button>
                            </div>
                        </div>

                        <input
                            ref={fileInputRef}
                            id="import-file-upload"
                            name="file_upload"
                            type="file"
                            accept=".csv,.json"
                            hidden
                            onChange={onFileUpload}
                        />
                    </div>
                ) : (
                    /* Paste Mode */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-hidden p-4 md:p-6">
                            <textarea
                                id="import-paste-area"
                                name="paste_content"
                                value={pasteValue}
                                onChange={e => onPasteValueChange(e.target.value)}
                                placeholder={t('import.upload.paste_ph')}
                                className="w-full h-full bg-base-content/[0.02] rounded-2xl border border-base-content/10 p-4 md:p-8 text-base md:text-lg leading-relaxed outline-none resize-none text-base-content/80 placeholder:text-base-content/20 selection:bg-primary/30 selection:text-base-content focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>
                        <div className="shrink-0 px-6 md:px-10 py-4 border-t border-base-content/10 bg-base-300/80 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-center sm:text-left">
                                <p className="text-xs font-medium text-base-content/40">
                                    {t('import.upload.paste_hint_title')}
                                </p>
                                <p className="text-[10px] text-base-content/20">
                                    {t('import.upload.paste_hint_desc')}
                                </p>
                            </div>
                            <button
                                onClick={onPasteImport}
                                disabled={!pasteValue.trim()}
                                className="h-11 w-full sm:w-auto px-6 rounded-xl bg-primary text-primary-content text-sm font-semibold hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {t('import.upload.btn_analyze')}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="relative z-20 shrink-0 px-6 md:px-10 py-3 border-t border-base-content/5 flex items-center justify-between text-[10px] text-base-content/30">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-success/60" />
                        <span>{t('import.upload.privacy_title')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                        <span>{t('import.upload.security_title')}</span>
                    </div>
                </div>
                <div className="hidden sm:block">
                    {t('import.upload.tip_title')}: {t('import.upload.tip_desc').split('：')[0]}
                </div>
            </footer>
        </div>
    );
};
