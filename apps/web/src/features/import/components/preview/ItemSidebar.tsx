/**
 * ItemSidebar - Left sidebar with item list, stats, search and filters (V2 - ID-based)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Search, Wand2, PanelLeftClose, PanelRightClose,
    Layers, AlertTriangle, AlertCircle, Lightbulb, Zap
} from 'lucide-react';
import { cn } from '../../../../app/utils/cn';
import { MarkdownRenderer } from '../../../../components/LatexRenderer';
import type { ProcessedImportItem, ImportStats, FilterMode } from '../../state/importTypes';
import { getItemId } from '../../state/importTypes';

export interface ItemSidebarProps {
    // Data
    filteredItems: ProcessedImportItem[];
    stats: ImportStats;
    selectedId: string | null;

    // UI State
    sidebarCollapsed: boolean;
    filterMode: FilterMode;
    searchQuery: string;

    // Actions
    onSelectItem: (id: string | null) => void;
    onToggleSidebar: () => void;
    onFilterModeChange: (mode: FilterMode) => void;
    onSearchQueryChange: (query: string) => void;
    onAutoCleanup: () => void;
    onReset: () => void;
}

export const ItemSidebar: React.FC<ItemSidebarProps> = ({
    filteredItems,
    stats,
    selectedId,
    sidebarCollapsed,
    filterMode,
    searchQuery,
    onSelectItem,
    onToggleSidebar,
    onFilterModeChange,
    onSearchQueryChange,
    onAutoCleanup,
    // onReset is kept in props for API compatibility but not used in this component
}) => {
    const { t } = useTranslation();

    return (
        <aside className={cn(
            "flex flex-col border-r border-base-content/5 bg-base-100/40 backdrop-blur-3xl transition-all duration-700 ease-spring shrink-0 relative z-20",
            sidebarCollapsed ? "w-16" : "w-[320px]"
        )}>
            {/* Sidebar Header with Search & Toggle */}
            <div className={cn(
                "border-b border-base-content/5 transition-all duration-500 flex flex-col gap-4 shrink-0",
                sidebarCollapsed ? "p-3" : "p-4"
            )}>
                <div className={cn(
                    "flex items-center gap-3",
                    sidebarCollapsed && "flex-col"
                )}>
                    {!sidebarCollapsed && (
                        <div className="flex-1 relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/20 group-focus-within:text-primary transition-colors" />
                            <input
                                id="import-sidebar-search"
                                value={searchQuery}
                                onChange={e => onSearchQueryChange(e.target.value)}
                                placeholder={t('import.preview.search_ph')}
                                className="w-full h-9 bg-base-content/5 border border-base-content/5 rounded-xl pl-9 pr-3 text-[11px] font-bold outline-none focus:bg-base-content/10 focus:border-primary/20 transition-all text-base-content placeholder:opacity-40"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => onSearchQueryChange('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md hover:bg-base-content/10 flex items-center justify-center text-base-content/30"
                                >
                                    <span className="text-xs">×</span>
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        onClick={onToggleSidebar}
                        className={cn(
                            "w-10 h-10 rounded-xl bg-base-content/5 hover:bg-secondary/10 flex items-center justify-center text-base-content/30 hover:text-secondary transition-all shrink-0",
                            !sidebarCollapsed && "ml-1"
                        )}
                        title={sidebarCollapsed ? t('common.actions.expand') : t('common.actions.collapse')}
                    >
                        {sidebarCollapsed ? <PanelRightClose size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                </div>

                {!sidebarCollapsed && (
                    <div className="flex items-center justify-between px-1 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-0.5">
                            <h2 className="text-[9px] font-black uppercase tracking-[0.3em] text-base-content/20">{t('import.preview.studio_pipeline')}</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black tabular-nums">{stats.total}</span>
                                <span className="text-[10px] font-bold opacity-30 mt-1">{t('common.status.items')}</span>
                            </div>
                        </div>
                        <div className="flex gap-1.5 bg-base-content/5 p-1 rounded-xl">
                            {(['all', 'error', 'warning'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => onFilterModeChange(mode)}
                                    className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all relative group",
                                        filterMode === mode ? "bg-base-100 text-primary shadow-sm" : "text-base-content/20 hover:text-base-content/40"
                                    )}
                                    title={t(`import.preview.filter_${mode}`)}
                                >
                                    {mode === 'all' && <Layers size={14} />}
                                    {mode === 'error' && <AlertTriangle size={14} className={filterMode === mode ? "text-rose-500" : ""} />}
                                    {mode === 'warning' && <AlertCircle size={14} className={filterMode === mode ? "text-amber-500" : ""} />}

                                    {mode !== 'all' && stats[`${mode}Count` as keyof ImportStats] > 0 && (
                                        <div className={cn(
                                            "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-base-100 text-[8px] font-black flex items-center justify-center text-white",
                                            mode === 'error' ? "bg-rose-500" : "bg-amber-500"
                                        )}>
                                            {stats[`${mode}Count` as keyof ImportStats]}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Item List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar-hide hover:custom-scrollbar p-3 space-y-1">
                {filteredItems.map((item) => (
                    <SidebarItem
                        key={getItemId(item)}
                        item={item}
                        isSelected={selectedId === getItemId(item)}
                        sidebarCollapsed={sidebarCollapsed}
                        onSelectItem={onSelectItem}
                        t={t}
                    />
                ))}
            </div>

            {/* Sidebar Footer with Optimize button - only shown when there are issues */}
            {!sidebarCollapsed && (stats.errorCount > 0 || stats.warningCount > 0) && (
                <div className="p-4 border-t border-base-content/5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <button
                        onClick={onAutoCleanup}
                        title={t('import.preview.btn_optimize_tooltip')}
                        className="w-full h-12 flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 text-primary border border-primary/20 hover:from-primary hover:to-primary hover:text-primary-content hover:border-primary transition-all duration-300 active:scale-[0.98] group font-semibold text-xs"
                    >
                        <Wand2 size={16} className="group-hover:rotate-12 transition-transform duration-300" />
                        <span>{t('import.preview.btn_optimize')}</span>
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-base-content/10 text-[10px] font-bold group-hover:bg-primary-content/20">
                            {stats.errorCount + stats.warningCount}
                        </span>
                    </button>
                </div>
            )}
        </aside>
    );
};

interface SidebarItemProps {
    item: ProcessedImportItem;
    isSelected: boolean;
    sidebarCollapsed: boolean;
    onSelectItem: (id: string | null) => void;
    t: any;
}

const SidebarItem = React.memo<SidebarItemProps>(({
    item,
    isSelected,
    sidebarCollapsed,
    onSelectItem,
    t
}) => {
    const itemId = getItemId(item);
    const hasErr = item._validation.some(v => v.level === 'error');
    const hasWarn = item._validation.some(v => v.level === 'warning');

    // Content Status Icons
    const hintsCount = (Array.isArray(item.question.hints) ? item.question.hints.length : (item.question.hints?.hints?.length || 0));
    const hasExplanation = !!(item.question.explanation || item.question.explanation_image_url);

    // Robust i18n helper
    const getLocalizedType = () => {
        const type = item.question.question_type;
        const localized = t(`common.type.${type}`, { defaultValue: null }) ||
            t(`library.filters.${type}`, { defaultValue: null });
        return localized || type?.toUpperCase();
    };

    return (
        <button
            onClick={() => onSelectItem(itemId)}
            className={cn(
                "w-full flex items-center transition-all relative group/item",
                sidebarCollapsed
                    ? "justify-center px-0 py-2 rounded-xl h-14"
                    : "gap-3 p-3 rounded-2xl text-left",
                // Expanded mode: full selection styling
                !sidebarCollapsed && isSelected && "bg-primary text-primary-content shadow-premium-md translate-x-1",
                // Expanded mode: subtle hover
                !sidebarCollapsed && !isSelected && "hover:bg-base-content/5 opacity-80 hover:opacity-100",
                // Error states (only in expanded mode)
                !sidebarCollapsed && hasErr && isSelected && "bg-rose-500 text-white",
                !sidebarCollapsed && hasWarn && isSelected && !hasErr && "bg-amber-500 text-white"
            )}
        >
            <div className="relative shrink-0">
                <div className={cn(
                    "flex items-center justify-center text-[10px] font-black transition-all",
                    sidebarCollapsed ? "w-9 h-9 rounded-xl" : "w-8 h-8 rounded-xl",

                    // Collapsed mode: border-only selection with hover scale
                    sidebarCollapsed && isSelected && "border-2 border-primary text-primary bg-primary/5 group-hover/item:scale-105",
                    sidebarCollapsed && !isSelected && "border border-base-content/10 text-base-content/40 bg-base-content/5 group-hover/item:border-base-content/20 group-hover/item:bg-base-content/10 group-hover/item:scale-105",

                    // Expanded mode: full styling
                    !sidebarCollapsed && !isSelected && (
                        hasErr
                            ? "bg-rose-500/10 border border-rose-500/20 text-rose-500"
                            : hasWarn
                                ? "bg-amber-500/10 border border-amber-500/20 text-amber-500"
                                : "bg-base-content/5 border border-base-content/5 text-base-content/30"
                    ),
                    !sidebarCollapsed && isSelected && "bg-white/20 border border-white/20 text-current"
                )}>
                    {item.__row}
                </div>
                {sidebarCollapsed && (hasErr || hasWarn || hintsCount > 0 || hasExplanation) && (
                    <div className={cn(
                        "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-base-100 flex items-center justify-center text-[6px]",
                        hasErr ? "bg-rose-500 text-white" : hasWarn ? "bg-amber-500 text-white" : "bg-primary text-white"
                    )} />
                )}
            </div>

            {!sidebarCollapsed && (
                <div className="flex-1 min-w-0 transition-opacity duration-300 animate-in fade-in slide-in-from-left-2">
                    <div className={cn(
                        "text-xs font-bold truncate",
                        isSelected ? "text-current" : "text-base-content/80"
                    )}>
                        <MarkdownRenderer content={item.question.title || t('import.preview.untitled_object')} className="prose-none inline" showTexBadge={false} />
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                                "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                                isSelected ? "bg-white/20 text-current" : "bg-base-content/5 text-base-content/30"
                            )}>
                                {getLocalizedType()}
                            </span>
                            {item.subject_name && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <div className={cn("w-1 h-1 rounded-full shrink-0", isSelected ? "bg-white/40" : "bg-primary/40")} />
                                    <span className={cn("text-[8px] font-bold truncate", isSelected ? "text-current/60" : "text-base-content/30")}>
                                        {item.subject_name}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Content Status Indicators */}
                        <div className="flex items-center gap-1 shrink-0">
                            {hintsCount > 0 && (
                                <Lightbulb size={9} className={cn(isSelected ? "text-current/60" : "text-amber-500/40")} />
                            )}
                            {hasExplanation && (
                                <Zap size={9} className={cn(isSelected ? "text-current/60" : "text-accent/40")} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </button>
    );
});

SidebarItem.displayName = 'SidebarItem';
