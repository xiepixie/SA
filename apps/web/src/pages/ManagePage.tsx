import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Settings2,
    Hash,
    History,
    Combine,
    Layers,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { useAppStore } from '../app/state/useAppStore';
import { useActiveView } from '../app/hooks/useActiveView';
import { useShallow } from 'zustand/react/shallow';
import { v2Api } from '../app/api/views';
import { Toast, type ToastLevel } from '../components/ui/Toast';
import { cn } from '../app/utils/cn';

// Modular Components
import { SubjectGrid } from './manage/SubjectGrid';
import { TagTable } from './manage/TagTable';
import { AuditTimeline } from './manage/AuditTimeline';
import { ManageModal } from './manage/ManageModal';
import { DeleteConfirmModal } from './manage/DeleteConfirmModal';
import { MergeModal } from './manage/MergeModal';

// Import shared types from API layer (avoiding duplicate definitions)
import { type Subject, type Tag, type AuditLog } from '../app/api/views';

export const ManagePage: React.FC = () => {
    const { t } = useTranslation(['library', 'common']);
    const { pushEffect, dismissEffect, effects, commit } = useAppStore(useShallow(s => ({
        pushEffect: s.pushEffect,
        dismissEffect: s.dismissEffect,
        effects: s.effects,
        commit: s.commit
    })));

    // --- Tab State ---
    const [activeTab, setActiveTab] = useState<'subjects' | 'tags' | 'audit'>('subjects');
    const [searchTerm, setSearchTerm] = useState('');

    // --- Modal State ---
    const [modalState, setModalState] = useState<{
        open: boolean;
        mode: 'create' | 'edit';
        item: Subject | Tag | null;
        type: 'subject' | 'tag';
    }>({
        open: false,
        mode: 'create',
        item: null,
        type: 'subject'
    });

    // --- Delete Confirmation State ---
    const [deleteModal, setDeleteModal] = useState<{
        open: boolean;
        item: Subject | Tag | null;
    }>({
        open: false,
        item: null
    });

    const [mergeModal, setMergeModal] = useState<{
        open: boolean;
        type: 'subject' | 'tag';
    }>({
        open: false,
        type: 'subject'
    });

    // Dynamic views revalidation
    useActiveView(`v:manage_${activeTab}`);

    // --- Data Selection ---
    const subjects = useAppStore(useShallow(s =>
        Object.values(s.entities.assets).filter((a: any): a is Subject => a.type === 'subject')
    ));

    const tags = useAppStore(useShallow(s =>
        Object.values(s.entities.assets).filter((a: any): a is Tag => a.type === 'tag')
    ));

    const auditLogs = useAppStore(useShallow(s =>
        (s.entities.dashboard.auditLogs || []) as AuditLog[]
    ));

    // --- Filtered Data ---
    const filteredSubjects = useMemo(() =>
        subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [subjects, searchTerm]);

    const filteredTags = useMemo(() =>
        tags.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [tags, searchTerm]);

    // --- Handlers ---
    const getTypeFromTab = (tab: typeof activeTab): 'subject' | 'tag' => {
        if (tab === 'subjects') return 'subject';
        if (tab === 'tags') return 'tag';
        return 'subject'; // default for audit tab
    };

    const handleOpenCreate = () => {
        setModalState({
            open: true,
            mode: 'create',
            item: null,
            type: getTypeFromTab(activeTab)
        });
    };

    const handleOpenEdit = (item: Subject | Tag) => {
        setModalState({
            open: true,
            mode: 'edit',
            item,
            type: item.type as any
        });
    };

    const handleConfirmDelete = (item: Subject | Tag) => {
        setDeleteModal({ open: true, item });
    };

    const handleModalSubmit = async (data: { name: string, color: string }) => {
        const { mode, type, item } = modalState;
        const previousItem = item;

        // --- Optimistic Update for Edit Mode ---
        if (mode === 'edit' && previousItem) {
            commit({
                type: 'entity_patch',
                slice: 'assets',
                id: previousItem.id,
                patch: data,
                updatedAt: new Date().toISOString(),
                seq: Date.now()
            });
        }

        try {
            if (type === 'subject') {
                if (mode === 'create') {
                    await v2Api.createSubject(data);
                } else {
                    await v2Api.updateSubject(item!.id, data);
                }
            } else {
                if (mode === 'create') {
                    await v2Api.createTag(data);
                } else {
                    await v2Api.updateTag(item!.id, data);
                }
            }

            pushEffect({
                id: `manage-succ-${Date.now()}`,
                type: 'toast',
                message: t('common:common.status.success'),
                level: 'success'
            });
        } catch (err: any) {
            // --- Rollback for Edit Mode ---
            if (mode === 'edit' && previousItem) {
                commit({
                    type: 'entity_patch',
                    slice: 'assets',
                    id: previousItem.id,
                    patch: { name: previousItem.name, color: previousItem.color },
                    updatedAt: new Date().toISOString(),
                    seq: Date.now()
                });
            }

            pushEffect({
                id: `manage-err-${Date.now()}`,
                type: 'toast',
                message: err.message || t('common:common.status.error'),
                level: 'error'
            });
            throw err; // Re-throw for modal loading state
        }
    };

    const executeDelete = async () => {
        const item = deleteModal.item;
        if (!item) return;

        // --- Optimistic Removal ---
        commit({
            type: 'entity_remove',
            slice: 'assets',
            id: item.id
        });

        try {
            if (item.type === 'subject') {
                await v2Api.deleteSubject(item.id);
            } else {
                await v2Api.deleteTag(item.id);
            }
            useAppStore.getState().markStale('v:asset', 'delete', 10);
            useAppStore.getState().markStale('v:dashboard', 'delete', 10); // Mark dashboard stale as well
            pushEffect({
                id: `del-succ-${Date.now()}`,
                type: 'toast',
                message: t('common:common.status.success'),
                level: 'success'
            });
        } catch (err: any) {
            // --- Rollback: Restore item ---
            commit({
                type: 'entity_patch',
                slice: 'assets',
                id: item.id,
                patch: item,
                updatedAt: new Date().toISOString(),
                seq: Date.now()
            });

            pushEffect({
                id: `del-err-${Date.now()}`,
                type: 'toast',
                message: err.message || t('common:common.status.error'),
                level: 'error'
            });
        }
    };

    const executeMerge = async (sourceId: string, targetId: string) => {
        try {
            if (mergeModal.type === 'subject') {
                await v2Api.mergeSubject(sourceId, targetId);
            } else {
                await v2Api.mergeTag(sourceId, targetId);
            }
            useAppStore.getState().markStale('v:asset', 'merge', 10);
            pushEffect({
                id: `merge-succ-${Date.now()}`,
                type: 'toast',
                message: t('common:common.status.success'),
                level: 'success'
            });
        } catch (err: any) {
            pushEffect({
                id: `merge-err-${Date.now()}`,
                type: 'toast',
                message: err.message || t('common:common.status.error'),
                level: 'error'
            });
        }
    };


    const handleQuickUpdate = async (id: string, color: string) => {
        const list = activeTab === 'subjects' ? subjects : tags;
        const previousItem = list.find(item => item.id === id);

        if (!previousItem || previousItem.color === color) return;

        // --- Optimistic Update ---
        commit({
            type: 'entity_patch',
            slice: 'assets',
            id,
            patch: { color },
            updatedAt: new Date().toISOString(),
            seq: Date.now()
        });

        try {
            if (activeTab === 'subjects') {
                await v2Api.updateSubject(id, { name: previousItem.name, color });
            } else {
                await v2Api.updateTag(id, { name: previousItem.name, color });
            }
        } catch (err: any) {
            // --- Rollback on Error ---
            commit({
                type: 'entity_patch',
                slice: 'assets',
                id,
                patch: { color: previousItem.color },
                updatedAt: new Date().toISOString(),
                seq: Date.now()
            });

            pushEffect({
                id: `quick-err-${Date.now()}`,
                type: 'toast',
                message: err.message || t('common:common.status.error'),
                level: 'error'
            });
        }
    };

    return (
        <div className="min-h-full p-4 md:p-12 bg-base-100/20">
            <div className="max-w-7xl mx-auto w-full flex flex-col gap-10 reveal-smooth">

                {/* Control Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-4 border-b border-base-content/5">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 text-primary rounded-2xl shadow-sm">
                                <Settings2 className="w-8 h-8" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-base-content tracking-tight uppercase leading-none">
                                    {t('manage.header.title')}
                                </h1>
                                <p className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.3em] mt-2">
                                    {t('manage.header.subtitle')}
                                </p>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex gap-1.5 bg-base-content/5 p-1.5 rounded-[1.25rem] border border-base-content/[0.03] w-fit shadow-inner">
                            <TabButton
                                active={activeTab === 'subjects'}
                                onClick={() => setActiveTab('subjects')}
                                label={t('manage.tabs.subjects')}
                                icon={Layers}
                            />
                            <TabButton
                                active={activeTab === 'tags'}
                                onClick={() => setActiveTab('tags')}
                                label={t('manage.tabs.tags')}
                                icon={Hash}
                            />
                            <TabButton
                                active={activeTab === 'audit'}
                                onClick={() => setActiveTab('audit')}
                                label={t('manage.tabs.audit')}
                                icon={History}
                            />
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setMergeModal({ open: true, type: getTypeFromTab(activeTab) })}
                            className="btn btn-ghost h-12 px-6 rounded-2xl border-base-content/5 border bg-base-100/50 flex items-center gap-3 active:scale-95 transition-all"
                        >
                            <Combine className="w-5 h-5 text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-base-content/70">{t('manage.header.btn_bulk')}</span>
                        </button>
                        <button
                            onClick={handleOpenCreate}
                            className="btn btn-primary h-12 px-8 rounded-2xl shadow-xl shadow-primary/20 flex items-center gap-3 active:scale-95 transition-all font-black"
                        >
                            <Plus className="w-6 h-6" />
                            <span className="text-[10px] uppercase tracking-widest">{t('manage.header.btn_new')}</span>
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative group max-w-xl">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/20 group-focus-within:text-primary transition-colors">
                        <Search className="w-full h-full" />
                    </div>
                    <input
                        id="manage-search"
                        name="search"
                        type="text"
                        aria-label={t('manage.search', { tab: t(`manage.tabs.${activeTab}`) })}
                        placeholder={t('manage.search', { tab: t(`manage.tabs.${activeTab}`) })}
                        autoComplete="off"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="search-pill h-14 w-full pl-14 pr-12 rounded-[1.25rem] text-sm font-black focus:outline-none transition-all"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-5 top-1/2 -translate-y-1/2 p-1.5 hover:bg-base-content/5 rounded-xl transition-colors text-base-content/20 hover:text-base-content/60"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Dynamic Content Sections */}
                <main className="min-h-[50vh]">
                    {activeTab === 'subjects' && (
                        <SubjectGrid
                            subjects={filteredSubjects}
                            onEdit={handleOpenEdit}
                            onDelete={handleConfirmDelete}
                            onCreate={handleOpenCreate}
                            onQuickUpdate={handleQuickUpdate}
                        />
                    )}

                    {activeTab === 'tags' && (
                        <TagTable
                            tags={filteredTags}
                            onEdit={handleOpenEdit}
                            onDelete={handleConfirmDelete}
                        />
                    )}

                    {activeTab === 'audit' && (
                        <AuditTimeline
                            logs={auditLogs}
                            onUndo={async (log) => {
                                pushEffect({
                                    id: `undo-loading-${Date.now()}`,
                                    type: 'toast',
                                    message: t('manage.audit_tab.status_reverting'),
                                    level: 'info'
                                });

                                try {
                                    await v2Api.undoAuditEvent(log.id);
                                    pushEffect({
                                        id: `undo-success-${Date.now()}`,
                                        type: 'toast',
                                        message: t('manage.audit_tab.status_reverted'),
                                        level: 'success'
                                    });
                                } catch (err: any) {
                                    pushEffect({
                                        id: `undo-error-${Date.now()}`,
                                        type: 'toast',
                                        message: err.message || t('common:common.status.error'),
                                        level: 'error'
                                    });
                                }
                            }}
                        />
                    )}
                </main>
            </div>

            {/* Modals */}
            <ManageModal
                isOpen={modalState.open}
                onClose={() => setModalState(prev => ({ ...prev, open: false }))}
                onSubmit={handleModalSubmit}
                initialData={modalState.item ? { name: modalState.item.name, color: modalState.item.color } : undefined}
                type={modalState.type}
                mode={modalState.mode}
            />

            <DeleteConfirmModal
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal(prev => ({ ...prev, open: false, item: null }))}
                onConfirm={executeDelete}
                itemName={deleteModal.item?.name || ''}
                itemType={deleteModal.item?.type || ''}
            />

            <MergeModal
                isOpen={mergeModal.open}
                onClose={() => setMergeModal(prev => ({ ...prev, open: false }))}
                onMerge={executeMerge}
                items={mergeModal.type === 'subject' ? subjects : tags}
                type={mergeModal.type}
            />

            {/* Toast System */}
            <div className="toast toast-end toast-bottom z-[200] p-8 flex flex-col gap-4">
                {effects.slice(-3).map((eff) => (
                    <Toast
                        key={eff.id}
                        id={eff.id}
                        message={eff.message}
                        level={eff.level as ToastLevel}
                        onDismiss={dismissEffect}
                    />
                ))}
            </div>
        </div>
    );
};

interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    label: string;
    icon: any;
}

function TabButton({ active, onClick, label, icon: Icon }: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-6 h-11 rounded-xl flex items-center gap-3 transition-all duration-300 relative group/tab overflow-hidden",
                active
                    ? "bg-base-100 text-primary shadow-xl shadow-black/5 ring-1 ring-base-content/5"
                    : "text-base-content/40 hover:text-base-content/70 hover:bg-base-100/40"
            )}
        >
            {active && (
                <div className="absolute inset-0 bg-primary/5 animate-pulse-slow" />
            )}
            <Icon className={cn("w-4 h-4 transition-transform duration-300", active ? "text-primary scale-110" : "text-current opacity-60 group-hover/tab:scale-110")} />
            <span className="text-[10px] font-black uppercase tracking-widest relative z-10">{label}</span>
        </button>
    );
}
