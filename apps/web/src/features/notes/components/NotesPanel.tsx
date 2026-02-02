import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickJot } from './QuickJot';
import { BookOpen, Link2, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../app/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { BacklinksList } from './BacklinksList';
import { MarkdownRenderer } from '../../../components/LatexRenderer';

interface NotesPanelProps {
    questionId: string;
    onPopOutJot?: () => void;
    className?: string;
    isJotPoppedOut?: boolean;
    hints?: any; // The hints object from question data
    visibleHints?: number;
    onRevealHint?: () => void;
    activeTab?: Tab;
    onTabChange?: (tab: Tab) => void;
}

type Tab = 'hints' | 'notes' | 'backlinks';

export const NotesPanel: React.FC<NotesPanelProps> = ({
    questionId,
    onPopOutJot,
    className,
    isJotPoppedOut,
    hints,
    visibleHints = 0,
    onRevealHint,
    activeTab: externalTab,
    onTabChange
}) => {
    const { t } = useTranslation();
    const [internalTab, setInternalTab] = useState<Tab>(isJotPoppedOut ? 'backlinks' : 'notes');
    const activeTab = externalTab || internalTab;

    const handleTabChange = (tab: Tab) => {
        if (onTabChange) onTabChange(tab);
        else setInternalTab(tab);
    };

    // Helper to normalize hints list
    const hintList = React.useMemo(() => {
        if (!hints) return [];
        return Array.isArray(hints) ? hints : (hints.hints || []);
    }, [hints]);

    // We removed theme from here because user requested ONLY the note itself to change color.
    // So we use a neutral glass style for the panel background.

    const tabs = [
        { id: 'hints' as Tab, label: t('notes.panel.hints', 'Hints'), icon: Sparkles },
        { id: 'notes' as Tab, label: t('notes.panel.notes', 'Notes'), icon: BookOpen },
        { id: 'backlinks' as Tab, label: t('notes.panel.backlinks', 'Backlinks'), icon: Link2 },
    ];

    return (
        <div className={cn(
            "flex flex-col h-full backdrop-blur-xl border-l border-base-content/5 transition-colors duration-500",
            "bg-base-100/40", // Fixed neutral background
            className
        )}>
            {/* Quick Jot - Immersive Header Area */}
            {!isJotPoppedOut && (
                <div className="p-4 shrink-0">
                    <QuickJot questionId={questionId} onPopOut={onPopOutJot} />
                </div>
            )}

            {/* Smart Tabs Control */}
            <div className="px-4 py-2">
                <div className="flex p-1 bg-base-content/[0.03] rounded-2xl border border-base-content/5">
                    {tabs.map((tab) => {
                        const IsActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={cn(
                                    "relative flex-1 py-2 px-3 flex items-center justify-center gap-2 rounded-xl transition-all duration-300",
                                    "text-[10px] font-black uppercase tracking-wider",
                                    IsActive ? "text-primary" : "text-base-content/40 hover:text-base-content/60"
                                )}
                            >
                                <tab.icon size={12} className={cn(IsActive ? "opacity-100" : "opacity-40", "relative z-10")} />
                                <span className="relative z-10">{tab.label}</span>
                                {IsActive && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-base-100 shadow-premium-sm border border-base-content/5 rounded-xl z-0"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content Area Wrap */}
            <div className="flex-1 overflow-hidden relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="h-full overflow-y-auto custom-scrollbar p-5"
                    >
                        {activeTab === 'hints' && (
                            <div className="h-full flex flex-col pt-2">
                                {hintList.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                                        <Sparkles size={32} className="text-base-content/20" />
                                        <p className="text-xs font-medium text-base-content/40">{t('notes.panel.no_hints', 'No hints available')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-5 pb-8">
                                        {/* Progressive Scaffolding Header */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                    <Sparkles size={14} />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-base-content/60">
                                                        {t('notes.panel.logic_scaffolding', 'Logic Scaffolding')}
                                                    </div>
                                                    <div className="text-[9px] font-bold text-base-content/30">
                                                        {visibleHints} of {hintList.length} paths explored
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Minimal Progress Bar */}
                                            <div className="flex gap-1">
                                                {hintList.map((_: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "w-4 h-1 rounded-full transition-all duration-500",
                                                            i < visibleHints ? "bg-primary" : "bg-base-content/5"
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Revealed Path Cards */}
                                        <div className="space-y-3">
                                            {visibleHints > 0 && hintList.slice(0, visibleHints).map((hint: string, i: number) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.1 }}
                                                    className="group/hint relative bg-base-100 border border-base-content/5 rounded-2xl p-4 shadow-premium-sm hover:shadow-premium-md transition-all"
                                                >
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover/hint:bg-primary transition-colors rounded-l-2xl" />
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="text-[9px] font-black uppercase tracking-widest text-primary/40">
                                                            {t('renderer.hints.fragment', { n: i + 1 })}
                                                        </div>
                                                        <div className="h-px flex-1 bg-gradient-to-r from-base-content/5 to-transparent" />
                                                    </div>
                                                    <div className="text-xs text-base-content/80 leading-relaxed font-medium">
                                                        <MarkdownRenderer content={hint} className="prose-none" />
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>

                                        {/* Smart Reveal Logic Trigger */}
                                        {visibleHints < hintList.length && (
                                            <div className="pt-2">
                                                <button
                                                    onClick={onRevealHint}
                                                    className="w-full relative group overflow-hidden p-0.5 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent hover:from-primary/40 transition-all duration-500 active:scale-98"
                                                >
                                                    <div className="bg-base-100/80 backdrop-blur-sm rounded-[14px] p-6 flex flex-col items-center gap-3">
                                                        <div className="relative">
                                                            <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse rounded-full" />
                                                            <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform duration-500">
                                                                <Sparkles size={20} className={cn(visibleHints === 0 && "animate-pulse")} />
                                                            </div>
                                                        </div>
                                                        <div className="text-center z-10">
                                                            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-primary mb-1">
                                                                {visibleHints === 0 ? t('renderer.hints.get_hint', 'Illuminate Path') : t('renderer.hints.refine_logic', 'Deepen Reasoning')}
                                                            </div>
                                                            <div className="text-[10px] font-medium text-base-content/40 leading-tight max-w-[180px]">
                                                                {visibleHints === 0
                                                                    ? t('notes.panel.hint_cta_start', 'Unlock the first layer of logical scaffolding')
                                                                    : t('notes.panel.hint_cta_next', 'Reveal another dimension of the problem')
                                                                }
                                                            </div>
                                                        </div>

                                                        {/* Visual Shortcut Indicator */}
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-base-content/[0.03] border border-base-content/5 opacity-40 group-hover:opacity-100 transition-opacity">
                                                            <kbd className="text-[8px] font-mono font-bold">H</kbd>
                                                            <span className="text-[8px] font-bold uppercase tracking-widest">{t('notes.panel.hint_shortcut', 'Shortcut')}</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            </div>
                                        )}

                                        {/* Completion State */}
                                        {visibleHints === hintList.length && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="py-10 text-center"
                                            >
                                                <div className="inline-flex flex-col items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success">
                                                        <CheckCircle2 size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-success mb-1">
                                                            {t('notes.panel.all_hints_revealed', 'All Paths Illuminated')}
                                                        </div>
                                                        <div className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest">
                                                            Ready for synthesis
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="space-y-6">
                                <div className="p-4 bg-info/5 rounded-2xl border border-info/10 text-[11px] leading-relaxed text-info/80 font-medium">
                                    <p>{t('notes.panel.backlinks_tip', 'Tip: Global notes that mention this question will be linked automatically under the "Backlinks" tab.')}</p>
                                </div>

                                <div className="text-center py-10 opacity-30 select-none">
                                    <BookOpen size={24} className="mx-auto mb-3 opacity-40 text-primary" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        {t('notes.panel.more_soon', 'More Note Features Coming Soon')}
                                    </span>
                                </div>
                            </div>
                        )}

                        {activeTab === 'backlinks' && (
                            <BacklinksList questionId={questionId} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom Safe Area Padding */}
            <div className="h-4 shrink-0" />
        </div>
    );
};
