import { useState, useEffect, useCallback, useRef } from 'react';
import { getDraft, saveDraft, deleteDraft, type DraftRecord } from '../lib/idb';

interface UseOfflineDraftResult {
    /** Current draft content from IDB (null if none) */
    draft: string | null;
    /** Save content to IDB (debounced) */
    saveDraft: (content: string) => void;
    /** Clear draft from IDB */
    clearDraft: () => void;
    /** Whether there are pending changes not synced to server */
    hasPendingChanges: boolean;
    /** Last synced timestamp */
    lastSyncedAt: number | null;
    /** Mark draft as synced (call after successful API save) */
    markSynced: () => void;
}

/**
 * Hook for offline draft persistence using IndexedDB
 *
 * @param questionId - The question ID to associate the draft with
 * @param debounceMs - Debounce delay for saving (default 500ms)
 */
export function useOfflineDraft(
    questionId: string,
    debounceMs: number = 500
): UseOfflineDraftResult {
    const [draftRecord, setDraftRecord] = useState<DraftRecord | null>(null);
    const [hasPendingChanges, setHasPendingChanges] = useState(false);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastContentRef = useRef<string>('');

    // Load draft on mount
    useEffect(() => {
        let mounted = true;

        getDraft(questionId).then((record) => {
            if (mounted && record) {
                setDraftRecord(record);
                setHasPendingChanges(record.syncedAt === null);
            }
        });

        return () => {
            mounted = false;
        };
    }, [questionId]);

    // Debounced save function
    const handleSaveDraft = useCallback((content: string) => {
        // Skip if content hasn't changed
        if (content === lastContentRef.current) return;
        lastContentRef.current = content;

        // Clear pending timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Set pending changes immediately for UI feedback
        setHasPendingChanges(true);

        // Debounce the actual save
        saveTimeoutRef.current = setTimeout(async () => {
            const record: Omit<DraftRecord, 'version'> = {
                id: questionId,
                content,
                updatedAt: Date.now(),
                syncedAt: null, // Mark as unsynced
            };

            await saveDraft(record);
            setDraftRecord((prev) => ({
                ...record,
                version: prev ? prev.version + 1 : 1,
            }));
        }, debounceMs);
    }, [questionId, debounceMs]);

    // Clear draft
    const handleClearDraft = useCallback(async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        await deleteDraft(questionId);
        setDraftRecord(null);
        setHasPendingChanges(false);
        lastContentRef.current = '';
    }, [questionId]);

    // Mark as synced
    const markSynced = useCallback(async () => {
        if (draftRecord) {
            const updated: DraftRecord = {
                ...draftRecord,
                syncedAt: Date.now(),
            };
            await saveDraft(updated);
            setDraftRecord(updated);
            setHasPendingChanges(false);
        }
    }, [draftRecord]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        draft: draftRecord?.content ?? null,
        saveDraft: handleSaveDraft,
        clearDraft: handleClearDraft,
        hasPendingChanges,
        lastSyncedAt: draftRecord?.syncedAt ?? null,
        markSynced,
    };
}
