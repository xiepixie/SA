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
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    // Format as UUID v4-like
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32).padEnd(12, '0')}`;
}

function makeRefNodeId(sourceNoteId: string, targetType: string, targetId: string): string {
    return hashToUuid(`${sourceNoteId}:${targetType}:${targetId}`);
}

/**
 * Extract wiki link references from markdown content
 */
export function extractRefsFromMarkdown(sourceNoteId: string, markdown: string): ExtractedRef[] {
    const refs: ExtractedRef[] = [];
    const seen = new Set<string>();
    let match;

    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(markdown)) !== null) {
        const resolvedId = match[2]; // e.g. "q:abc123" or "n:def456"
        if (!resolvedId) continue; // Unresolved link, skip for now

        const [typePrefix, targetId] = resolvedId.split(':');
        if (!typePrefix || !targetId) continue;

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

    // ── Initialize from server data ──
    useEffect(() => {
        if (!noteId || !isFetched || !noteData) return;

        const serverContent = (noteData as any)?.content?.markdown || (noteData as any)?.plain_text || '';
        const serverTitle = (noteData as any)?.title || '';

        setContent(serverContent);
        setTitle(serverTitle);
        setIsDirty(false);
        setIsInitialized(true);
        setSaveError(null);

        // Check for unsaved IDB draft
        getDraft(`global:${noteId}`).then(draft => {
            if (draft && draft.updatedAt > new Date((noteData as any)?.updated_at).getTime()) {
                // Local draft is newer — restore it
                setContent(draft.content);
                setIsDirty(true);
            }
        }).catch(console.warn);
    }, [noteId, isFetched, noteData]);

    // ── Reset on note change ──
    useEffect(() => {
        return () => {
            // Cleanup timers
            if (idbTimerRef.current) clearTimeout(idbTimerRef.current);
            if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        };
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
            // Extract refs from wiki links
            const refs = extractRefsFromMarkdown(currentNoteId, currentContent);

            await updateNote.mutateAsync({
                id: currentNoteId,
                content: { markdown: currentContent },
                plainText: currentContent,
                title: currentTitle,
                refs,
            });

            setIsDirty(false);
            setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

            // Mark IDB draft as synced
            deleteDraft(`global:${currentNoteId}`).catch(console.warn);
        } catch (err) {
            console.error('Failed to save note:', err);
            setSaveError((err as Error).message || 'Save failed');
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

    // ── Save before unload ──
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (isDirtyRef.current && noteIdRef.current) {
                // Synchronous IDB write as best-effort
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
