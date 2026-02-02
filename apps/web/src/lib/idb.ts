/**
 * IndexedDB wrapper for offline draft persistence
 * Uses native IndexedDB API (no external dependencies)
 */

const DB_NAME = 'smartarchive-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

export interface DraftRecord {
    id: string;           // questionId or 'global:noteId'
    content: string;      // markdown content
    updatedAt: number;    // local timestamp (ms)
    syncedAt: number | null; // null = never synced
    version: number;      // for conflict detection
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create drafts store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('syncedAt', 'syncedAt', { unique: false });
            }
        };
    });

    return dbPromise;
}

export async function getDraft(id: string): Promise<DraftRecord | null> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (error) {
        console.error('Failed to get draft:', error);
        return null;
    }
}

export async function saveDraft(draft: Omit<DraftRecord, 'version'> & { version?: number }): Promise<void> {
    try {
        const db = await openDB();
        const existing = await getDraft(draft.id);
        const version = existing ? existing.version + 1 : 1;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ ...draft, version });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('Failed to save draft:', error);
    }
}

export async function deleteDraft(id: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('Failed to delete draft:', error);
    }
}

export async function getAllDrafts(): Promise<DraftRecord[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (error) {
        console.error('Failed to get all drafts:', error);
        return [];
    }
}

export async function getUnsyncedDrafts(): Promise<DraftRecord[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('syncedAt');
            const request = index.getAll(IDBKeyRange.only(null as any));

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (error) {
        console.error('Failed to get unsynced drafts:', error);
        return [];
    }
}

export async function markDraftSynced(id: string): Promise<void> {
    try {
        const draft = await getDraft(id);
        if (draft) {
            await saveDraft({
                ...draft,
                syncedAt: Date.now(),
            });
        }
    } catch (error) {
        console.error('Failed to mark draft synced:', error);
    }
}

// Cleanup old drafts (LRU eviction)
export async function cleanupOldDrafts(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
        const drafts = await getAllDrafts();
        const cutoff = Date.now() - maxAge;

        for (const draft of drafts) {
            // Only delete synced drafts that are old
            if (draft.syncedAt && draft.syncedAt < cutoff) {
                await deleteDraft(draft.id);
            }
        }
    } catch (error) {
        console.error('Failed to cleanup old drafts:', error);
    }
}
