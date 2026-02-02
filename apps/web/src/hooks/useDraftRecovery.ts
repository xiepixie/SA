import { useState, useEffect, useCallback } from 'react';
import { getDraft, deleteDraft } from '../lib/idb';

interface DraftRecoveryState {
    /** Whether there's a recoverable draft newer than server */
    hasRecoverableDraft: boolean;
    /** The recovered content */
    recoveredContent: string | null;
    /** Local draft timestamp */
    localUpdatedAt: number | null;
    /** Server note timestamp (for comparison display) */
    serverUpdatedAt: string | null;
    /** Accept and use the recovered draft */
    acceptRecovery: () => void;
    /** Discard the local draft */
    discardRecovery: () => void;
    /** Whether recovery dialog should be shown */
    showRecoveryDialog: boolean;
}

/**
 * Hook to detect and recover unsynced drafts
 *
 * @param questionId - The question ID
 * @param serverTimestamp - The server's updated_at timestamp (ISO string)
 * @param onRecover - Callback when user accepts recovery with the recovered content
 */
export function useDraftRecovery(
    questionId: string,
    serverTimestamp: string | null,
    onRecover?: (content: string) => void
): DraftRecoveryState {
    const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
    const [recoveredContent, setRecoveredContent] = useState<string | null>(null);
    const [localUpdatedAt, setLocalUpdatedAt] = useState<number | null>(null);
    const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

    // Check for recoverable draft on mount
    useEffect(() => {
        let mounted = true;

        async function checkDraft() {
            const draft = await getDraft(questionId);
            if (!mounted || !draft) return;

            // Check if draft is unsynced (syncedAt is null)
            if (draft.syncedAt !== null) return;

            // Compare timestamps
            const serverTime = serverTimestamp ? new Date(serverTimestamp).getTime() : 0;

            // If local draft is newer than server, offer recovery
            if (draft.updatedAt > serverTime) {
                setHasRecoverableDraft(true);
                setRecoveredContent(draft.content);
                setLocalUpdatedAt(draft.updatedAt);
                setShowRecoveryDialog(true);
            }
        }

        checkDraft();

        return () => {
            mounted = false;
        };
    }, [questionId, serverTimestamp]);

    const acceptRecovery = useCallback(() => {
        if (recoveredContent && onRecover) {
            onRecover(recoveredContent);
        }
        setShowRecoveryDialog(false);
        setHasRecoverableDraft(false);
    }, [recoveredContent, onRecover]);

    const discardRecovery = useCallback(async () => {
        await deleteDraft(questionId);
        setShowRecoveryDialog(false);
        setHasRecoverableDraft(false);
        setRecoveredContent(null);
        setLocalUpdatedAt(null);
    }, [questionId]);

    return {
        hasRecoverableDraft,
        recoveredContent,
        localUpdatedAt,
        serverUpdatedAt: serverTimestamp,
        acceptRecovery,
        discardRecovery,
        showRecoveryDialog,
    };
}
