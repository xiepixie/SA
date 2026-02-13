/**
 * ImportWizard - Step router component (V2 - Mutation Driven)
 *
 * Key changes:
 * - Uses selectedId instead of selectedIndex
 * - Loading/progress/result state comes from mutation, not reducer
 * - Accepts mutation object as prop for rendering import/done states
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../app/utils/cn';
import type { ImportPipelineResult } from '@v2/shared';
import type { UseMutationResult } from '@tanstack/react-query';
import { UploadStep } from './steps/UploadStep';
import { PreviewStep } from './steps/PreviewStep';
import { ImportingStep } from './steps/ImportingStep';
import { DoneStep } from './steps/DoneStep';
import type { UseImportWizardReturn } from '../hooks/useImportWizard';
import type { ImportMutationVariables } from '../hooks/useImportMutation';
import type { JsonFieldErrors } from '../state/importTypes';

export interface ImportWizardProps {
    wizard: UseImportWizardReturn;
    mutation: UseMutationResult<ImportPipelineResult, Error, ImportMutationVariables>;
    onImport: () => void;
    onNavigateToReview: () => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({
    wizard,
    mutation,
    onImport,
    onNavigateToReview,
}) => {
    const {
        state,
        dispatch,
        actions,
        filteredItems,
        stats,
        activeItem,
        validationErrors,
        canImport,
    } = wizard;

    // Render based on current step
    switch (state.step) {
        case 'upload':
            return (
                <UploadStep
                    uploadMode={state.uploadMode}
                    pasteValue={state.pasteValue}
                    isDragging={state.isDragging}
                    fileInputRef={wizard.fileInputRef}
                    onUploadModeChange={(mode) => dispatch(actions.setUploadMode(mode))}
                    onPasteValueChange={(value) => dispatch(actions.setPasteValue(value))}
                    onDraggingChange={(dragging) => dispatch(actions.setDragging(dragging))}
                    onFileUpload={wizard.handleFileUpload}
                    onFileDrop={(file) => wizard.handleImportData({ file })}
                    onPasteImport={wizard.handlePasteImport}
                    onReset={wizard.handleReset}
                />
            );

        case 'preview':
            return (
                <>
                    <PreviewStep
                        filteredItems={filteredItems}
                        stats={stats}
                        activeItem={activeItem}
                        validationErrors={validationErrors}
                        selectedId={state.selectedId}
                        sidebarCollapsed={state.sidebarCollapsed}
                        filterMode={state.filterMode}
                        workbenchMode={state.workbenchMode}
                        searchQuery={state.searchQuery}
                        previewUserAnswer={state.previewUserAnswer}
                        previewRevealed={state.previewRevealed}
                        jsonErrors={state.jsonErrors}
                        onSelectItem={(id) => dispatch(actions.selectItem(id))}
                        onToggleSidebar={() => dispatch(actions.toggleSidebar())}
                        onFilterModeChange={(mode) => dispatch(actions.setFilterMode(mode))}
                        onSearchQueryChange={(query) => dispatch(actions.setSearchQuery(query))}
                        onAutoCleanup={wizard.handleAutoCleanup}
                        onReset={wizard.handleReset}
                        onUpdateItem={wizard.updateItem}
                        onUpdateItemField={wizard.updateItemField}
                        onDeleteItem={wizard.deleteItem}
                        onSetJsonError={(field: keyof JsonFieldErrors, error: string | null) => dispatch(actions.setJsonError(field, error))}
                        onSetPreviewUserAnswer={(answer) => dispatch(actions.setPreviewUserAnswer(answer))}
                        onSetPreviewRevealed={(revealed) => dispatch(actions.setPreviewRevealed(revealed))}
                        wizard={wizard}
                    />
                    {/* Import action button - floating */}
                    <ImportActionButton
                        stats={stats}
                        isPending={mutation.isPending}
                        canImport={canImport}
                        onImport={onImport}
                        allowDuplicates={wizard.state.allowDuplicates}
                        onAllowDuplicatesChange={(allow) => dispatch(actions.setAllowDuplicates(allow))}
                    />
                </>
            );

        case 'importing':
            return (
                <ImportingStep
                    isPending={mutation.isPending}
                    itemCount={stats.valid}
                />
            );

        case 'done':
            return (
                <DoneStep
                    result={mutation.data as ImportPipelineResult}
                    error={mutation.error}
                    onReset={wizard.handleReset}
                    onNavigateToReview={onNavigateToReview}
                    onRetry={wizard.retryFailed}
                />
            );

        case 'error':
            return (
                <DoneStep
                    result={undefined} // No result summary on system error
                    error={mutation.error}
                    onReset={wizard.handleReset}
                    onNavigateToReview={onNavigateToReview}
                />
            );

        default:
            return null;
    }
};

// Floating import action button for preview step
interface ImportActionButtonProps {
    stats: { valid: number; errorCount: number; total: number };
    isPending: boolean;
    canImport: boolean;
    onImport: () => void;
    allowDuplicates: boolean;
    onAllowDuplicatesChange: (allow: boolean) => void;
}

const ImportActionButton: React.FC<ImportActionButtonProps> = ({
    stats,
    isPending,
    canImport,
    onImport,
    allowDuplicates,
    onAllowDuplicatesChange,
}) => {
    const { t } = useTranslation(['import', 'common', 'markdown']);
    const hasErrors = stats.errorCount > 0;

    return (
        <div className="fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="flex flex-col items-end gap-3">
                {hasErrors && (
                    <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">
                            {t('import.preview.status_blocked')}
                        </p>
                    </div>
                )}

                {stats.total > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-base-100/50 border border-base-content/10 backdrop-blur-md mb-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-xs checkbox-warning rounded-md"
                                checked={allowDuplicates}
                                onChange={(e) => onAllowDuplicatesChange(e.target.checked)}
                            />
                            <span className="text-xs font-bold opacity-80">
                                {t('import.preview.config.allow_duplicates', '允许导入重复项 (Allow Duplicates)')}
                            </span>
                        </label>
                    </div>
                )}
                <button
                    onClick={onImport}
                    disabled={isPending || !canImport}
                    className={cn(
                        "h-14 px-8 rounded-2xl text-sm font-black uppercase tracking-widest shadow-2xl transition-all flex items-center gap-3",
                        isPending || !canImport
                            ? "bg-base-content/10 text-base-content/20 cursor-not-allowed grayscale"
                            : "bg-primary text-primary-content shadow-primary/30 hover:scale-105 active:scale-95"
                    )}
                >
                    {isPending ? (
                        <span>{t('import.preview.status_importing', 'Importing...')}</span>
                    ) : (
                        <>
                            <span>{t('import.preview.btn_import_items', { count: stats.valid })}</span>
                            {stats.errorCount > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-base-content/10 text-xs opacity-50">
                                    {t('import.preview.status_skipped', { count: stats.errorCount })}
                                </span>
                            )}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
