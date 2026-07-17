import { ref } from 'vue';

const STORAGE_KEY = 'laradisco:message-drafts';
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

interface DraftEntry {
    content: string;
    savedAt: number;
}

type DraftMap = Record<string, DraftEntry>;

function pruneExpired(map: DraftMap): DraftMap {
    const cutoff = Date.now() - MAX_AGE_MS;
    const pruned: DraftMap = {};
    for (const [key, entry] of Object.entries(map)) {
        if (entry.savedAt >= cutoff) pruned[key] = entry;
    }
    return pruned;
}

// DM drafts are E2EE message text — they live in memory only and are never
// written to localStorage (plaintext LevelDB on disk).
function isDmKey(key: string): boolean {
    return key.startsWith('dm:');
}

function loadDrafts(): DraftMap {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed: DraftMap = stored ? JSON.parse(stored) : {};
        const pruned: DraftMap = {};
        for (const [key, entry] of Object.entries(pruneExpired(parsed))) {
            if (!isDmKey(key)) pruned[key] = entry;
        }
        if (Object.keys(pruned).length !== Object.keys(parsed).length) {
            persistDrafts(pruned); // also scrubs any DM drafts persisted by older builds
        }
        return pruned;
    } catch (error) {
        console.error(error);
        return {};
    }
}

function persistDrafts(drafts: DraftMap): void {
    try {
        const persistable: DraftMap = {};
        for (const [key, entry] of Object.entries(drafts)) {
            if (!isDmKey(key)) persistable[key] = entry;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch (error) {
        console.error(error);
    }
}

const drafts = ref<DraftMap>(loadDrafts());

/**
 * Persists in-progress composer text per conversation (channel/DM/thread) so
 * switching away and back - or restarting the app - doesn't lose what was typed.
 * Drafts older than MAX_AGE_MS are pruned on load so abandoned text doesn't
 * accumulate forever.
 */
export function useDraftMessages() {
    function getDraft(key: string | undefined): string {
        if (!key) return '';
        return drafts.value[key]?.content ?? '';
    }

    function setDraft(key: string | undefined, content: string): void {
        if (!key) return;
        if ((drafts.value[key]?.content ?? '') === content) return;

        const next = { ...drafts.value };
        if (content.length === 0) {
            delete next[key];
        } else {
            next[key] = { content, savedAt: Date.now() };
        }
        drafts.value = next;
        persistDrafts(next);
    }

    function clearDraft(key: string | undefined): void {
        setDraft(key, '');
    }

    return { getDraft, setDraft, clearDraft };
}
