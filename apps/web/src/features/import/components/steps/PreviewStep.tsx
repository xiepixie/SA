/**
 * PreviewStep - Preview and edit import items before importing (V2 - ID-based)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutPanelLeft } from 'lucide-react';
import { ItemSidebar } from '../preview/ItemSidebar';
import { PropertyPanel } from '../preview/PropertyPanel';
import { SimulationPanel } from '../preview/SimulationPanel';
import type {
    ProcessedImportItem,
    ImportStats,
    FilterMode,
    WorkbenchMode,
    JsonFieldErrors,
} from '../../state/importTypes';
import type { ValidationIssue } from '../../../../lib/importUtils';
import type { UseImportWizardReturn } from '../../hooks/useImportWizard';

export interface PreviewStepProps {
    // Data
    filteredItems: ProcessedImportItem[];
    stats: ImportStats;
    activeItem: ProcessedImportItem | undefined;
    validationErrors: ValidationIssue[];
    selectedId: string | null;  // Changed from selectedIndex

    // UI State
    sidebarCollapsed: boolean;
    filterMode: FilterMode;
    workbenchMode: WorkbenchMode;
    searchQuery: string;
    previewUserAnswer: unknown;
    previewRevealed: boolean;
    jsonErrors: JsonFieldErrors;

    // Actions (ID-based)
    onSelectItem: (id: string | null) => void;  // Changed from index
    onToggleSidebar: () => void;
    onFilterModeChange: (mode: FilterMode) => void;
    onSearchQueryChange: (query: string) => void;
    onAutoCleanup: () => void;
    onReset: () => void;
    onUpdateItem: (id: string, updates: any) => void;  // Changed from index
    onUpdateItemField: (id: string, field: string, value: unknown) => void;  // Changed from index
    onDeleteItem: (id: string) => void;  // Changed from index
    onSetJsonError: (field: keyof JsonFieldErrors, error: string | null) => void;
    onSetPreviewUserAnswer: (answer: unknown) => void;
    onSetPreviewRevealed: (revealed: boolean) => void;
    wizard: UseImportWizardReturn;
}

export const PreviewStep: React.FC<PreviewStepProps> = ({
    filteredItems,
    stats,
    activeItem,
    validationErrors,
    selectedId,
    sidebarCollapsed,
    filterMode,
    workbenchMode,
    searchQuery,
    previewUserAnswer,
    previewRevealed,
    jsonErrors,
    onSelectItem,
    onToggleSidebar,
    onFilterModeChange,
    onSearchQueryChange,
    onAutoCleanup,
    onReset,
    onUpdateItem,
    onUpdateItemField,
    onDeleteItem,
    onSetJsonError,
    onSetPreviewUserAnswer,
    onSetPreviewRevealed,
    wizard,
}) => {
    const { t } = useTranslation(['import', 'common']);
    const { state, dispatch, actions } = wizard;

    return (
        <div className="relative h-screen flex flex-col overflow-hidden bg-base-300 text-base-content selection:bg-primary/30">
            {/* Refined Page Background */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-base-300" />
                <div className="absolute h-px w-full top-0 left-0 bg-gradient-to-r from-transparent via-base-content/10 to-transparent" />
            </div>

            <div className="flex-1 flex overflow-hidden relative z-10 w-full max-w-[1920px] mx-auto bg-base-300 shadow-2xl">
                {/* Sidebar */}
                <ItemSidebar
                    filteredItems={filteredItems}
                    stats={stats}
                    selectedId={selectedId}
                    sidebarCollapsed={sidebarCollapsed}
                    filterMode={filterMode}
                    searchQuery={searchQuery}
                    onSelectItem={onSelectItem}
                    onToggleSidebar={onToggleSidebar}
                    onFilterModeChange={onFilterModeChange}
                    onSearchQueryChange={onSearchQueryChange}
                    onAutoCleanup={onAutoCleanup}
                    onReset={onReset}
                />

                {/* Studio Workbench */}
                <main className="flex-1 flex overflow-hidden relative">
                    {activeItem ? (
                        <div className="flex-1 flex divide-x divide-base-content/5 overflow-hidden">
                            {/* Property Panel (Input) */}
                            <PropertyPanel
                                activeItem={activeItem}
                                workbenchMode={workbenchMode}
                                jsonErrors={jsonErrors}
                                validationErrors={validationErrors}
                                focusTrigger={state.focusTrigger}
                                onUpdateItem={onUpdateItem}
                                onUpdateItemField={onUpdateItemField}
                                onDeleteItem={onDeleteItem}
                                onSetJsonError={onSetJsonError}
                            />

                            {/* Simulation Panel (Output) */}
                            <SimulationPanel
                                activeItem={activeItem}
                                validationErrors={validationErrors}
                                workbenchMode={workbenchMode}
                                previewUserAnswer={previewUserAnswer}
                                previewRevealed={previewRevealed}
                                onSetPreviewUserAnswer={onSetPreviewUserAnswer}
                                onSetPreviewRevealed={onSetPreviewRevealed}
                                onJumpToProblem={wizard.jumpToProblem}
                                onFocusField={(field) => dispatch(actions.focusField(field))}
                                onToggleWorkbenchMode={() => {
                                    const next = workbenchMode === 'preview' ? 'split' : 'preview';
                                    dispatch(actions.setWorkbenchMode(next));
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-32 text-center opacity-[0.03] select-none grayscale cursor-default hover:opacity-10 transition-all duration-2000 ease-spring">
                            <LayoutPanelLeft size={160} strokeWidth={0.2} className="animate-spin-slow" />
                            <div className="mt-16 space-y-6">
                                <h4 className="text-4xl font-black uppercase tracking-[0.8em]">{t('import:import.preview.untitled_object')}</h4>
                                <p className="text-sm font-bold tracking-[0.5em] uppercase opacity-60 animate-pulse">{t('common:common.search_placeholder').split('…')[0]}</p>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
