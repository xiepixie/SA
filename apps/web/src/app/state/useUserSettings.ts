import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../../lib/supabase';
import i18n from '../i18n';
import type { UserShortcuts } from './shortcuts';

export interface UserSettingsState {
    profile: {
        username: string;
    };
    preferences: {
        countdownMode: 'daily' | 'custom';
        customTargetTime: string; // "HH:mm" 24h format
        customTargetDate: string; // "YYYY-MM-DD" format
        customEventName: string;
        rolloverHour: number; // 0-23
        timezone: string;
        language: string;
        theme: {
            mode: 'light' | 'dark' | 'system';
            lightTheme: string;
            darkTheme: string;
        };
        ux: {
            reflections: boolean;
            animations: boolean;
            reducedMotion: boolean;
        };
        notifications: {
            push: boolean;
            drift: boolean;
            sync: boolean;
        };
        shortcuts: UserShortcuts;
        shortcutProfile: 'global' | 'device';
        deviceId?: string;
    };
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;
    lastSynced: string | null;
    lastLocalUpdateAt: number; // Timestamp for guard
    actions: {
        updateProfile: (profile: Partial<UserSettingsState['profile']>) => Promise<void>;
        updatePreferences: (prefs: Partial<Omit<UserSettingsState['preferences'], 'theme' | 'ux' | 'notifications' | 'shortcuts'>> & {
            theme?: Partial<UserSettingsState['preferences']['theme']>;
            ux?: Partial<UserSettingsState['preferences']['ux']>;
            notifications?: Partial<UserSettingsState['preferences']['notifications']>;
            shortcuts?: Partial<UserSettingsState['preferences']['shortcuts']>;
        }) => Promise<void>;
        syncWithSupabase: () => Promise<void>;
        subscribeToChanges: () => () => void;
    };
}

let _isSubscribed = false;

// Simple helper for deep equality (stable structures)
const arePreferencesEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

export const useUserSettings = create<UserSettingsState>()(
    persist(
        (set, get) => ({
            profile: {
                username: '',
            },
            preferences: {
                countdownMode: 'daily',
                customTargetTime: '18:00',
                customTargetDate: '',
                customEventName: '',
                rolloverHour: 4,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                language: 'en',
                theme: {
                    mode: 'system',
                    lightTheme: 'liquid-light',
                    darkTheme: 'liquid-dark',
                },
                ux: {
                    reflections: true,
                    animations: true,
                    reducedMotion: false,
                },
                notifications: {
                    push: true,
                    drift: true,
                    sync: false,
                },
                shortcuts: {},
                shortcutProfile: 'global',
                deviceId: typeof window !== 'undefined' ? (localStorage.getItem('sa_device_id') || crypto.randomUUID()) : undefined
            },
            isLoading: false,
            isSaving: false,
            error: null,
            lastSynced: null,
            lastLocalUpdateAt: 0,
            actions: {
                syncWithSupabase: async () => {
                    const state = get();
                    if (state.isLoading) return;

                    // Ensure local device ID is persisted
                    if (state.preferences.deviceId && typeof window !== 'undefined') {
                        localStorage.setItem('sa_device_id', state.preferences.deviceId);
                    }

                    set({ isLoading: true, error: null });
                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                            set({ isLoading: false });
                            return;
                        }

                        const { data, error } = await supabase.rpc('get_user_preferences');

                        if (error) throw error;

                        const prefs = Array.isArray(data) ? data[0] : (data as any);

                        if (prefs && prefs.has_preferences) {
                            const newProfile = {
                                username: prefs.display_name || '',
                            };
                            const newPrefs: UserSettingsState['preferences'] = {
                                countdownMode: (prefs.countdown_mode as any) || 'daily',
                                customTargetTime: prefs.custom_target_time || '18:00',
                                customTargetDate: prefs.custom_target_date || '',
                                customEventName: prefs.custom_event_name || '',
                                rolloverHour: prefs.rollover_hour || 4,
                                timezone: prefs.timezone || 'UTC',
                                language: prefs.language || 'en',
                                theme: {
                                    mode: (prefs.theme_mode as any) || 'system',
                                    lightTheme: prefs.light_theme || 'liquid-light',
                                    darkTheme: prefs.dark_theme || 'liquid-dark',
                                },
                                ux: {
                                    reflections: prefs.ux_reflections ?? true,
                                    animations: prefs.ux_animations ?? true,
                                    reducedMotion: prefs.ux_reduced_motion ?? false,
                                },
                                notifications: {
                                    push: prefs.notify_push ?? true,
                                    drift: prefs.notify_drift ?? true,
                                    sync: prefs.notify_sync ?? false,
                                },
                                shortcuts: prefs.shortcuts || {},
                                shortcutProfile: (prefs.shortcut_profile as any) || 'global',
                                deviceId: state.preferences.deviceId // Keep local device ID
                            };

                            // Only update if there's an actual change and we're not currently saving
                            const profileChanged = state.profile.username !== newProfile.username;
                            const prefsChanged = !arePreferencesEqual(state.preferences, newPrefs);

                            if ((profileChanged || prefsChanged) && !get().isSaving) {
                                set({
                                    profile: newProfile,
                                    preferences: newPrefs,
                                    lastSynced: new Date().toISOString()
                                });

                                if (newPrefs.language && i18n.language !== newPrefs.language) {
                                    i18n.changeLanguage(newPrefs.language);
                                }
                            } else {
                                // Even if no change, update sync time to confirm cloud integrity
                                set({ lastSynced: new Date().toISOString() });
                            }
                        }
                    } catch (e: any) {
                        set({ error: e.message });
                    } finally {
                        set({ isLoading: false });
                    }
                },
                subscribeToChanges: () => {
                    if (_isSubscribed) return () => { };
                    _isSubscribed = true;

                    const channel = supabase
                        .channel('user-prefs-realtime')
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'user_preferences'
                            },
                            () => {
                                // Guard: If we just performed a local update, ignore incoming realtime sync
                                // to prevent "echo" overwrites which cause flickering.
                                const now = Date.now();
                                if (now - get().lastLocalUpdateAt < 2000) {
                                    return;
                                }
                                get().actions.syncWithSupabase();
                            }
                        )
                        .subscribe();

                    return () => {
                        supabase.removeChannel(channel);
                        _isSubscribed = false;
                    };
                },
                updateProfile: async (profile) => {
                    const currentProfile = get().profile;
                    const nextProfile = { ...currentProfile, ...profile };
                    set({ profile: nextProfile, lastLocalUpdateAt: Date.now(), isSaving: true });

                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            await supabase.rpc('update_user_preferences', {
                                p_display_name: nextProfile.username || null,
                                p_clear_display_name: !nextProfile.username
                            });
                        }
                    } finally {
                        set({ isSaving: false });
                    }
                },
                updatePreferences: async (prefs) => {
                    const currentStore = get();
                    const currentPrefs = currentStore.preferences;

                    const nextTheme = { ...currentPrefs.theme, ...prefs.theme };
                    const nextUx = { ...currentPrefs.ux, ...prefs.ux };
                    const nextNotifications = { ...currentPrefs.notifications, ...prefs.notifications };

                    // Deep merge shortcuts if provided
                    let nextShortcuts = currentPrefs.shortcuts;
                    if (prefs.shortcuts) {
                        nextShortcuts = { ...currentPrefs.shortcuts };
                        for (const profileId in prefs.shortcuts) {
                            const profileData = prefs.shortcuts[profileId];
                            nextShortcuts[profileId] = {
                                ...(nextShortcuts[profileId] || {}),
                                ...profileData
                            };

                            // Re-merge groups within the profile
                            for (const groupId in profileData) {
                                nextShortcuts[profileId]![groupId] = {
                                    ...(nextShortcuts[profileId]![groupId] || {}),
                                    ...(profileData[groupId] as any)
                                };
                            }
                        }
                    }

                    const nextPrefs: UserSettingsState['preferences'] = {
                        ...currentPrefs,
                        ...prefs,
                        theme: nextTheme,
                        ux: nextUx,
                        notifications: nextNotifications,
                        shortcuts: nextShortcuts,
                    };

                    // Optimistic update
                    set({
                        preferences: nextPrefs,
                        lastLocalUpdateAt: Date.now(),
                        isSaving: true
                    });

                    try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            // Map store state to RPC parameters
                            await supabase.rpc('update_user_preferences', {
                                p_countdown_mode: nextPrefs.countdownMode,
                                p_custom_target_time: nextPrefs.customTargetTime || null,
                                p_custom_target_date: nextPrefs.customTargetDate || null,
                                p_clear_custom_target_date: !nextPrefs.customTargetDate,
                                p_custom_event_name: nextPrefs.customEventName || null,
                                p_clear_custom_event_name: !nextPrefs.customEventName,
                                p_rollover_hour: nextPrefs.rolloverHour,
                                p_timezone: nextPrefs.timezone,
                                p_theme_mode: nextPrefs.theme.mode,
                                p_light_theme: nextPrefs.theme.lightTheme,
                                p_dark_theme: nextPrefs.theme.darkTheme,
                                p_ux_reflections: nextPrefs.ux.reflections,
                                p_ux_animations: nextPrefs.ux.animations,
                                p_ux_reduced_motion: nextPrefs.ux.reducedMotion,
                                p_notify_push: nextPrefs.notifications.push,
                                p_notify_drift: nextPrefs.notifications.drift,
                                p_notify_sync: nextPrefs.notifications.sync,
                                p_language: nextPrefs.language,
                                p_shortcuts: nextPrefs.shortcuts,
                                p_shortcut_profile: nextPrefs.shortcutProfile,
                                p_device_id: nextPrefs.deviceId
                            });
                        }
                    } finally {
                        set({ isSaving: false });
                    }
                },
            },
        }),
        {
            name: 'user-settings-storage',
            version: 1,
            migrate: (persistedState: any, version: number) => {
                if (version === 0 && persistedState && typeof persistedState === 'object') {
                    const { actions, ...rest } = persistedState;
                    return rest;
                }
                return persistedState;
            },
            partialize: (state) => ({
                profile: state.profile,
                preferences: state.preferences,
            }),
        }
    )
);
