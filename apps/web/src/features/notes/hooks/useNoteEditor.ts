/**
 * useNoteEditor — Core state management for the Global Note editor
 *
 * Manages: noteId, title, draft content, dirty tracking, two-tier autosave,
 * reference extraction from [[wiki links]], and note switching.
 *
 * Two-tier save strategy:
 *   L1 (IDB): 500ms debounce — survives crashes/offline
 *   L2 (Server): 2s idle or blur/switch — persists to Supabase
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { saveDraft, getDraft, deleteDraft } from '../../../lib/idb';
import { useUpdateNote, useNote } from '../../../queries/notes';

// ─── Wiki Link Parsing ────────────────────────────────────────────

/**
 * Wiki link format: [[Display Title|type:id]]
 *   - type: 'q' (question) or 'n' (note)
 *   - If no pipe: [[Display Title]] — unresolved, needs fuzzy match
 */
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface ExtractedRef {
    ref_node_id: string;
    target_question_id: string | null;
    target_note_id: string | null;
    target_part: string | null;
    target_anchor: string | null;
    mode: string;
}

/**
 * Deterministic hash for ref_node_id
 * Uses a simple string hash → UUID-like format
 * Same source+target always produces same ref_node_id
 */
function hashToUuid(input: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0xfa4a20b0, h4 = 0x6ed76b94;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
        h3 = Math.imul(h3 ^ ch, 0x9e3779b9);
        h4 = Math.imul(h4 ^ ch, 0x3243f6a8);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
    h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);

    const s1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const s2 = (h2 >>> 0).toString(16).padStart(8, '0');
    const s3 = (h3 >>> 0).toString(16).padStart(8, '0');
    const s4 = (h4 >>> 0).toString(16).padStart(8, '0');

    const hex = s1 + s2 + s3 + s4;

    // UUID v4-like format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function makeRefNodeId(sourceNoteId: string, targetType: string, targetId: string): string {
    return hashToUuid(`${sourceNoteId}:${targetType}:${targetId}`);
}

const IS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract wiki link references from markdown content
 */
export function extractRefsFromMarkdown(sourceNoteId: string, markdown: string): ExtractedRef[] {
    if (!sourceNoteId) return [];
    const refs: ExtractedRef[] = [];
    const seen = new Set<string>();
    let match;

    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(markdown)) !== null) {
        const resolvedId = match[2]; // e.g. "q:abc123" or "n:def456"
        if (!resolvedId) continue; // Unresolved link, skip for now

        const [typePrefix, targetId] = resolvedId.split(':');
        if (!typePrefix || !targetId) continue;

        // ✅ IMPORTANT: UUID check to prevent 500 errors on DB cast
        if (!IS_UUID_RE.test(targetId)) continue;

        const dedupeKey = `${typePrefix}:${targetId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const refNodeId = makeRefNodeId(sourceNoteId, typePrefix, targetId);

        refs.push({
            ref_node_id: refNodeId,
            target_question_id: typePrefix === 'q' ? targetId : null,
            target_note_id: typePrefix === 'n' ? targetId : null,
            target_part: null,
            target_anchor: match[1], // Display text as anchor
            mode: 'LIVE',
        });
    }

    return refs;
}

// ─── Hook ─────────────────────────────────────────────────────────

export interface NoteEditorState {
    noteId: string | null;
    title: string;
    content: string;
    isDirty: boolean;
    isSaving: boolean;
    lastSavedAt: string | null;
    saveError: string | null;
    isLoading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useNoteEditor(noteId: string | null) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Fetch note data
    const { data: noteData, isLoading: isNoteLoading, isFetched } = useNote(
        noteId || '',
        !!noteId
    );

    const updateNote = useUpdateNote();

    // Refs for latest values (avoid stale closures)
    const contentRef = useRef(content);
    contentRef.current = content;
    const titleRef = useRef(title);
    titleRef.current = title;
    const noteIdRef = useRef(noteId);
    noteIdRef.current = noteId;
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const saveInProgressRef = useRef(false);

    // Timers
    const idbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track current note's folder status and previous noteId for save-on-switch
    const currentIsFolderRef = useRef(false);
    const prevNoteIdRef = useRef<string | null>(null);

    // Refs for synchronization
    const syncedContentRef = useRef<string>('');
    const isSyncingRef = useRef(false);

    // ── Initialize from server data ──
    useEffect(() => {
        if (!noteId || !isFetched || !noteData) return;

        const serverContent = (noteData as any)?.content?.markdown || (noteData as any)?.plain_text || '';
        const serverTitle = (noteData as any)?.title || '';

        // Only update if content actually changed and we aren't currently editing a dirty document
        const isContentDifferent = serverContent !== syncedContentRef.current;

        if (isContentDifferent || !isInitialized) {
            // Check for unsaved IDB draft (only on initial load)
            if (!isInitialized) {
                getDraft(`global:${noteId}`).then(draft => {
                    if (draft && draft.updatedAt > new Date((noteData as any)?.updated_at).getTime()) {
                        // Local draft is newer — restore it
                        setContent(draft.content);
                        setIsDirty(true);
                        syncedContentRef.current = serverContent; // Still track server content
                    } else {
                        isSyncingRef.current = true;
                        setContent(serverContent);
                        setTitle(serverTitle);
                        setIsDirty(false);
                        syncedContentRef.current = serverContent;
                    }
                    setIsInitialized(true);
                }).catch(err => {
                    console.warn(err);
                    setIsInitialized(true);
                });
            } else if (!isDirtyRef.current) {
                // Not dirty, safe to sync remote changes
                isSyncingRef.current = true;
                setContent(serverContent);
                setTitle(serverTitle);
                syncedContentRef.current = serverContent;
            }
        }

        // Track folder status of the loaded note for save-on-switch logic
        currentIsFolderRef.current = (noteData as any)?.is_folder || false;
        setSaveError(null);
    }, [noteId, isFetched, noteData, isInitialized]);

    // ── Flush + Reset on note change ──
    useEffect(() => {
        const prevId = prevNoteIdRef.current;

        // Flush old note's dirty data before switching
        if (prevId && prevId !== noteId && isDirtyRef.current) {
            const oldContent = contentRef.current;
            const oldTitle = titleRef.current;
            const wasFolder = currentIsFolderRef.current;

            if (wasFolder) {
                // Folder: title-only update (content must be NULL per DB constraint)
                updateNote.mutateAsync({ id: prevId, title: oldTitle })
                    .catch(err => console.warn('Auto-save folder on switch failed:', err));
            } else {
                const refs = extractRefsFromMarkdown(prevId, oldContent);
                updateNote.mutateAsync({
                    id: prevId,
                    content: { markdown: oldContent },
                    plainText: oldContent,
                    title: oldTitle,
                    refs,
                }).then(() => {
                    deleteDraft(`global:${prevId}`).catch(console.warn);
                }).catch(err => console.warn('Auto-save on switch failed:', err));
            }
        }

        prevNoteIdRef.current = noteId;

        // Reset state for the new note
        setIsInitialized(false);
        setContent('');
        setTitle('');
        setIsDirty(false);
        setSaveError(null);
        setLastSavedAt(null);
        syncedContentRef.current = '';
        currentIsFolderRef.current = false;

        // Clear pending timers
        if (idbTimerRef.current) clearTimeout(idbTimerRef.current);
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current);

        return () => {
            if (idbTimerRef.current) clearTimeout(idbTimerRef.current);
            if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId]);

    // ── L1: Save to IDB (500ms debounce) ──
    const saveToIDB = useCallback((text: string) => {
        if (!noteIdRef.current) return;

        if (idbTimerRef.current) clearTimeout(idbTimerRef.current);
        idbTimerRef.current = setTimeout(() => {
            const currentNoteId = noteIdRef.current;
            if (!currentNoteId) return;

            saveDraft({
                id: `global:${currentNoteId}`,
                content: text,
                updatedAt: Date.now(),
                syncedAt: null,
            }).catch(console.warn);
        }, 500);
    }, []);

    // ── L2: Save to Server (2s idle) ──
    const flushToServer = useCallback(async () => {
        const currentNoteId = noteIdRef.current;
        if (!currentNoteId || !isDirtyRef.current || saveInProgressRef.current) return;

        saveInProgressRef.current = true;
        setIsSaving(true);
        setSaveError(null);

        const currentContent = contentRef.current;
        const currentTitle = titleRef.current;

        try {
            // Safety: If it's a folder, we MUST NOT send content according to DB constraints
            const isFolder = currentIsFolderRef.current;

            if (isFolder) {
                await updateNote.mutateAsync({
                    id: currentNoteId,
                    title: currentTitle,
                });
            } else {
                // Extract Refs before saving
                const refs = extractRefsFromMarkdown(currentNoteId, currentContent);

                await updateNote.mutateAsync({
                    id: currentNoteId,
                    content: { markdown: currentContent },
                    plainText: currentContent,
                    title: currentTitle,
                    refs,
                });
            }

            setIsDirty(false);
            setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

            // Mark IDB draft as synced
            deleteDraft(`global:${currentNoteId}`).catch(console.warn);
        } catch (err: any) {
            console.error('Failed to save note:', err);
            // More detailed error parsing
            const errorMessage = err.message || 'Save failed';
            const details = err.details ? `: ${err.details}` : '';
            setSaveError(`${errorMessage}${details}`);
        } finally {
            saveInProgressRef.current = false;
            setIsSaving(false);
        }
    }, [updateNote]);

    // Schedule server save with 2s idle debounce
    const scheduleServerSave = useCallback(() => {
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        serverTimerRef.current = setTimeout(() => {
            flushToServer();
        }, 2000);
    }, [flushToServer]);

    // ── Content Change Handler ──
    const handleContentChange = useCallback((newContent: string) => {
        // If this change came from our own synchronization effect, skip re-dirtying
        if (isSyncingRef.current) {
            isSyncingRef.current = false;
            return;
        }

        setContent(newContent);
        setIsDirty(true);

        // L1: IDB save (fast)
        saveToIDB(newContent);

        // L2: Server save (delayed)
        scheduleServerSave();
    }, [saveToIDB, scheduleServerSave]);

    // ── Title Change Handler ──
    const handleTitleChange = useCallback((newTitle: string) => {
        setTitle(newTitle);
        setIsDirty(true);
        scheduleServerSave();
    }, [scheduleServerSave]);

    // ── Force Save (for blur / note switch) ──
    const forceSave = useCallback(async () => {
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        await flushToServer();
    }, [flushToServer]);

    // ── Save on window blur ──
    useEffect(() => {
        const handleBlur = () => {
            if (isDirtyRef.current) {
                flushToServer();
            }
        };

        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [flushToServer]);

    // ── Auto-dismiss save error after 8 seconds ──
    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 8000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // ── Save before unload ──
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (isDirtyRef.current && noteIdRef.current) {
                // Best-effort async IDB write — may not complete before page unload
                const currentContent = contentRef.current;
                const currentNoteId = noteIdRef.current;
                try {
                    saveDraft({
                        id: `global:${currentNoteId}`,
                        content: currentContent,
                        updatedAt: Date.now(),
                        syncedAt: null,
                    });
                } catch { /* best effort */ }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    return {
        // State
        noteId,
        title,
        content,
        isDirty,
        isSaving,
        lastSavedAt,
        saveError,
        isLoading: isNoteLoading && !isInitialized,

        // Actions
        setContent: handleContentChange,
        setTitle: handleTitleChange,
        forceSave,
        flushToServer,
    };
}
