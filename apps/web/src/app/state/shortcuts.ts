export interface ShortcutConfig {
    key: string; // The primary key combination (e.g., "Space", "Control+z", "Shift+ArrowLeft")
    action: string; // i18n key for the action description
}

export interface ShortcutGroup {
    id: string;
    title: string; // i18n key
    shortcuts: Record<string, ShortcutConfig>;
}

export const DEFAULT_SHORTCUTS: Record<string, ShortcutGroup> = {
    global: {
        id: 'global',
        title: 'settings.shortcuts.global.title',
        shortcuts: {
            'toggle_sidebar': { key: 'Control+b', action: 'settings.shortcuts.global.toggle_sidebar' },
            'dismiss_toast': { key: 'Escape', action: 'settings.shortcuts.global.dismiss_toast' }
        }
    },
    review: {
        id: 'review',
        title: 'settings.shortcuts.review.title',
        shortcuts: {
            'reveal': { key: 'Space', action: 'settings.shortcuts.review.reveal' },
            'rate_1': { key: '1', action: 'settings.shortcuts.review.rate_again' },
            'rate_2': { key: '2', action: 'settings.shortcuts.review.rate_hard' },
            'rate_3': { key: '3', action: 'settings.shortcuts.review.rate_good' },
            'rate_4': { key: '4', action: 'settings.shortcuts.review.rate_easy' },
            'undo': { key: 'Control+z', action: 'settings.shortcuts.review.undo' },
            'choice_a': { key: 'a', action: 'settings.shortcuts.review.choice_a' },
            'choice_b': { key: 'b', action: 'settings.shortcuts.review.choice_b' },
            'choice_c': { key: 'c', action: 'settings.shortcuts.review.choice_c' },
            'choice_d': { key: 'd', action: 'settings.shortcuts.review.choice_d' },
            'get_hint': { key: 'h', action: 'settings.shortcuts.review.get_hint' },
        }
    },
    inspector: {
        id: 'inspector',
        title: 'settings.shortcuts.inspector.title',
        shortcuts: {
            'mode_preview': { key: '1', action: 'settings.shortcuts.inspector.mode_preview' },
            'mode_edit': { key: '2', action: 'settings.shortcuts.inspector.mode_edit' },
            'mode_meta': { key: '3', action: 'settings.shortcuts.inspector.mode_meta' },
            'toggle_answer': { key: 'r', action: 'settings.shortcuts.inspector.toggle_answer' },
            'save': { key: 'Control+s', action: 'settings.shortcuts.inspector.save' },
            'prev': { key: 'ArrowLeft', action: 'library.inspector.navigation.prev' },
            'next': { key: 'ArrowRight', action: 'library.inspector.navigation.next' },
        }
    }
};

export type ShortcutProfile = Record<string, Record<string, string>>; // groupId -> actionId -> key
export type UserShortcuts = Record<string, ShortcutProfile>; // "global" | "device_ID" -> ShortcutProfile
