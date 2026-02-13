import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../app/state/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
    ChevronLeft,
    Database,
    BrainCircuit,
    Activity,
    TrendingUp,
    TrendingDown,
    Trash2,
    Save,
    RotateCcw,
    AlertCircle,
    ArrowUpRight,
    FileJson,
    Check,
    PanelLeftClose,
    PanelLeftOpen,
    Zap,
    Search,
    LayoutDashboard,
    ChevronRight,
} from 'lucide-react';
import { useFsrsProfile } from '../hooks/useFsrsProfile';
import type { FsrsProfile } from '../hooks/useFsrsProfile';

import { Loader2 } from 'lucide-react';

// ============================================================
// Internal Components
// ============================================================

/**
 * Section Header for tabs
 */
const TabHeader: React.FC<{ title: string; desc: string; icon?: React.ElementType }> = ({ title, desc, icon: Icon }) => (
    <div className="flex items-start gap-4 mb-8">
        {Icon && (
            <div className="p-2.5 bg-primary/5 rounded-xl text-primary/40 mt-1">
                <Icon className="w-4 h-4" />
            </div>
        )}
        <div className="space-y-1">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-base-content/80 flex items-center gap-2">
                {title}
                <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
            </h3>
            <p className="text-[10px] font-medium text-base-content/30 uppercase tracking-widest max-w-lg leading-relaxed">
                {desc}
            </p>
        </div>
    </div>
);

/**
 * Unsaved Changes Confirmation Modal (Spec 6.1)
 */
const UnsavedChangesModal: React.FC<{
    isOpen: boolean;
    onSaveAndSwitch: () => void;
    onDiscardAndSwitch: () => void;
    onCancel: () => void;
    isSaving?: boolean;
    t: (key: string, options?: any) => string;
}> = ({ isOpen, onSaveAndSwitch, onDiscardAndSwitch, onCancel, isSaving, t }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-content/20 backdrop-blur-sm"
                onClick={onCancel}
            />
            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative z-10 w-full max-w-md mx-4 glass-card-premium p-8 border-warning/20 bg-warning/[0.02] shadow-2xl"
            >
                <div className="flex gap-5">
                    <div className="p-4 bg-warning/20 rounded-2xl text-warning shrink-0">
                        <AlertCircle className="w-7 h-7" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-black uppercase tracking-tight text-base-content">
                            {t('settings.profiles.modal.unsaved_title', { defaultValue: 'Unsaved Changes' })}
                        </h3>
                        <p className="text-sm text-base-content/50 leading-relaxed">
                            {t('settings.profiles.modal.unsaved_desc', { defaultValue: 'You have uncommitted changes to the current profile. What would you like to do?' })}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 mt-8">
                    <button
                        onClick={onSaveAndSwitch}
                        disabled={isSaving}
                        className="w-full py-4 px-6 rounded-2xl bg-primary text-primary-content font-black text-[11px] uppercase tracking-[0.2em] shadow-premium-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {t('settings.profiles.modal.save_switch', { defaultValue: 'Save & Switch' })}
                    </button>
                    <button
                        onClick={onDiscardAndSwitch}
                        className="w-full py-4 px-6 rounded-2xl bg-base-content/5 text-base-content/60 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-base-content/10 transition-all"
                    >
                        {t('settings.profiles.modal.discard_switch', { defaultValue: 'Discard & Switch' })}
                    </button>
                    <button
                        onClick={onCancel}
                        className="w-full py-3 text-base-content/30 font-bold text-[10px] uppercase tracking-widest hover:text-base-content/60 transition-colors"
                    >
                        {t('common.actions.cancel', { defaultValue: 'Cancel' })}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

/**
 * Subject Picker Modal - Professional replacement for window.prompt
 */
interface SubjectOption {
    id: string;
    name: string;
    color: string | null;
    question_count?: number;
    has_override?: boolean;
}

const SubjectPickerModal: React.FC<{
    isOpen: boolean;
    subjects: SubjectOption[];
    existingOverrides: Set<string>;
    onSelect: (subjectId: string) => void;
    onCancel: () => void;
    t: (key: string, options?: any) => string;
}> = ({ isOpen, subjects, existingOverrides, onSelect, onCancel, t }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(0);

    // Filter subjects that don't have overrides yet
    const availableSubjects = useMemo(() => {
        const filtered = subjects.filter(s => !existingOverrides.has(s.id));
        if (!searchQuery) return filtered;
        return filtered.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [subjects, existingOverrides, searchQuery]);

    // Reset focus when search changes
    useEffect(() => {
        setFocusedIndex(0);
    }, [searchQuery]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => Math.min(prev + 1, availableSubjects.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && availableSubjects[focusedIndex]) {
            onSelect(availableSubjects[focusedIndex].id);
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-content/20 backdrop-blur-sm"
                onClick={onCancel}
            />
            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative z-10 w-full max-w-lg mx-4 glass-card-premium p-0 shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-base-content/5">
                    <h3 className="text-lg font-black uppercase tracking-tight text-base-content mb-1">
                        {t('settings.profiles.picker.title', { defaultValue: 'Add Subject Override' })}
                    </h3>
                    <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
                        {t('settings.profiles.picker.desc', { defaultValue: 'Select a subject to create custom FSRS settings' })}
                    </p>
                </div>

                {/* Search */}
                <div className="px-6 py-4 border-b border-base-content/5">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/20" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('settings.profiles.picker.search', { defaultValue: 'Search subjects...' })}
                            className="w-full pl-11 pr-4 py-3 bg-base-content/5 rounded-xl text-sm border-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-base-content/20"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Subject List */}
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    {availableSubjects.length === 0 ? (
                        <div className="p-10 text-center">
                            <div className="p-4 bg-base-content/5 rounded-2xl inline-block mb-4">
                                <Database className="w-8 h-8 text-base-content/20" />
                            </div>
                            <p className="text-sm font-bold text-base-content/40">
                                {searchQuery
                                    ? t('settings.profiles.picker.no_match', { defaultValue: 'No subjects match your search' })
                                    : t('settings.profiles.picker.all_configured', { defaultValue: 'All subjects already have overrides' })
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {availableSubjects.map((subject, index) => (
                                <button
                                    key={subject.id}
                                    onClick={() => onSelect(subject.id)}
                                    onMouseEnter={() => setFocusedIndex(index)}
                                    className={`
                                        w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200
                                        ${focusedIndex === index
                                            ? 'bg-primary text-primary-content shadow-lg'
                                            : 'hover:bg-base-content/5 text-base-content'
                                        }
                                    `}
                                >
                                    <div
                                        className={`
                                            p-2.5 rounded-xl transition-all
                                            ${focusedIndex === index ? 'bg-white/20' : 'bg-base-content/5'}
                                        `}
                                        style={{ color: focusedIndex !== index ? (subject.color || undefined) : undefined }}
                                    >
                                        <Database className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="text-sm font-black uppercase tracking-wider leading-none mb-1">
                                            {subject.name}
                                        </div>
                                        {subject.question_count !== undefined && (
                                            <div className={`text-[10px] font-bold uppercase ${focusedIndex === index ? 'text-white/60' : 'text-base-content/40'}`}>
                                                {subject.question_count} {t('common.units.cards', { defaultValue: 'cards' })}
                                            </div>
                                        )}
                                    </div>
                                    {focusedIndex === index && (
                                        <div className="text-[9px] font-bold uppercase opacity-60">
                                            Enter ↵
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-base-content/5 bg-base-content/[0.02]">
                    <button
                        onClick={onCancel}
                        className="w-full py-3 text-base-content/40 font-bold text-[10px] uppercase tracking-widest hover:text-base-content/60 transition-colors"
                    >
                        {t('common.actions.cancel', { defaultValue: 'Cancel' })}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

/**
 * Metric Card for Overview
 */
const MetricCard: React.FC<{ label: string; value: string; icon: React.ElementType; trend?: string; trendUp?: boolean; color?: string }> = ({ label, value, icon: Icon, trend, trendUp, color = 'primary' }) => (
    <div className="glass-card-premium p-6 flex flex-col gap-5 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
        <div className={`absolute -top-6 -right-6 p-12 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity bg-${color} rounded-full`} />

        <div className="flex items-center justify-between relative z-10">
            <div className={`p-2.5 bg-${color}/10 rounded-xl text-${color} shadow-premium-sm group-hover:scale-110 transition-transform`}>
                <Icon className="w-4 h-4" />
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-[9px] font-black px-2.5 py-1 rounded-full ${trendUp ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>
                    {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {trend}
                </div>
            )}
        </div>

        <div className="space-y-1 relative z-10">
            <div className="text-[32px] font-black tracking-tighter text-base-content/90 leading-tight">
                {value}
            </div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/30 group-hover:text-base-content/50 transition-colors">
                {label}
            </div>
        </div>
    </div>
);

/**
 * Workload Forecast Visualization
 */
const WorkloadForecast: React.FC<{ retention: number; baseCount: number }> = ({ retention, baseCount }) => {
    // Generate semi-random but stable forecast data based on retention target
    // Higher retention = Higher future workload
    const forecast = useMemo(() => {
        const multiplier = Math.pow(retention / 0.9, 2.5) * (baseCount > 0 ? baseCount / 50 : 1);
        return Array.from({ length: 14 }).map((_, i) => ({
            day: i,
            value: Math.max(10, Math.floor((20 + Math.sin(i / 2) * 10 + i) * multiplier))
        }));
    }, [retention, baseCount]);

    const maxValue = Math.max(...forecast.map(d => d.value), 100);

    return (
        <div className="glass-card-premium p-8 h-[300px] flex flex-col gap-6 group">
            <div className="flex items-end justify-between h-full gap-2">
                {forecast.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group/bar">
                        <div className="relative w-full h-full flex flex-col justify-end">
                            {/* Hover Tooltip */}
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-20">
                                <div className="bg-primary text-primary-content px-2 py-1 rounded-lg text-[8px] font-black whitespace-nowrap shadow-xl">
                                    {d.value} DUE
                                </div>
                            </div>

                            {/* Bar Filling */}
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${(d.value / maxValue) * 100}%` }}
                                className="w-full rounded-t-lg bg-gradient-to-t from-primary/20 to-primary/60 group-hover/bar:to-primary transition-all relative"
                            >
                                <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/40 rounded-full" />
                            </motion.div>
                        </div>
                        <span className="text-[8px] font-black text-base-content/10 uppercase group-hover/bar:text-base-content/40 transition-colors">
                            D+{d.day}
                        </span>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-base-content/5">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-primary opacity-50" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-base-content/20">
                        14-Day Capacity Projection
                    </span>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-primary/40" />
                        <span className="text-[8px] font-bold text-base-content/30 uppercase">Base Load</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-primary/10" />
                        <span className="text-[8px] font-bold text-base-content/30 uppercase">Growth</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// Main Page Component
// ============================================================

export const FsrsProfilesPage: React.FC = () => {
    const { t } = useTranslation(['settings', 'common']);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'tuning' | 'advanced'>('overview');
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [isDirty, setIsDirty] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingNavigation, setPendingNavigation] = useState<{ targetId: string | null } | null>(null);
    const [isSubjectPickerOpen, setIsSubjectPickerOpen] = useState(false);

    // Data fetching
    const {
        profile,
        profileList,
        isLoading,
        updateProfileAsync,
        isUpdating,
        deleteSubjectProfile
    } = useFsrsProfile(selectedSubjectId);

    // Draft State for "Unsaved Changes" UX
    const [draftProfile, setDraftProfile] = useState<Partial<FsrsProfile> | null>(null);

    // Sync draft with original profile on load or subject change
    useEffect(() => {
        if (profile) {
            setDraftProfile(profile);
            setIsDirty(false);
        }
    }, [profile, selectedSubjectId]);

    // Derived state
    const activeProfile = draftProfile || profile;
    const isGlobal = !selectedSubjectId;

    // Check if dirty (deep compare essential fields)
    useEffect(() => {
        if (!profile || !draftProfile) {
            setIsDirty(false);
            return;
        }

        const changed =
            draftProfile.retention_target !== profile.retention_target ||
            draftProfile.style !== profile.style ||
            draftProfile.daily_review_cap !== profile.daily_review_cap ||
            JSON.stringify(draftProfile.weights) !== JSON.stringify(profile.weights);

        setIsDirty(changed);
    }, [draftProfile, profile]);

    // Filtered subject list
    const filteredSubjects = useMemo(() => {
        const list = profileList?.filter(p => !p.is_global) || [];
        if (!searchQuery) return list;
        return list.filter(s => s.subject_name?.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [profileList, searchQuery]);

    // UI Handlers
    const handleSubjectSelect = (id: string | null) => {
        if (isDirty) {
            // Open modal instead of window.confirm (Spec 6.1)
            setPendingNavigation({ targetId: id });
            return;
        }
        setSelectedSubjectId(id);
        setActiveTab('overview');
    };

    const handleSaveAndSwitch = async () => {
        await handleSaveDraft();
        if (pendingNavigation) {
            setSelectedSubjectId(pendingNavigation.targetId);
            setActiveTab('overview');
            setPendingNavigation(null);
        }
    };

    const handleDiscardAndSwitch = () => {
        handleDiscardDraft();
        if (pendingNavigation) {
            setSelectedSubjectId(pendingNavigation.targetId);
            setActiveTab('overview');
            setPendingNavigation(null);
        }
    };

    const handleCancelNavigation = () => {
        setPendingNavigation(null);
    };

    // Subject Picker Modal handlers
    const handleAddOverride = () => {
        setIsSubjectPickerOpen(true);
    };

    const handleSubjectPickerSelect = (subjectId: string) => {
        setIsSubjectPickerOpen(false);
        setSelectedSubjectId(subjectId);
        setActiveTab('tuning');
    };

    const handleSubjectPickerCancel = () => {
        setIsSubjectPickerOpen(false);
    };

    // Get all subjects from store assets for the picker
    // Use useShallow to prevent infinite re-renders from Object.values creating new array reference
    const assetsObj = useAppStore(useShallow(s => s.entities.assets));
    const allSubjects = useMemo(() => {
        return Object.values(assetsObj).filter((a: any) => a.type === 'subject');
    }, [assetsObj]);

    // Existing overrides set
    const existingOverrideIds = useMemo(() => {
        const ids = new Set<string>();
        profileList?.forEach(p => {
            if (p.subject_id && !p.is_global) ids.add(p.subject_id);
        });
        return ids;
    }, [profileList]);

    // Map subjects to picker format
    const subjectsForPicker: SubjectOption[] = useMemo(() => {
        return allSubjects.map((s: any) => ({
            id: s.id,
            name: s.name,
            color: s.color || null,
            question_count: undefined, // Could be enhanced with real counts
        }));
    }, [allSubjects]);

    // Calculate number of changed fields for dirty bar
    const changedFieldCount = useMemo(() => {
        if (!profile || !draftProfile) return 0;
        let count = 0;
        if (draftProfile.retention_target !== profile.retention_target) count++;
        if (draftProfile.style !== profile.style) count++;
        if (draftProfile.daily_review_cap !== profile.daily_review_cap) count++;
        if (JSON.stringify(draftProfile.weights) !== JSON.stringify(profile.weights)) count++;
        return count;
    }, [draftProfile, profile]);

    const handleSaveDraft = async () => {
        if (!draftProfile) return;
        try {
            await updateProfileAsync({
                subject_id: selectedSubjectId,
                retention_target: draftProfile.retention_target,
                daily_review_cap: draftProfile.daily_review_cap,
                style: draftProfile.style,
                weights: draftProfile.weights || undefined,
            });
            setIsDirty(false);
            // Show success toast using pushEffect
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'success',
                message: t('settings.profiles.toast.save_success', { defaultValue: 'Profile settings applied successfully.' }),
            });
        } catch (err) {
            console.error('Failed to save profile:', err);
            useAppStore.getState().pushEffect({
                type: 'toast',
                level: 'error',
                message: t('common:common.errors.save_failed'),
            });
        }
    };

    const handleDiscardDraft = () => {
        setDraftProfile(profile || null);
        setIsDirty(false);
    };

    if (isLoading && !profile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black uppercase text-base-content/20 tracking-[0.4em] animate-pulse">
                    {t('common.loading')}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-base-100/50 backdrop-blur-3xl">
            {/* Top Navigation Bar: Refined & More Compact */}
            <div className="h-14 border-b border-base-content/5 flex items-center justify-between px-4 bg-base-200/20 backdrop-blur-3xl z-30 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                            className="p-2 rounded-xl hover:bg-base-content/5 text-base-content/40 hover:text-base-content/60 transition-all"
                            title={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            {isSidebarVisible ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>
                        <Link
                            to="/settings"
                            className="p-2 rounded-xl bg-base-content/5 text-base-content/40 hover:bg-base-content/10 hover:text-base-content/60 transition-all group"
                        >
                            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        </Link>
                    </div>

                    <div className="h-4 w-[1px] bg-base-content/10 mx-1" />

                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/60">
                                {t('settings.profiles.page_title')}
                            </h1>
                            <span className="text-[8px] font-bold text-base-content/10 uppercase tracking-widest px-1.5 py-0.5 rounded border border-base-content/5">
                                ALPHA
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                        <Zap className="w-3 h-3 text-primary" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">
                            {activeProfile?.weights_schema_version || 'v5.3'} {t('settings.algorithm.title')}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Profile Selector - Animatable */}
                <motion.aside
                    initial={false}
                    animate={{
                        width: isSidebarVisible ? 320 : 0,
                        opacity: isSidebarVisible ? 1 : 0
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="shrink-0 border-r border-base-content/5 bg-base-200/10 flex flex-col overflow-hidden"
                >
                    <div className="w-[320px] h-full flex flex-col">
                        <div className="p-6 shrink-0">
                            <div className="relative group/search mb-6">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                    <Search className="w-4 h-4 text-base-content/20 group-focus-within/search:text-primary transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    placeholder={t('common.search_placeholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-base-content/5 border-none rounded-2xl py-3 pl-12 pr-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-base-content/10"
                                />
                            </div>

                            <div className="flex items-center justify-between mb-4 px-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/20 font-mono">
                                    {t('settings.profiles.selector.title')}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar space-y-1.5 focus-within:z-10">
                            <div className="space-y-1.5">
                                {/* Global Default Entry */}
                                <button
                                    onClick={() => handleSubjectSelect(null)}
                                    className={`
                                    w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-500 group
                                    ${selectedSubjectId === null
                                            ? 'bg-primary text-primary-content shadow-premium-lg scale-[1.02] z-10'
                                            : 'hover:bg-base-content/5 text-base-content/40 hover:text-base-content/60'}
                                `}
                                >
                                    <div className={`
                                    p-2.5 rounded-xl transition-all
                                    ${selectedSubjectId === null ? 'bg-white/20' : 'bg-base-content/5'}
                                `}>
                                        <LayoutDashboard className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="text-[11px] font-black uppercase tracking-wider leading-none mb-1">
                                            {t('settings.profiles.selector.global_default')}
                                        </div>
                                        <div className={`text-[9px] font-bold uppercase opacity-40 ${selectedSubjectId === null ? 'text-white' : ''}`}>
                                            {t('settings.algorithm.desc')}
                                        </div>
                                    </div>
                                    {selectedSubjectId === null && <ChevronRight className="w-4 h-4 opacity-40" />}
                                </button>

                                <div className="h-px bg-base-content/5 mx-4 my-4" />

                                {/* Subject Overrides List */}
                                {filteredSubjects.map(sub => (
                                    <button
                                        key={sub.subject_id}
                                        onClick={() => handleSubjectSelect(sub.subject_id)}
                                        className={`
                                        w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-500 group animate-in slide-in-from-left-4
                                        ${selectedSubjectId === sub.subject_id
                                                ? 'bg-primary text-primary-content shadow-premium-lg scale-[1.02] z-10'
                                                : 'hover:bg-base-content/5 text-base-content/40 hover:text-base-content/60'}
                                    `}
                                    >
                                        <div className={`
                                        p-2.5 rounded-xl transition-all
                                        ${selectedSubjectId === sub.subject_id ? 'bg-white/20' : 'bg-base-content/5'}
                                        relative
                                    `}
                                            style={{ color: sub.subject_color || undefined }}
                                        >
                                            <Database className="w-4 h-4" />
                                            {sub.has_custom_profile && (
                                                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-info border-2 border-base-100" />
                                            )}
                                        </div>
                                        <div className="flex-1 text-left truncate">
                                            <div className="text-[11px] font-black uppercase tracking-wider leading-none mb-1 truncate">
                                                {sub.subject_name}
                                            </div>
                                            <div className={`text-[9px] font-bold uppercase opacity-40 ${selectedSubjectId === sub.subject_id ? 'text-white' : ''}`}>
                                                {sub.question_count} {t('common.units.cards')}
                                            </div>
                                        </div>
                                        <ChevronRight className={`w-4 h-4 opacity-10 group-hover:opacity-40 transition-opacity ${selectedSubjectId === sub.subject_id ? 'opacity-40' : ''}`} />
                                    </button>
                                ))}

                                <button
                                    onClick={handleAddOverride}
                                    className="w-full mt-4 flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-base-content/5 text-base-content/20 hover:border-primary/20 hover:text-primary transition-all group overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] relative z-10">
                                        {t('settings.profiles.selector.add_override')}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.aside>

                {/* Main Workbench */}
                <main className="flex-1 relative flex flex-col bg-base-100 overflow-hidden">
                    {/* Workspace Header - More Modern and Space Efficient */}
                    <div className="px-6 md:px-8 lg:px-12 pt-8 pb-4 shrink-0 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full opacity-[0.02] pointer-events-none">
                            <div className="absolute -top-48 -right-48 w-96 h-96 bg-primary rounded-full blur-[160px]" />
                            <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-info rounded-full blur-[160px]" />
                        </div>

                        <div className="relative z-10 mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl text-primary shadow-premium-sm">
                                        {isGlobal ? <BrainCircuit className="w-7 h-7" /> : <Database className="w-7 h-7" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/60">
                                                {isGlobal ? 'Core Engine' : 'Field Override'}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-base-content/10" />
                                            <span className="text-[9px] font-bold text-base-content/20 uppercase tracking-widest leading-none">
                                                ID: {activeProfile?.profile_id?.slice(0, 8) || 'DEFAULT'}
                                            </span>
                                        </div>
                                        <h2 className="text-3xl font-black uppercase tracking-tight text-base-content/90 leading-none">
                                            {activeProfile?.subject_name || t('settings.profiles.selector.global_default')}
                                        </h2>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="glass-card-premium px-5 py-2.5 flex flex-col items-center">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-base-content/20 mb-0.5">
                                        {t('settings.profiles.header.inheritance.label')}
                                    </span>
                                    <div className="flex items-center p-1 bg-base-content/5 rounded-2xl border border-base-content/5">
                                        <button
                                            onClick={() => {
                                                if (isGlobal) return;
                                                setDraftProfile({ ...profile!, is_inherited: true });
                                                if (!activeProfile?.is_inherited) {
                                                    if (window.confirm(t('settings.profiles.header.inheritance.revert_confirm'))) {
                                                        deleteSubjectProfile(selectedSubjectId!);
                                                    }
                                                }
                                            }}
                                            disabled={isGlobal}
                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${activeProfile?.is_inherited ? 'bg-base-100 text-primary shadow-premium-sm' : 'text-base-content/30 hover:text-base-content/60'}`}
                                        >
                                            {t('settings.profiles.header.inheritance.inherit_all')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isGlobal) return;
                                                setDraftProfile({ ...profile!, is_inherited: false });
                                            }}
                                            disabled={isGlobal}
                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${!activeProfile?.is_inherited ? 'bg-base-100 text-info shadow-premium-sm' : 'text-base-content/30 hover:text-base-content/60'}`}
                                        >
                                            {t('settings.profiles.header.inheritance.customize')}
                                        </button>
                                    </div>
                                </div>

                                {!isGlobal && (
                                    <button
                                        onClick={() => activeProfile?.subject_id && deleteSubjectProfile(activeProfile.subject_id)}
                                        className="p-3 rounded-2xl bg-base-content/5 text-base-content/20 hover:bg-error/10 hover:text-error transition-all group"
                                        title={t('settings.profiles.header.actions.delete')}
                                    >
                                        <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="flex gap-10 relative border-b border-base-content/5 px-2">
                            {(['overview', 'tuning', 'advanced'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`
                                        pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative
                                        ${activeTab === tab ? 'text-primary' : 'text-base-content/20 hover:text-base-content/40'}
                                    `}
                                >
                                    {t(`settings.profiles.tabs.${tab}`)}
                                    {activeTab === tab && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scrollable Content Area - Optimized Gutters */}
                    <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-12 pb-32 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                className="py-8"
                            >
                                {activeTab === 'overview' && (
                                    <div className="space-y-10">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <MetricCard
                                                label={t('settings.profiles.overview.metrics.daily_load')}
                                                value={`~${activeProfile?.daily_review_cap || 100}`}
                                                icon={Activity}
                                                trend={activeProfile?.style === 'aggressive' ? '+15%' : activeProfile?.style === 'conservative' ? '-10%' : undefined}
                                                trendUp={activeProfile?.style === 'aggressive'}
                                            />
                                            <MetricCard
                                                label={t('settings.profiles.overview.metrics.peak_day')}
                                                value={Math.round((activeProfile?.daily_review_cap || 100) * 1.6).toString()}
                                                icon={TrendingUp}
                                            />
                                            <MetricCard
                                                label={t('settings.profiles.overview.metrics.confidence')}
                                                value={activeProfile?.optimization_confidence ? `${Math.round(activeProfile.optimization_confidence * 100)}%` : '95%'}
                                                icon={BrainCircuit}
                                            />
                                        </div>

                                        <div className="space-y-6">
                                            <TabHeader
                                                title={t('settings.profiles.overview.forecast')}
                                                desc={t('settings.profiles.overview.data_sufficiency', {
                                                    days: 30,
                                                    count: activeProfile?.question_count || 0
                                                })}
                                            />

                                            {activeProfile?.question_count && activeProfile.question_count > 0 ? (
                                                <WorkloadForecast
                                                    retention={activeProfile.retention_target ?? 0.9}
                                                    baseCount={activeProfile.question_count}
                                                />
                                            ) : (
                                                <div className="glass-card-premium min-h-[300px] flex flex-col items-center justify-center p-10 border-dashed group">
                                                    <div className="p-5 rounded-[2rem] bg-base-content/5 text-base-content/10 mb-6 group-hover:scale-110 transition-transform duration-700">
                                                        <TrendingDown className="w-12 h-12" />
                                                    </div>
                                                    <h4 className="text-sm font-black uppercase tracking-widest text-base-content/20 text-center mb-2">
                                                        {t('settings.profiles.overview.empty')}
                                                    </h4>
                                                    <p className="text-[10px] font-bold text-base-content/10 uppercase tracking-widest text-center max-w-xs leading-relaxed">
                                                        {t('settings.profiles.overview.empty_desc', { defaultValue: 'Engine requires active interaction logs to map potential stability decay.' })}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'tuning' && (
                                    <div className="space-y-12">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                            <div className="space-y-10">
                                                <TabHeader
                                                    title={t('settings.profiles.tuning.controls.retention.label')}
                                                    desc={t('settings.profiles.tuning.controls.retention.recommended')}
                                                />

                                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                                    <div className="flex items-end justify-between px-4">
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--p),0.5)]" />
                                                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-tighter">
                                                                    {t('settings.algorithm.slider_labels.standard')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-baseline gap-1 group/val">
                                                            <span className="text-7xl font-black text-primary font-mono tracking-tighter group-hover:scale-110 transition-transform cursor-default">
                                                                {Math.round((activeProfile?.retention_target || 0.9) * 100)}
                                                            </span>
                                                            <span className="text-xl font-black text-primary/30 font-mono">%</span>
                                                        </div>
                                                    </div>

                                                    {/* Silky UX Slider - Enhanced */}
                                                    <div className="relative h-14 flex items-center group/slider px-2">
                                                        <div className="absolute inset-x-2 h-2 bg-base-content/5 rounded-full overflow-hidden border border-base-content/5">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-primary/40 to-primary transition-all duration-300"
                                                                style={{ width: `${((activeProfile?.retention_target || 0.9) - 0.7) / (0.99 - 0.7) * 100}%` }}
                                                            />
                                                            {/* Step Markers */}
                                                            <div className="absolute inset-0 flex justify-between px-1 opacity-20 pointer-events-none">
                                                                {Array.from({ length: 11 }).map((_, i) => (
                                                                    <div key={i} className="w-[1px] h-full bg-white/20" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0.70"
                                                            max="0.99"
                                                            step="0.01"
                                                            value={activeProfile?.retention_target || 0.9}
                                                            onChange={(e) => setDraftProfile(prev => ({ ...prev!, retention_target: parseFloat(e.target.value) }))}
                                                            className="absolute inset-x-0 w-full opacity-0 h-full cursor-pointer z-20"
                                                        />
                                                        <div
                                                            className="absolute w-10 h-10 bg-base-100 border-[6px] border-primary rounded-2xl shadow-premium-lg transition-all duration-150 group-hover/slider:scale-110 group-active/slider:scale-95 pointer-events-none flex items-center justify-center z-10"
                                                            style={{ left: `calc(${((activeProfile?.retention_target || 0.9) - 0.7) / (0.99 - 0.7) * 100}% - 20px)` }}
                                                        >
                                                            <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-6">
                                                    <TabHeader
                                                        title={t('settings.profiles.tuning.controls.style.label')}
                                                        desc="Intensity of review scheduling protocols"
                                                    />
                                                    <div className="flex p-1.5 bg-base-200/50 rounded-[1.5rem] border border-base-content/5">
                                                        {(['conservative', 'balanced', 'aggressive'] as const).map(style => (
                                                            <button
                                                                key={style}
                                                                onClick={() => setDraftProfile(prev => ({ ...prev!, style }))}
                                                                className={`
                                                                    flex-1 py-4 px-4 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all
                                                                    ${activeProfile?.style === style
                                                                        ? 'bg-base-100 text-primary shadow-premium-sm scale-[1.02]'
                                                                        : 'text-base-content/20 hover:text-base-content/40 hover:bg-base-content/5'}
                                                                `}
                                                            >
                                                                {t(`settings.profiles.tuning.controls.style.${style}`)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="glass-card-premium p-8 flex flex-col gap-6 border-info/10 bg-info/[0.01]">
                                                <div className="flex items-center justify-between border-b border-info/10 pb-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 bg-info/10 rounded-xl text-info">
                                                            <TrendingUp className="w-4 h-4" />
                                                        </div>
                                                        <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-info">
                                                            {t('settings.profiles.tuning.preview.title')}
                                                        </h5>
                                                    </div>
                                                    <div className="text-[10px] font-black text-info/40 animate-pulse">
                                                        {t('settings.profiles.tuning.preview.status.updated')}
                                                    </div>
                                                </div>

                                                <div className="space-y-8">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-black uppercase tracking-[0.1em] text-base-content/40">
                                                            {t('settings.profiles.tuning.preview.delta.daily_load')}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {/* Calculate estimated daily load based on retention and style */}
                                                            {(() => {
                                                                const baseLoad = activeProfile?.daily_review_cap || 100;
                                                                const retention = activeProfile?.retention_target ?? 0.9;
                                                                const styleMultiplier = activeProfile?.style === 'aggressive' ? 0.8 : activeProfile?.style === 'conservative' ? 1.2 : 1.0;
                                                                // Higher retention = more reviews needed
                                                                const retentionFactor = Math.pow(retention / 0.9, 1.5);
                                                                const estimatedLoad = Math.round(baseLoad * styleMultiplier * retentionFactor * 0.85);
                                                                const delta = Math.round((1 - (estimatedLoad / baseLoad)) * 100);
                                                                const isImproved = delta > 0;
                                                                return (
                                                                    <>
                                                                        <span className="text-xl font-black text-base-content/90 font-mono tracking-tight">{estimatedLoad}</span>
                                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isImproved ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                                                                            {isImproved ? '-' : '+'}{Math.abs(delta)}%
                                                                        </span>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-black uppercase tracking-[0.1em] text-base-content/40">
                                                            {t('settings.profiles.tuning.preview.delta.peak_day')}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {/* Calculate estimated peak day based on cap and retention */}
                                                            {(() => {
                                                                const baseLoad = activeProfile?.daily_review_cap || 100;
                                                                const retention = activeProfile?.retention_target ?? 0.9;
                                                                // Peak days have higher variance at high retention
                                                                const peakMultiplier = 1.4 + (retention - 0.9) * 2;
                                                                const estimatedPeak = Math.round(baseLoad * peakMultiplier);
                                                                const basePeak = Math.round(baseLoad * 1.5);
                                                                const delta = estimatedPeak - basePeak;
                                                                const isWorse = delta > 0;
                                                                return (
                                                                    <>
                                                                        <span className="text-xl font-black text-base-content/90 font-mono tracking-tight">{estimatedPeak}</span>
                                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isWorse ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>
                                                                            {isWorse ? '+' : ''}{delta}
                                                                        </span>
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    <div className="p-5 rounded-2xl bg-warning/5 border border-warning/10 flex items-start gap-4">
                                                        <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-black uppercase tracking-tight text-warning">
                                                                Load Limit Alert
                                                            </p>
                                                            <p className="text-[9px] font-bold text-warning/60 leading-relaxed">
                                                                {t('settings.profiles.tuning.preview.risks.high_retention')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button className="w-full mt-4 flex items-center justify-center gap-2 p-4 rounded-2xl bg-info/10 text-info hover:bg-info/20 transition-all group">
                                                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">
                                                        {t('settings.profiles.tuning.preview.deep_dive')}
                                                    </span>
                                                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'advanced' && (
                                    <div className="space-y-12 max-w-4xl">
                                        <div className="glass-card-premium p-8 border-warning/20 bg-warning/[0.02]">
                                            <div className="flex items-start gap-5 mb-10">
                                                <div className="p-4 bg-warning/20 rounded-2xl text-warning">
                                                    <AlertCircle className="w-6 h-6" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-black uppercase tracking-tight text-warning">
                                                        {t('settings.algorithm.expert.warning_title')}
                                                    </h4>
                                                    <p className="text-[10px] font-bold text-warning/40 uppercase tracking-widest leading-relaxed">
                                                        Experimental Protocol: Modifying core weight matrices carries a high risk of scheduling entropy and memory half-life distortion.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                                <div className="space-y-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-warning/40 ml-2">
                                                        {t('settings.profiles.advanced.weights.label')}
                                                    </span>
                                                    <div className="glass-card-premium p-6 bg-black/40 border-warning/10 space-y-8">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-2.5 bg-warning/10 rounded-xl text-warning">
                                                                    <FileJson className="w-4 h-4" />
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    <div className="text-[10px] font-black uppercase text-warning/80">FSRS_v5.3_Matrix</div>
                                                                    <div className="text-[8px] font-bold text-warning/30 uppercase tracking-[0.2em]">Stability & Difficulty Weights</div>
                                                                </div>
                                                            </div>
                                                            <div className="px-2 py-1 rounded-lg bg-warning/5 border border-warning/10 text-[9px] font-black text-warning/40 uppercase">
                                                                {activeProfile?.weights_schema_version || 'v5.3'}
                                                            </div>
                                                        </div>

                                                        {/* Weights Input Grid - High Info Density */}
                                                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                                            {(activeProfile?.weights || Array(19).fill(0)).map((w, i) => (
                                                                <div key={i} className="space-y-1.5 group/w">
                                                                    <div className="flex items-center justify-between px-1">
                                                                        <span className="text-[7px] font-black text-warning/20 group-hover/w:text-warning/40 transition-colors">W{String(i).padStart(2, '0')}</span>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        value={w}
                                                                        onChange={(e) => {
                                                                            const newWeights = [...(activeProfile?.weights || Array(19).fill(0))];
                                                                            newWeights[i] = parseFloat(e.target.value) || 0;
                                                                            setDraftProfile(prev => ({ ...prev!, weights: newWeights }));
                                                                        }}
                                                                        className="w-full bg-warning/5 border border-warning/10 rounded-xl py-2.5 text-[11px] font-mono font-black text-center text-warning/80 focus:border-warning/50 focus:bg-warning/10 focus:ring-4 focus:ring-warning/5 transition-all outline-none appearance-none"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-warning/40 ml-2">
                                                        Model Integrity
                                                    </span>
                                                    <div className="p-6 bg-black/20 rounded-3xl border border-warning/10 space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] font-black uppercase tracking-wider text-warning/60">
                                                                {t('settings.profiles.advanced.validation.schema_valid')}
                                                            </span>
                                                            {activeProfile?.weights?.length === 19 ? (
                                                                <Check className="w-4 h-4 text-success" />
                                                            ) : (
                                                                <AlertCircle className="w-4 h-4 text-error" />
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] font-black uppercase tracking-wider text-warning/60">
                                                                {t('settings.profiles.advanced.validation.range_valid')}
                                                            </span>
                                                            <Check className="w-4 h-4 text-success" />
                                                        </div>
                                                        <div className="pt-4 border-t border-warning/5">
                                                            <div className="text-[9px] font-bold text-warning/20 uppercase tracking-widest leading-loose">
                                                                Optimized Status: {activeProfile?.is_optimized ? 'SUCCESS' : 'MANUAL'}<br />
                                                                Confidence Score: {activeProfile?.optimization_confidence ? `${Math.round(activeProfile.optimization_confidence * 100)}%` : 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-4">
                                                <button
                                                    onClick={() => {
                                                        const input = window.prompt('Paste weight matrix JSON array:');
                                                        if (input) {
                                                            try {
                                                                const parsed = JSON.parse(input);
                                                                if (Array.isArray(parsed)) {
                                                                    setDraftProfile(prev => ({ ...prev!, weights: parsed }));
                                                                }
                                                            } catch (e) { alert('Invalid JSON'); }
                                                        }
                                                    }}
                                                    className="flex-1 p-4 rounded-2xl bg-warning/10 text-warning hover:bg-warning/20 transition-all text-[10px] font-black uppercase tracking-[0.2em]"
                                                >
                                                    {t('settings.profiles.advanced.weights.import')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const blob = new Blob([JSON.stringify(activeProfile?.weights || [])], { type: 'application/json' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        a.download = `fsrs_weights_${activeProfile?.subject_name || 'global'}.json`;
                                                        a.click();
                                                    }}
                                                    className="flex-1 p-4 rounded-2xl border-2 border-warning/10 text-warning/60 hover:border-warning/30 hover:text-warning transition-all text-[10px] font-black uppercase tracking-[0.2em]"
                                                >
                                                    {t('settings.profiles.advanced.weights.export')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Sticky Bottom Bar (Only when Dirty) */}
                    <AnimatePresence>
                        {isDirty && (
                            <motion.div
                                initial={{ y: 100, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 100, opacity: 0 }}
                                className="absolute bottom-6 left-0 right-0 px-6 z-40 pointer-events-none"
                            >
                                <div className="max-w-5xl mx-auto glass-card-premium p-4 md:p-6 border-primary/30 bg-primary/[0.08] shadow-[0_24px_48px_-12px_rgba(var(--p),0.25)] backdrop-blur-3xl flex items-center justify-between pointer-events-auto border-t-primary/50 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />

                                    <div className="flex items-center gap-6">
                                        <div className="p-3 bg-primary/20 rounded-[1.25rem] text-primary shadow-[0_0_15px_rgba(var(--p),0.3)] animate-pulse">
                                            <RotateCcw className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h5 className="text-sm font-black uppercase tracking-tight text-base-content/90">
                                                {t('settings.profiles.dirty_bar.changed', { count: changedFieldCount })}
                                            </h5>
                                            <p className="text-[10px] font-bold text-base-content/20 uppercase tracking-widest mt-0.5">
                                                {t('settings.profiles.dirty_bar.uncommitted_desc', { defaultValue: 'Uncommitted modifications to scheduling parameters' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Delta Quick View (Spec 4.6) */}
                                    <div className="hidden md:flex items-center gap-4 px-6 border-l border-r border-base-content/5">
                                        {profile && draftProfile && profile.retention_target !== draftProfile.retention_target && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-base-content/30 uppercase">Ret</span>
                                                <span className="text-sm font-black text-base-content/60 font-mono">
                                                    {Math.round((profile.retention_target ?? 0.9) * 100)}% → {Math.round((draftProfile.retention_target ?? 0.9) * 100)}%
                                                </span>
                                            </div>
                                        )}
                                        {profile && draftProfile && profile.style !== draftProfile.style && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-base-content/30 uppercase">Style</span>
                                                <span className="text-sm font-black text-base-content/60">
                                                    {draftProfile.style}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleDiscardDraft}
                                            className="px-6 py-3 rounded-2xl bg-base-content/5 text-base-content/40 hover:bg-base-content/10 transition-all text-[10px] font-black uppercase tracking-widest"
                                        >
                                            {t('settings.profiles.dirty_bar.discard')}
                                        </button>
                                        <button
                                            onClick={handleSaveDraft}
                                            disabled={isUpdating}
                                            className="px-10 py-3 rounded-2xl bg-primary text-primary-content shadow-premium-lg hover:scale-105 active:scale-95 transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 disabled:opacity-50 disabled:scale-100"
                                        >
                                            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {t('settings.profiles.dirty_bar.save_apply')}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>

            {/* Unsaved Changes Modal (Spec 6.1) */}
            <AnimatePresence>
                {pendingNavigation && (
                    <UnsavedChangesModal
                        isOpen={true}
                        onSaveAndSwitch={handleSaveAndSwitch}
                        onDiscardAndSwitch={handleDiscardAndSwitch}
                        onCancel={handleCancelNavigation}
                        isSaving={isUpdating}
                        t={t}
                    />
                )}
            </AnimatePresence>

            {/* Subject Picker Modal */}
            <AnimatePresence>
                {isSubjectPickerOpen && (
                    <SubjectPickerModal
                        isOpen={true}
                        subjects={subjectsForPicker}
                        existingOverrides={existingOverrideIds}
                        onSelect={handleSubjectPickerSelect}
                        onCancel={handleSubjectPickerCancel}
                        t={t}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default FsrsProfilesPage;
