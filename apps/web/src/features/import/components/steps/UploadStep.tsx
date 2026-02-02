/**
 * UploadStep - File/Paste upload interface
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft, Upload, ArrowRight, Sparkles, ClipboardCopy
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
    onReset,
}) => {
    const { t } = useTranslation();

    return (
        <div className="relative min-h-screen w-full flex flex-col bg-base-300 text-base-content selection:bg-primary/30 overflow-x-hidden">
            {/* Immersive Cinematic Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-base-300" />
                <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] bg-primary/5 dark:bg-primary/10 rounded-full blur-[180px] animate-pulse-subtle" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-accent/5 rounded-full blur-[180px] animate-pulse-subtle delay-1000" />
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.1] bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E')] mix-blend-overlay" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(var(--bc),0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--bc),0.02)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
            </div>

            {/* Top Navigation Bar */}
            <header className="relative z-20 flex items-center justify-between px-8 py-6 backdrop-blur-md border-b border-white/5">
                <button
                    onClick={onReset}
                    className="group flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 hover:text-base-content transition-all active:scale-95"
                >
                    <div className="w-8 h-8 rounded-xl bg-base-content/5 border border-base-content/5 flex items-center justify-center group-hover:bg-base-content/10 group-hover:border-base-content/10 transition-all">
                        <ArrowLeft size={14} />
                    </div>
                    {t('common.actions.exit')}
                </button>

                <div className="absolute left-1/2 -translate-x-1/2">
                    <ImportStepper currentStep="upload" />
                </div>

                <div className="w-24" /> {/* Spacer for balance */}
            </header>

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 md:p-12">
                <div className="max-w-4xl w-full space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 ease-spring">
                    {/* Compact Title Section */}
                    <div className="text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-base-content leading-tight">
                            {t('import.upload.title_main')}
                            <span className="text-primary italic ml-3">{t('import.upload.title_accent')}</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/20 flex items-center justify-center gap-4">
                            <span className="h-px w-8 bg-base-content/5" />
                            {t('import.upload.badge')}
                            <span className="h-px w-8 bg-base-content/5" />
                        </p>
                    </div>

                    {/* Mode Switcher */}
                    <div className="flex justify-center">
                        <div className="flex p-1.5 bg-base-content/5 backdrop-blur-2xl rounded-2xl border border-base-content/10 shadow-2xl">
                            <button
                                onClick={() => onUploadModeChange('file')}
                                className={cn(
                                    "flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300",
                                    uploadMode === 'file' ? "bg-base-content text-base-100 shadow-xl scale-105" : "text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5"
                                )}
                            >
                                <Upload size={14} /> {t('import.upload.tab_file')}
                            </button>
                            <button
                                onClick={() => onUploadModeChange('paste')}
                                className={cn(
                                    "flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300",
                                    uploadMode === 'paste' ? "bg-base-content text-base-100 shadow-xl scale-105" : "text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5"
                                )}
                            >
                                <ClipboardCopy size={14} /> {t('import.upload.tab_paste')}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
                        <div className="lg:col-span-12 space-y-12">
                            {uploadMode === 'file' ? (
                                <div
                                    onDragOver={(e) => { e.preventDefault(); onDraggingChange(true); }}
                                    onDragLeave={() => onDraggingChange(false)}
                                    onDrop={(e) => {
                                        e.preventDefault(); onDraggingChange(false);
                                        const file = e.dataTransfer.files?.[0];
                                        if (file) onFileDrop(file);
                                    }}
                                    className={cn(
                                        "relative group/card p-12 md:p-20 rounded-[3rem] border-2 border-dashed transition-all duration-700 ease-spring overflow-hidden flex flex-col items-center justify-center text-center",
                                        isDragging
                                            ? "border-primary bg-primary/5 scale-[1.01] shadow-[0_0_80px_rgba(var(--p),0.1)]"
                                            : "border-base-content/5 bg-base-content/[0.02] hover:border-base-content/10 hover:bg-base-content/[0.04]"
                                    )}
                                >
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--p),0.05),transparent_70%)] opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000" />

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="relative w-20 h-20 mb-8 rounded-full bg-base-content/5 border border-base-content/10 flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-95 group/icon"
                                    >
                                        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl opacity-0 group-hover/icon:opacity-100 transition-opacity" />
                                        <Upload size={32} strokeWidth={1.5} className="text-base-content/40 group-hover/icon:text-primary transition-colors" />
                                    </button>

                                    <div className="space-y-10 relative z-10">
                                        <div className="space-y-4">
                                            <h3 className="text-2xl font-black tracking-tight tracking-tight text-base-content">{t('import.upload.drop_hint')}</h3>
                                            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-base-content/20">{t('import.upload.formats_hint')}</p>
                                        </div>

                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="h-14 px-12 rounded-2xl bg-base-content text-base-100 text-[13px] font-black uppercase tracking-[0.1em] hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-3 mx-auto"
                                        >
                                            <Sparkles size={18} /> {t('import.upload.btn_select')}
                                        </button>

                                        <div className="flex items-center justify-center gap-8 pt-8 opacity-20 hover:opacity-100 transition-opacity text-base-content">
                                            <button onClick={() => downloadTextFile('template.csv', CSV_TEMPLATE, 'text/csv')} className="text-[10px] font-black uppercase tracking-widest hover:text-primary transition-colors">{t('import.upload.label_csv_template')}</button>
                                            <div className="h-4 w-px bg-base-content/20" />
                                            <button onClick={() => downloadTextFile('template.json', JSON.stringify(JSON_TEMPLATE, null, 2), 'application/json')} className="text-[10px] font-black uppercase tracking-widest hover:text-primary transition-colors">{t('import.upload.label_json_template')}</button>
                                        </div>
                                    </div>
                                    <input ref={fileInputRef} id="import-file-upload" name="file_upload" type="file" accept=".csv,.json" hidden onChange={onFileUpload} />
                                </div>
                            ) : (
                                <div className="relative group/paste p-2 bg-base-content/5 rounded-[4rem] border border-base-content/5 backdrop-blur-3xl focus-within:ring-2 focus-within:ring-primary/40 transition-all duration-700 text-base-content">
                                    <textarea
                                        id="import-paste-area"
                                        name="paste_content"
                                        value={pasteValue}
                                        onChange={e => onPasteValueChange(e.target.value)}
                                        placeholder={t('import.upload.paste_ph')}
                                        className="w-full h-[500px] bg-transparent p-12 text-lg font-medium leading-relaxed outline-none border-none placeholder:text-base-content/5 custom-scrollbar resize-none text-base-content/80 selection:bg-primary/40"
                                    />
                                    <div className="p-10 border-t border-base-content/5 flex items-center justify-between bg-base-content/[0.02] rounded-b-[4rem]">
                                        <div className="space-y-1 text-left">
                                            <p className="text-xs font-black uppercase tracking-widest text-base-content/40">{t('import.upload.paste_hint_title')}</p>
                                            <p className="text-[11px] font-bold text-base-content/10">{t('import.upload.paste_hint_desc')}</p>
                                        </div>
                                        <button
                                            onClick={onPasteImport}
                                            disabled={!pasteValue.trim()}
                                            className="h-14 px-12 rounded-2xl bg-primary text-primary-content text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 disabled:opacity-20 transition-all shadow-xl shadow-primary/20 flex items-center gap-4"
                                        >
                                            {t('import.upload.btn_analyze')} <ArrowRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
