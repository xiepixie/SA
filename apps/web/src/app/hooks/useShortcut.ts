import { useUserSettings } from '../state/useUserSettings';
import { DEFAULT_SHORTCUTS } from '../state/shortcuts';
import { useCallback } from 'react';

/**
 * Hook to get the effective key combination for a shortcut action.
 * Merges user overrides with defaults.
 */
export function useShortcut() {
    const shortcuts = useUserSettings(state => state.preferences.shortcuts);
    const profile = useUserSettings(state => state.preferences.shortcutProfile);
    const deviceId = useUserSettings(state => state.preferences.deviceId);

    const getShortcut = useCallback((groupId: string, actionId: string): string => {
        // 1. Check device specific override
        if (profile === 'device' && deviceId) {
            const deviceProfile = shortcuts[`device_${deviceId}`];
            if (deviceProfile?.[groupId]?.[actionId]) {
                return deviceProfile[groupId][actionId];
            }
        }

        // 2. Check global user override
        const globalProfile = shortcuts['global'];
        if (globalProfile?.[groupId]?.[actionId]) {
            return globalProfile[groupId][actionId];
        }

        // 3. Fallback to default
        const group = DEFAULT_SHORTCUTS[groupId];
        if (group && group.shortcuts[actionId]) {
            return group.shortcuts[actionId].key;
        }

        return '';
    }, [shortcuts, profile, deviceId]);

    /**
     * Helper to check if a KeyboardEvent matches a shortcut
     */
    const matchesShortcut = useCallback((e: KeyboardEvent, groupId: string, actionId: string): boolean => {
        const keyConfig = getShortcut(groupId, actionId);
        if (!keyConfig) return false;

        const parts = keyConfig.split('+').map(p => p.trim().toLowerCase());

        // Modifier checks
        const needsCtrl = parts.includes('control') || parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta');
        const needsShift = parts.includes('shift');
        const needsAlt = parts.includes('alt');

        // Note: We use e.ctrlKey || e.metaKey to support both Windows Ctrl and Mac Cmd with one "Control" or "Cmd" label
        const hasCtrl = e.ctrlKey || e.metaKey;
        const hasShift = e.shiftKey;
        const hasAlt = e.altKey;

        if (needsCtrl !== hasCtrl) return false;
        if (needsShift !== hasShift) return false;
        if (needsAlt !== hasAlt) return false;

        // Key check
        const mainKey = parts.filter(p => !['control', 'ctrl', 'cmd', 'meta', 'shift', 'alt'].includes(p))[0];

        // Handle special keys like Space, Arrow keys, etc.
        // e.code is usually better for location-independent keys (like Space, Enter, Arrows)
        // e.key is better for character keys (a, b, c)

        const eventKey = e.key.toLowerCase();
        const eventCode = e.code.toLowerCase();

        // Special case mapping for common labels
        const codeMap: Record<string, string[]> = {
            'space': ['space'],
            'enter': ['enter', 'return'],
            'esc': ['escape'],
            'escape': ['escape'],
            'arrowleft': ['arrowleft', 'left'],
            'arrowright': ['arrowright', 'right'],
            'arrowup': ['arrowup', 'up'],
            'arrowdown': ['arrowdown', 'down'],
        };

        if (codeMap[mainKey]) {
            return codeMap[mainKey].includes(eventCode) || codeMap[mainKey].includes(eventKey);
        }

        return eventKey === mainKey;
    }, [getShortcut]);

    return { getShortcut, matchesShortcut };
}
