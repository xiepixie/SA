import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    Settings,
    Sliders,
    ShieldCheck,
    Moon,
    Sun,
    Activity,
    Database,
    Key,
    Keyboard,
    ChevronRight,
    ArrowUpRight,
    User,
    Clock,
    Loader2,
    Check,
    X,
    Languages,
    RefreshCw
} from 'lucide-react';
import { useUserSettings } from '../app/state/useUserSettings';
import { useDebounce } from '../hooks/useDebounce';
import { useShortcut } from '../app/hooks/useShortcut';
import { DEFAULT_SHORTCUTS, type ShortcutGroup, type ShortcutConfig, type ShortcutProfile } from '../app/state/shortcuts';
import { useFsrsProfile } from '../hooks/useFsrsProfile';
import { useNavigate } from 'react-router-dom';
import { GlassSelect, type GlassSelectOption, type GlassSelectGroup } from '../components/ui';

export const SettingsPage: React.FC = () => {
    const { i18n, t } = useTranslation();
    const [section, setSection] = useState<'general' | 'algorithm' | 'security' | 'display' | 'shortcuts'>('general');
    const [shortcutCategory, setShortcutCategory] = useState<string>('global');
    const navigate = useNavigate();
    const profile = useUserSettings(s => s.profile);
    const preferences = useUserSettings(s => s.preferences);
    const actions = useUserSettings(s => s.actions);

    // Defensive defaults for theme during hydration
    const theme = preferences?.theme ?? { mode: 'system' as const, lightTheme: 'liquid-light', darkTheme: 'liquid-dark' };

    const languageOptions: GlassSelectOption<string>[] = useMemo(() => [
        { value: 'en', label: 'English (Global)' },
        { value: 'zh', label: '简体中文 (Chinese)' }
    ], []);

    const rolloverOptions: GlassSelectOption<number>[] = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(h => ({
        value: h,
        label: `${String((h % 12) || 12).padStart(2, '0')}:00 AM`,
        recommended: h === 4
    })), []);

    const timezoneGroups: GlassSelectGroup<string>[] = useMemo(() => [
        {
            label: t('common.continents.asia_oceania'),
            options: [
                { value: 'Asia/Shanghai', label: 'Shanghai (UTC+8)' },
                { value: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)' },
                { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
                { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
                { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
                { value: 'Asia/Taipei', label: 'Taipei (UTC+8)' },
                { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
                { value: 'Australia/Sydney', label: 'Sydney (UTC+11)' },
            ]
        },
        {
            label: t('common.continents.europe_africa'),
            options: [
                { value: 'Europe/London', label: 'London (UTC+0)' },
                { value: 'Europe/Paris', label: 'Paris (UTC+1)' },
                { value: 'Europe/Berlin', label: 'Berlin (UTC+1)' },
                { value: 'Europe/Moscow', label: 'Moscow (UTC+3)' },
                { value: 'Africa/Cairo', label: 'Cairo (UTC+2)' },
                { value: 'Africa/Johannesburg', label: 'Johannesburg (UTC+2)' },
            ]
        },
        {
            label: t('common.continents.americas'),
            options: [
                { value: 'America/New_York', label: 'New York (UTC-5)' },
                { value: 'America/Chicago', label: 'Chicago (UTC-6)' },
                { value: 'America/Denver', label: 'Denver (UTC-7)' },
                { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8)' },
                { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
                { value: 'America/Mexico_City', label: 'Mexico City (UTC-6)' },
            ]
        },
        {
            label: t('common.continents.system'),
            options: [
                { value: 'UTC', label: 'Universal Time (UTC)' },
            ]
        }
    ], [t]);

    // Auto-save Status
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isExpertMode, setIsExpertMode] = useState(false);

    // Local state for debounced inputs
    const [localUsername, setLocalUsername] = useState(profile.username);
    const debouncedUsername = useDebounce(localUsername, 800);

    const { profile: fsrsProfile, isLoading: isFsrsLoading, updateProfile, updateProfileAsync } = useFsrsProfile();

    // ---------------------------------------------------------
    // REAL-TIME SYSTEM HEALTH LOGIC
    // ---------------------------------------------------------
    const [storageInfo, setStorageInfo] = useState<{ percentage: string; size: string }>({ percentage: '--%', size: '--MB' });
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if ('storage' in navigator && 'estimate' in navigator.storage) {
            navigator.storage.estimate().then(estimate => {
                if (estimate.usage !== undefined && estimate.quota !== undefined) {
                    const used = estimate.usage / (1024 * 1024);
                    const total = estimate.quota / (1024 * 1024);
                    const pct = Math.round((used / total) * 100);
                    setStorageInfo({
                        percentage: `${100 - pct}% `,
                        size: `${Math.round(used)} MB`
                    });
                }
            });
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handlePushToggle = async (checked: boolean) => {
        if (checked && 'Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                updatePref({ notifications: { push: false } });
                return;
            }
        }
        updatePref({ notifications: { push: checked } });
    };

    // Sync from Supabase on mount
    useEffect(() => {
        actions.syncWithSupabase();
    }, []); // eslint-disable-line

    // Sync local state when store changes externally
    useEffect(() => {
        if (saveStatus === 'idle') {
            if (profile.username !== localUsername) setLocalUsername(profile.username);
        }
    }, [profile.username]); // eslint-disable-line

    // Auto-save effects
    useEffect(() => {
        if (debouncedUsername !== profile.username && saveStatus !== 'saving') {
            handleSave(() => actions.updateProfile({ username: debouncedUsername }));
        }
    }, [debouncedUsername]); // eslint-disable-line


    const handleSave = async (mutation: () => Promise<void>) => {
        setSaveStatus('saving');
        try {
            await mutation();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2500);
        } catch (e) {
            console.error('Save failed:', e);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    // Helper for direct toggles
    const updatePref = (updater: Parameters<typeof actions.updatePreferences>[0]) => {
        handleSave(() => actions.updatePreferences(updater));
    };

    const handleLanguageChange = (lang: string) => {
        i18n.changeLanguage(lang);
        updatePref({ language: lang });
    };

    const handleManualSync = async () => {
        setSaveStatus('saving');
        await actions.syncWithSupabase();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
    };

    // Derived values for preview (using actual preferences now)
    const nextRollover = useMemo(() => {
        const now = new Date();
        const d = new Date(now);
        if (d.getHours() >= preferences.rolloverHour) {
            d.setDate(d.getDate() + 1);
        }
        d.setHours(preferences.rolloverHour, 0, 0, 0);
        const diffMs = d.getTime() - now.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        return { time: d, hours, minutes };
    }, [preferences.rolloverHour]);

    return (
        <div className="min-h-full p-4 md:p-12">
            <div className="max-w-7xl mx-auto w-full flex flex-col gap-8 reveal-smooth">
                <div className="space-y-1 flex justify-between items-start">
                    <div className="flex-1">
                        <h2 className="text-3xl font-black text-base-content tracking-tight uppercase flex items-center gap-3">
                            {t('nav.items.settings')}
                            {isExpertMode && (
                                <span className="text-[10px] bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full tracking-[0.2em] font-black animate-pulse">
                                    EXPERT
                                </span>
                            )}
                        </h2>
                        <p className="text-sm font-bold text-base-content/40 uppercase tracking-widest">{t('nav.sections.systems')}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        {/* Auto-save Indicator */}
                        <div className={`
                            flex items - center gap - 3 px - 4 py - 2.5 rounded - 2xl border text - [10px] font - black uppercase tracking - widest transition - all duration - 700 min - h - [46px]
                            ${saveStatus === 'saving' ? 'bg-primary/5 text-primary border-primary/20 shadow-[0_0_20px_-5px_oklch(from_var(--color-primary)_l_c_h_/_0.15)] scale-105' : ''}
                            ${saveStatus === 'saved' ? 'bg-success/10 text-success border-success/20' : ''}
                            ${saveStatus === 'error' ? 'bg-error/10 text-error border-error/20' : ''}
                            ${saveStatus === 'idle' ? 'bg-base-200/50 text-base-content/30 border-base-content/5 opacity-60' : 'opacity-100 translate-y-0'}
`}>
                            {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {saveStatus === 'saved' && <Check className="w-3.5 h-3.5 animate-in zoom-in duration-300" />}
                            {saveStatus === 'error' && <X className="w-3.5 h-3.5" />}
                            {saveStatus === 'idle' && (
                                <div className="relative flex items-center justify-center w-3.5 h-3.5">
                                    <div className={`absolute inset-0 rounded-full ${isOnline ? 'bg-success/20 animate-ping' : 'bg-error/20 animate-ping'}`}></div>
                                    <Activity className={`w-3.5 h-3.5 ${isOnline ? 'text-success' : 'text-error'}`} />
                                </div>
                            )}
                            <div className="flex flex-col justify-center">
                                <span>
                                    {saveStatus === 'saving' && t('settings.status.saving')}
                                    {saveStatus === 'saved' && t('settings.status.saved')}
                                    {saveStatus === 'error' && (t('settings.status.error') || 'Error')}
                                    {saveStatus === 'idle' && (t('settings.status.synced') || 'Cloud Integrity')}
                                </span>
                                {saveStatus === 'idle' && useUserSettings.getState().lastSynced && (
                                    <span className="text-[7px] opacity-40 -mt-1 tracking-normal font-mono normal-case">
                                        Last sync {new Date(useUserSettings.getState().lastSynced!).toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Manual Sync Button */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsExpertMode(!isExpertMode)}
                                className={`text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-1.5 px-2 py-1 rounded-lg border
                                    ${isExpertMode ? 'border-primary/40 text-primary bg-primary/5' : 'border-transparent text-base-content/20 hover:text-base-content/40'}
                                `}
                            >
                                <Moon className={`w-2.5 h-2.5 ${isExpertMode ? 'fill-primary' : ''}`} />
                                {isExpertMode ? t('settings.expert.exit') : t('settings.expert.mode_label')}
                            </button>

                            <button
                                onClick={handleManualSync}
                                disabled={saveStatus === 'saving'}
                                className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/20 hover:text-primary transition-colors flex items-center gap-1.5 px-2 py-1 group"
                            >
                                <Database className="w-2.5 h-2.5 group-hover:rotate-180 transition-transform duration-700" />
                                {t('settings.status.refresh') || 'Force Refresh'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
                    {/* Navigation Sidebar */}
                    <div className="flex flex-col gap-2">
                        {[
                            { id: 'general', icon: Settings, label: t('settings.sidebar.general.title'), desc: t('settings.sidebar.general.desc') },
                            { id: 'algorithm', icon: Sliders, label: t('settings.sidebar.algorithm.title'), desc: t('settings.sidebar.algorithm.desc') },
                            { id: 'display', icon: Activity, label: t('settings.sidebar.display.title'), desc: t('settings.sidebar.display.desc') },
                            { id: 'security', icon: ShieldCheck, label: t('settings.sidebar.security.title'), desc: t('settings.sidebar.security.desc') },
                            { id: 'shortcuts', icon: Keyboard, label: t('settings.shortcuts.title'), desc: t('settings.shortcuts.desc') }
                        ].map((btn, i) => (
                            <div
                                key={btn.id}
                                style={{ animationDelay: `${i * 100} ms` }}
                                className="animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both"
                            >
                                <NavButton
                                    active={section === btn.id}
                                    onClick={() => setSection(btn.id as 'general' | 'algorithm' | 'security' | 'display' | 'shortcuts')}
                                    icon={btn.icon}
                                    label={btn.label}
                                    desc={btn.desc}
                                />
                            </div>
                        ))}
                        <div className="mt-8 p-4 rounded-xl bg-base-300/20 border border-base-content/5 space-y-3">
                            <div className="flex items-center gap-2 text-[9px] font-black uppercase text-base-content/20 tracking-[0.2em] mb-1 px-1">
                                <Database className="w-3 h-3 text-primary/40" /> {t('settings.health.title')}
                                <div className="h-px flex-1 bg-primary/5 ml-2" />
                            </div>
                            <div className="space-y-1">
                                <HealthRow
                                    label={t('settings.health.core_sync')}
                                    status={(fsrsProfile && isOnline) ? t('settings.health.status_operational') : t('settings.health.status_degraded')}
                                    color={(fsrsProfile && isOnline) ? "text-success" : "text-warning"}
                                />
                                <HealthRow
                                    label={t('settings.health.storage')}
                                    status={t('settings.health.status_storage_free', { percentage: storageInfo.percentage })}
                                    color="text-primary/60"
                                />
                                <HealthRow
                                    label={t('settings.health.cache')}
                                    status={storageInfo.size}
                                    color="text-primary/60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="glass-card-premium p-10 min-h-[720px] flex flex-col animate-in fade-in slide-in-from-right-4 duration-700 shadow-premium-xl border-none relative overflow-visible">
                        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none scale-150 grayscale rotate-12">
                            {section === 'general' && <Settings className="w-64 h-64" />}
                            {section === 'algorithm' && <Sliders className="w-64 h-64" />}
                            {section === 'display' && <Activity className="w-64 h-64" />}
                            {section === 'security' && <ShieldCheck className="w-64 h-64" />}
                            {section === 'shortcuts' && <Keyboard className="w-64 h-64" />}
                        </div>
                        {section === 'general' && (
                            <div className="space-y-10 flex-1 relative z-10">
                                <SectionHeader title={t('settings.general.title')} />

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    {/* Left Column: Profile & Language */}
                                    <div className="space-y-10">
                                        {/* Profile */}
                                        <SettingGroup
                                            label={t('settings.general.profile.title')}
                                            desc={t('settings.general.profile.desc')}
                                        >
                                            <div className="pt-4 space-y-3">
                                                <label htmlFor="setting-username" className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em] ml-2">{t('settings.general.profile.display_name')}</label>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-base-content/20 group-focus-within:text-primary transition-colors">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <input
                                                        id="setting-username"
                                                        name="username"
                                                        type="text"
                                                        value={localUsername}
                                                        onChange={(e) => setLocalUsername(e.target.value)}
                                                        placeholder={t('settings.general.profile.placeholder')}
                                                        autoComplete="nickname"
                                                        className="input input-lg w-full pl-12 bg-base-200/20 border-base-content/5 rounded-2xl focus:border-primary/30 focus:bg-primary/[0.02] transition-all font-bold text-sm tracking-tight placeholder:opacity-20"
                                                    />
                                                </div>
                                            </div>
                                        </SettingGroup>

                                        {/* Language */}
                                        <SettingGroup
                                            label={t('settings.general.language.title')}
                                            desc={t('settings.general.language.desc')}
                                        >
                                            <div className="pt-4 space-y-3">
                                                <label htmlFor="setting-language" className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em] ml-2">{t('settings.general.language.label')}</label>
                                                <GlassSelect
                                                    id="setting-language"
                                                    name="language"
                                                    value={preferences.language || i18n.language}
                                                    onChange={handleLanguageChange}
                                                    options={languageOptions}
                                                    icon={<Languages size={18} className="text-primary/40" />}
                                                    dropdownWidth="w-full"
                                                />
                                            </div>
                                        </SettingGroup>

                                        {/* Notifications */}
                                        <SettingGroup
                                            label={t('settings.general.notifications.title')}
                                            desc={t('settings.general.notifications.desc')}
                                        >
                                            <div className="grid grid-cols-1 gap-4 pt-4">
                                                <ToggleControl
                                                    id="notif-push"
                                                    name="notif-push"
                                                    label={t('settings.general.notifications.push')}
                                                    checked={preferences.notifications?.push ?? true}
                                                    onChange={handlePushToggle}
                                                />
                                                <ToggleControl
                                                    id="notif-drift"
                                                    name="notif-drift"
                                                    label={t('settings.general.notifications.drift')}
                                                    checked={preferences.notifications?.drift ?? true}
                                                    onChange={(c) => updatePref({
                                                        notifications: { ...preferences.notifications!, drift: c }
                                                    })}
                                                />
                                                <ToggleControl
                                                    id="notif-sync"
                                                    name="notif-sync"
                                                    label={t('settings.general.notifications.sync')}
                                                    checked={preferences.notifications?.sync ?? false}
                                                    onChange={(c) => updatePref({
                                                        notifications: { ...preferences.notifications!, sync: c }
                                                    })}
                                                />
                                            </div>
                                        </SettingGroup>
                                    </div>

                                    {/* Right Column: Schedule */}
                                    <div className="space-y-10">
                                        <SettingGroup
                                            label={t('settings.general.temporal.title')}
                                            desc={t('settings.general.temporal.desc')}
                                        >
                                            <div className="space-y-8 pt-4">
                                                {/* Rollover & Timezone */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className={`space-y-2.5 transition-all duration-700 ${!isExpertMode && preferences.countdownMode === 'custom' ? 'opacity-[0.15] grayscale pointer-events-none' : 'opacity-100'}`}>
                                                        <div className="flex items-center justify-between px-2">
                                                            <label htmlFor="setting-rollover" className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('settings.general.temporal.rollover')}</label>
                                                            {!isExpertMode && preferences.countdownMode === 'custom' && (
                                                                <span className="text-[8px] font-black text-primary/40 uppercase bg-primary/5 px-1.5 py-0.5 rounded">{t('common.status.locked', 'Locked')}</span>
                                                            )}
                                                        </div>
                                                        <GlassSelect
                                                            id="setting-rollover"
                                                            name="rollover_hour"
                                                            size="sm"
                                                            value={preferences.rolloverHour}
                                                            onChange={(val) => updatePref({ rolloverHour: val })}
                                                            options={rolloverOptions}
                                                            dropdownWidth="w-[180px]"
                                                        />
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        <label htmlFor="setting-timezone" className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em] px-2">{t('settings.general.temporal.timezone')}</label>
                                                        <GlassSelect
                                                            id="setting-timezone"
                                                            name="timezone"
                                                            size="sm"
                                                            value={preferences.timezone}
                                                            onChange={(val) => updatePref({ timezone: val })}
                                                            groups={timezoneGroups}
                                                            dropdownWidth="w-[320px]"
                                                            dropdownAlign="end"
                                                            searchable={true}
                                                            searchPlaceholder={t('common.search_placeholder')}
                                                            emptyText={t('common.no_results')}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Rollover Preview */}
                                                <div className="flex items-center justify-between px-5 py-4 bg-primary/[0.03] border border-primary/10 rounded-2xl shadow-premium-sm group hover:bg-primary/[0.05] transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform duration-500">
                                                            <Clock className="w-5 h-5" />
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">{t('settings.preview.rollover_label')}</p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-base font-black text-base-content tracking-tight">{nextRollover.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                <span className="text-[11px] font-bold text-base-content/20 uppercase tracking-widest">({t('common.time_left', { hours: nextRollover.hours, minutes: nextRollover.minutes }) || `${nextRollover.hours}h ${nextRollover.minutes} m`})</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full bg-primary/20 animate-pulse" />
                                                </div>

                                                {/* Countdown Mode */}
                                                <div className="space-y-4 pt-4 border-t border-base-content/5">
                                                    <label className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em] px-2">{t('settings.general.temporal.countdown')}</label>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {(['daily', 'custom'] as const).map((mode) => (
                                                            <button
                                                                key={mode}
                                                                type="button"
                                                                onClick={() => updatePref({ countdownMode: mode })}
                                                                className={`
                                                                    group p-5 rounded-[1.5rem] border-2 text-left transition-all duration-500
                                                                    ${preferences.countdownMode === mode
                                                                        ? 'bg-primary/[0.03] border-primary/20 shadow-premium-sm ring-4 ring-primary/5'
                                                                        : 'bg-base-200/20 border-base-content/5 hover:border-base-content/10'
                                                                    }
                                                                `}
                                                            >
                                                                <div className={`text-base font-black tracking-tight mb-0.5 transition-colors ${preferences.countdownMode === mode ? 'text-primary' : 'text-base-content/60'}`}>
                                                                    {t(`welcome.timer.${mode}`)}
                                                                </div>
                                                                <div className="text-[10px] font-bold text-base-content/20 uppercase tracking-widest leading-none">
                                                                    {mode === 'daily' ? t('settings.preview.countdown_daily_short') : t('settings.preview.countdown_custom_short')}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Custom Countdown Fields */}
                                                {preferences.countdownMode === 'custom' && (
                                                    <div className="space-y-5 p-6 bg-base-100/40 backdrop-blur-3xl rounded-[2rem] border-2 border-primary/10 animate-in zoom-in-95 fade-in duration-500 shadow-premium-lg">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label htmlFor="setting-cd-date" className="text-[10px] font-black text-base-content/30 uppercase tracking-widest ml-2">{t('settings.general.temporal.target_date')}</label>
                                                                <input
                                                                    id="setting-cd-date"
                                                                    name="custom_target_date"
                                                                    type="date"
                                                                    className="input input-bordered input-md w-full bg-base-100 border-base-content/5 rounded-xl font-mono text-sm focus:border-primary/30 transition-all font-black text-center"
                                                                    value={preferences.customTargetDate}
                                                                    onChange={(e) => updatePref({ customTargetDate: e.target.value })}
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label htmlFor="setting-cd-target" className="text-[10px] font-black text-base-content/30 uppercase tracking-widest ml-2">{t('settings.general.temporal.target_time')}</label>
                                                                <input
                                                                    id="setting-cd-target"
                                                                    name="custom_target_time"
                                                                    type="time"
                                                                    className="input input-bordered input-md w-full bg-base-100 border-base-content/5 rounded-xl font-mono text-sm focus:border-primary/30 transition-all font-black text-center"
                                                                    value={preferences.customTargetTime}
                                                                    onChange={(e) => updatePref({ customTargetTime: e.target.value })}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label htmlFor="setting-cd-name" className="text-[10px] font-black text-base-content/30 uppercase tracking-widest ml-2">{t('welcome.timer.event_label')}</label>
                                                            <input
                                                                id="setting-cd-name"
                                                                name="custom_event_name"
                                                                type="text"
                                                                placeholder={t('welcome.timer.event_placeholder')}
                                                                className="input input-bordered input-md w-full bg-base-100 border-base-content/5 rounded-xl font-black text-sm focus:border-primary/30 transition-all placeholder:font-bold placeholder:opacity-10 text-center"
                                                                value={preferences.customEventName}
                                                                onChange={(e) => updatePref({ customEventName: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </SettingGroup>
                                    </div>
                                </div>
                            </div>
                        )}

                        {section === 'algorithm' && (
                            <div className="space-y-12 flex-1 relative z-10">
                                <SectionHeader title={t('settings.algorithm.title')} />

                                {isFsrsLoading ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" />
                                        <p className="text-[10px] font-black uppercase text-base-content/20 tracking-[0.3em]">{t('common.loading')}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Core Tuning Grid */}
                                        <div className="space-y-12">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                                {/* Column 1: Core Tuning */}
                                                <div className="space-y-12">
                                                    {/* 1. Global Retention Strategy */}
                                                    <SettingGroup label={t('settings.algorithm.retention.title')} desc={t('settings.algorithm.retention.desc')}>
                                                        <div className="pt-8 pb-4 space-y-10">
                                                            <div className="flex items-center justify-between px-2">
                                                                <div>
                                                                    <h4 className="text-sm font-black uppercase text-base-content/60 tracking-tight">{t('settings.algorithm.retention.label')}</h4>
                                                                    <p className="text-[9px] font-bold text-base-content/20 uppercase tracking-[0.1em] mt-0.5">{t('settings.algorithm.global_config_label')}</p>
                                                                </div>
                                                                <div className="flex items-end gap-1.5 translate-y-1">
                                                                    <span className="text-4xl font-black tracking-tighter text-primary">
                                                                        {Math.round((fsrsProfile?.retention_target || 0.90) * 100)}
                                                                    </span>
                                                                    <span className="text-[10px] font-black text-primary/40 uppercase mb-2 tracking-widest">%</span>
                                                                </div>
                                                            </div>

                                                            {/* Silky Interactive Slider */}
                                                            <div className="relative group px-1">
                                                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-base-content/5 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`absolute inset-y-0 left-0 transition-all duration-1000 ease-out
                                                                            ${(fsrsProfile?.retention_target || 0.9) > 0.93 ? 'bg-gradient-to-r from-primary/30 via-primary/60 to-warning' : 'bg-gradient-to-r from-primary/20 to-primary'}
                                                                        `}
                                                                        style={{
                                                                            width: `${((fsrsProfile?.retention_target || 0.9) - 0.7) / (0.99 - 0.7) * 100}%`,
                                                                            filter: `blur(${(fsrsProfile?.retention_target || 0.9) > 0.95 ? '2px' : '0px'})`,
                                                                            boxShadow: (fsrsProfile?.retention_target || 0.9) > 0.95 ? '0 0 20px var(--color-warning)' : 'none'
                                                                        }}
                                                                    />
                                                                </div>

                                                                <input
                                                                    id="setting-retention-target"
                                                                    name="retention_target"
                                                                    type="range"
                                                                    min="0.7"
                                                                    max="0.99"
                                                                    step="0.01"
                                                                    value={fsrsProfile?.retention_target || 0.9}
                                                                    onChange={(e) => handleSave(async () => { await updateProfileAsync({ retention_target: parseFloat(e.target.value) }); })}
                                                                    aria-label={t('settings.algorithm.retention.label')}
                                                                    className="range-input-premium w-full h-10 bg-transparent appearance-none cursor-pointer relative z-10"
                                                                />

                                                                <div className="relative w-full h-8 mt-2 select-none">
                                                                    {[0.7, 0.8, 0.9, 0.95, 0.99].map((val) => {
                                                                        const percent = (val - 0.7) / (0.99 - 0.7) * 100;
                                                                        const isActive = Math.abs((fsrsProfile?.retention_target || 0.9) - val) < 0.01;
                                                                        return (
                                                                            <button
                                                                                key={val}
                                                                                type="button"
                                                                                onClick={() => handleSave(async () => { await updateProfileAsync({ retention_target: val }); })}
                                                                                className="absolute -translate-x-1/2 flex flex-col items-center gap-2 group/tick transition-all duration-500"
                                                                                style={{ left: `${percent}% ` }}
                                                                            >
                                                                                <div className={`
                                                                                    w-0.5 h-2 rounded-full transition-all duration-700
                                                                                    ${isActive ? 'bg-primary h-4 shadow-[0_0_8px_var(--color-primary)]' : 'bg-base-content/10 group-hover/tick:bg-primary/40 group-hover/tick:h-3'}
                                                                                `} />
                                                                                <span className={`
                                                                                    text-[9px] font-black tracking-tight transition-all duration-700
                                                                                    ${isActive ? 'text-primary scale-125 translate-y-0.5' : 'text-base-content/20 group-hover/tick:text-base-content/40'}
                                                                                `}>
                                                                                    {Math.round(val * 100)}%
                                                                                </span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </SettingGroup>

                                                    {/* 2. Load Management */}
                                                    <SettingGroup label={t('settings.algorithm.capacity.title')} desc={t('settings.algorithm.capacity.desc')}>
                                                        <div className="pt-6 space-y-8">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between px-2">
                                                                    <label htmlFor="setting-daily-review-cap" className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('settings.algorithm.capacity.daily_cap')}</label>
                                                                    <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">{fsrsProfile?.daily_review_cap ? t('common.units.cards_per_day') : t('settings.algorithm.daily_cap_unlimited')}</span>
                                                                </div>
                                                                <div className="group relative">
                                                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/5 to-primary/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-all duration-700" />
                                                                    <div className="join w-full bg-base-300/30 backdrop-blur-2xl rounded-2xl border border-base-content/5 focus-within:border-primary/20 transition-all relative overflow-hidden shadow-inner h-[60px]">
                                                                        <div className="join-item flex-1 relative px-5 h-full flex items-center">
                                                                            <input
                                                                                id="setting-daily-review-cap"
                                                                                name="daily_review_cap"
                                                                                type="number"
                                                                                placeholder={t('settings.algorithm.daily_cap_unlimited')}
                                                                                value={fsrsProfile?.daily_review_cap || ''}
                                                                                onChange={(e) => updateProfile({ daily_review_cap: e.target.value ? Number(e.target.value) : null })}
                                                                                className="w-full bg-transparent border-none p-0 focus:ring-0 font-black text-xl placeholder:text-base-content/5 tracking-tighter"
                                                                            />
                                                                            {fsrsProfile?.daily_review_cap && (
                                                                                <button
                                                                                    onClick={() => updateProfile({ daily_review_cap: null })}
                                                                                    className="absolute right-4 p-1.5 rounded-xl bg-base-content/5 text-base-content/20 hover:bg-error/10 hover:text-error transition-all"
                                                                                >
                                                                                    <X className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <div className="join-item h-full px-6 flex items-center bg-base-content/[0.03] border-l border-base-content/5 text-[10px] font-black uppercase text-base-content/30 tracking-[0.2em]">
                                                                            #
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </SettingGroup>
                                                </div>

                                                {/* Column 2: Advanced Subject Optimization Entry Point */}
                                                <div className="space-y-12">
                                                    <div className="group relative h-full">
                                                        <div className="absolute -inset-2 bg-gradient-to-br from-primary/10 via-info/5 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-1000" />
                                                        <div className="relative h-full p-10 rounded-[3rem] bg-base-300/10 backdrop-blur-2xl border border-base-content/5 group-hover:border-primary/20 flex flex-col transition-all duration-700 overflow-hidden">
                                                            <div className="absolute -top-12 -right-12 p-8 opacity-5 group-hover:opacity-10 group-hover:rotate-12 transition-all duration-1000">
                                                                <Database className="w-48 h-48" />
                                                            </div>

                                                            <div className="mb-auto">
                                                                <div className="p-4 bg-primary text-primary-content rounded-[1.5rem] w-fit shadow-premium-lg mb-8 group-hover:scale-110 transition-transform duration-700">
                                                                    <Sliders className="w-8 h-8" />
                                                                </div>
                                                                <h3 className="text-xl font-black uppercase tracking-tight text-base-content mb-4">{t('settings.algorithm.subject_config_title')}</h3>
                                                                <p className="text-[13px] font-bold text-base-content/30 uppercase tracking-[0.05em] leading-relaxed max-w-xs">
                                                                    {t('settings.algorithm.subject_config_desc')}
                                                                </p>
                                                            </div>

                                                            <div className="mt-12 space-y-4">
                                                                <div className="p-5 rounded-2xl bg-base-content/5 border border-base-content/5 flex items-center justify-between group-hover:bg-primary/[0.03] transition-colors">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">{t('settings.algorithm.isolation_status')}</span>
                                                                    </div>
                                                                    <ArrowUpRight className="w-4 h-4 text-base-content/10 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-primary transition-all" />
                                                                </div>

                                                                <button
                                                                    onClick={() => navigate('/settings/fsrs-profiles')}
                                                                    className="w-full py-5 px-8 rounded-2xl bg-primary text-primary-content font-black text-[11px] uppercase tracking-[0.3em] shadow-premium-lg hover:shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group/btn"
                                                                >
                                                                    {t('settings.algorithm.subject_config_btn')}
                                                                    <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Future Teaser (Hidden in simplified view but kept for future use if needed, currently commented out) */}
                                        {/* <div className="p-8 ..."> ... </div> */}
                                    </>
                                )}
                            </div>
                        )}

                        {section === 'display' && (
                            <div className="space-y-12 flex-1 relative z-10">
                                <SectionHeader title={t('settings.display.title')} />

                                <div className="grid gap-12">
                                    {/* 1. Appearance Mode */}
                                    <SettingGroup label={t('settings.display.appearance.title')} desc={t('settings.display.appearance.desc')}>
                                        <div className="grid grid-cols-3 gap-6 pt-5">
                                            {(['system', 'light', 'dark'] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    onClick={() => updatePref({ theme: { mode: m } })}
                                                    className={`
                                                    group p-6 rounded-[2rem] border-2 flex flex-col items-center gap-4 transition-all duration-500
                                                    ${theme.mode === m
                                                            ? 'bg-primary/10 border-primary text-primary shadow-premium-lg scale-105 ring-4 ring-primary/5'
                                                            : 'bg-base-200/20 border-base-content/5 text-base-content/30 hover:bg-base-200/40 hover:border-base-content/10'
                                                        }
`}
                                                >
                                                    <div className={`
p-4 rounded-2xl transition-all duration-700
                                                        ${theme.mode === m ? 'bg-primary text-primary-content shadow-lg shadow-primary/20 rotate-0' : 'bg-base-200 text-base-content/20 rotate-6 group-hover:rotate-0'}
`}>
                                                        {m === 'system' && <Activity className="w-6 h-6" />}
                                                        {m === 'light' && <Sun className="w-6 h-6" />}
                                                        {m === 'dark' && <Moon className="w-6 h-6" />}
                                                    </div>
                                                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                                        {t(`settings.display.appearance.${m}`)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </SettingGroup>

                                    {/* 2. Light Themes Palette */}
                                    <SettingGroup label={t('settings.display.light.title')} desc={t('settings.display.light.desc')}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
                                            {[
                                                { id: 'liquid-light', color: 'bg-[#f8fafc]', accent: 'bg-primary' },
                                                { id: 'warm-paper', color: 'bg-[#fff9e6]', accent: 'bg-amber-500' }
                                            ].map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => updatePref({ theme: { lightTheme: item.id } })}
                                                    className={`
                                                        relative p-6 rounded-[2rem] border-2 text-left flex items-center gap-6 transition-all duration-500 group
                                                        ${theme.lightTheme === item.id
                                                            ? 'bg-base-100 border-primary shadow-premium-lg ring-1 ring-primary/20'
                                                            : 'bg-base-100/30 border-base-content/5 hover:border-base-content/10'
                                                        }
                                                    `}
                                                >
                                                    {/* Theme Preview Swatch */}
                                                    <div className={`w-14 h-14 rounded-2xl ${item.color} shadow-inner flex-shrink-0 border border-black/5 relative overflow-hidden group-hover:scale-110 transition-transform duration-500`}>
                                                        <div className={`absolute bottom-0 right-0 w-6 h-6 ${item.accent} opacity-20 blur-lg`} />
                                                        <div className={`absolute top-2 left-2 w-3 h-3 rounded-full ${item.accent} opacity-40`} />
                                                    </div>

                                                    <div className="space-y-1 pr-8">
                                                        <p className={`text-base font-black tracking-tight ${theme.lightTheme === item.id ? 'text-base-content' : 'text-base-content/60'}`}>
                                                            {t(`settings.display.themes.${item.id.replace('-', '_')}`)}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest leading-none">
                                                            {t(`settings.display.themes.${item.id.replace('-', '_')}_desc`)}
                                                        </p>
                                                    </div>

                                                    {theme.lightTheme === item.id && (
                                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_15px_var(--color-primary)]" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </SettingGroup>

                                    {/* 3. Dark Themes Palette */}
                                    <SettingGroup label={t('settings.display.dark.title')} desc={t('settings.display.dark.desc')}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
                                            {[
                                                { id: 'liquid-dark', color: 'bg-[#030712]', accent: 'bg-primary' },
                                                { id: 'midnight-oled', color: 'bg-[#000000]', accent: 'bg-indigo-500' }
                                            ].map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => updatePref({ theme: { darkTheme: item.id } })}
                                                    className={`
                                                        relative p-6 rounded-[2rem] border-2 text-left flex items-center gap-6 transition-all duration-500 group
                                                        ${theme.darkTheme === item.id
                                                            ? 'bg-base-100 border-primary shadow-premium-lg ring-1 ring-primary/20'
                                                            : 'bg-base-100/30 border-base-content/5 hover:border-base-content/10'
                                                        }
                                                    `}
                                                >
                                                    {/* Theme Preview Swatch */}
                                                    <div className={`w-14 h-14 rounded-2xl ${item.color} shadow-inner flex-shrink-0 border border-white/5 relative overflow-hidden group-hover:scale-110 transition-transform duration-500`}>
                                                        <div className={`absolute bottom-0 right-0 w-6 h-6 ${item.accent} opacity-20 blur-lg`} />
                                                        <div className={`absolute top-2 left-2 w-3 h-3 rounded-full ${item.accent} opacity-40`} />
                                                    </div>

                                                    <div className="space-y-1 pr-8">
                                                        <p className={`text-base font-black tracking-tight ${theme.darkTheme === item.id ? 'text-base-content' : 'text-base-content/60'}`}>
                                                            {t(`settings.display.themes.${item.id.replace('-', '_')}`)}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest leading-none">
                                                            {t(`settings.display.themes.${item.id.replace('-', '_')}_desc`)}
                                                        </p>
                                                    </div>

                                                    {theme.darkTheme === item.id && (
                                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_15px_var(--color-primary)]" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </SettingGroup>

                                    {/* 4. UX Toggles */}
                                    <SettingGroup label={t('settings.display.ux.title')} desc={t('settings.display.ux.desc')}>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
                                            <ToggleControl
                                                id="ux-reflections"
                                                name="ux_reflections"
                                                label={t('settings.display.ux.reflections')}
                                                checked={preferences.ux?.reflections ?? true}
                                                onChange={(c) => updatePref({ ux: { reflections: c } })}
                                            />
                                            <ToggleControl
                                                id="ux-animations"
                                                name="ux_animations"
                                                label={t('settings.display.ux.animations')}
                                                checked={preferences.ux?.animations ?? true}
                                                onChange={(c) => updatePref({ ux: { animations: c } })}
                                            />
                                            <ToggleControl
                                                id="ux-motion"
                                                name="ux_reduced_motion"
                                                label={t('settings.display.ux.reduced_motion')}
                                                checked={preferences.ux?.reducedMotion ?? false}
                                                onChange={(c) => updatePref({ ux: { reducedMotion: c } })}
                                            />
                                        </div>
                                    </SettingGroup>
                                </div>
                            </div>
                        )}

                        {section === 'security' && (
                            <div className="space-y-12 flex-1 relative z-10">
                                <SectionHeader title={t('settings.security.title')} />

                                <div className="grid gap-10">
                                    {/* 1. API Management */}
                                    <SettingGroup label={t('settings.security.keys.title')} desc={t('settings.security.keys.desc', { defaultValue: 'Manage your personal access tokens for API integrations.' })}>
                                        <div className="pt-4">
                                            <div className="glass-card-premium p-8 border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-primary/10 rounded-2xl text-primary font-black">
                                                            <Key className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-base-content tracking-tight uppercase">{t('settings.security.keys.primary_label', { defaultValue: 'Production Access Token' })}</p>
                                                            <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">{t('settings.security.keys.status_active', { defaultValue: 'Status: Active • Full Access' })}</p>
                                                        </div>
                                                    </div>
                                                    <button className="btn btn-sm btn-primary rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                                                        {t('settings.security.keys.btn_generate')}
                                                    </button>
                                                </div>

                                                <div className="relative group">
                                                    <div className="p-5 bg-base-300/40 backdrop-blur-md rounded-2xl border border-base-content/5 font-mono text-xs text-base-content/20 flex justify-between items-center group-hover:border-primary/20 transition-all">
                                                        <span className="tracking-[0.3em]">sea_live_••••••••••••••••••••••••••••••••</span>
                                                        <button className="btn btn-ghost btn-xs text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all hover:text-primary">
                                                            {t('common.copy') || 'Copy'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </SettingGroup>

                                    {/* 2. Device Management */}
                                    <SettingGroup label={t('settings.security.sync.title')} desc={t('settings.security.sync.desc')}>
                                        <div className="space-y-4 pt-4">
                                            <div className="flex items-center justify-between p-6 bg-base-200/20 rounded-[2rem] border border-base-content/5 hover:border-primary/10 transition-all group">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center font-black text-primary border border-primary/10 shadow-inner group-hover:scale-110 transition-transform duration-500">
                                                        <Activity className="w-6 h-6 opacity-40" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-base font-black text-base-content tracking-tight uppercase">primary_host_01</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                                            <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
                                                                {t('settings.security.sync.last_sync', { time: 'Online Now' }) || 'Last Sync: Online Now'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button className="btn btn-ghost btn-sm text-error/30 hover:text-error font-black uppercase tracking-widest text-[10px] transition-colors">
                                                    {t('settings.security.sync.btn_revoke')}
                                                </button>
                                            </div>
                                        </div>
                                    </SettingGroup>
                                </div>
                            </div>
                        )}

                        {section === 'shortcuts' && (
                            <div className="space-y-12 flex-1 relative z-10 pb-20">
                                <div className="flex items-center justify-between">
                                    <SectionHeader title={t('settings.shortcuts.title')} />
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-2xl bg-base-content/5 border border-base-content/5 flex items-center gap-1">
                                            {[
                                                { id: 'global', icon: <Database size={12} />, label: t('settings.shortcuts.profile.global', 'Global Sync') },
                                                { id: 'device', icon: <Activity size={12} />, label: t('settings.shortcuts.profile.device', 'This Device') }
                                            ].map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => updatePref({ shortcutProfile: p.id as any })}
                                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${preferences.shortcutProfile === p.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'opacity-40 hover:opacity-100 hover:bg-base-content/5'}`}
                                                    title={p.id === 'device' ? `Device ID: ${preferences.deviceId}` : undefined}
                                                >
                                                    {p.icon} {p.label}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => updatePref({ shortcuts: { ...preferences.shortcuts, [preferences.shortcutProfile === 'device' && preferences.deviceId ? `device_${preferences.deviceId}` : 'global']: {} } })}
                                            className="se-interactive px-3 py-1.5 rounded-xl border border-base-content/10 flex items-center gap-2 hover:bg-base-content/5 transition-all text-[9px] font-black uppercase tracking-widest text-base-content/40 hover:text-base-content"
                                        >
                                            <RefreshCw size={12} />
                                            {t('common.actions.reset')}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    {/* Sub-navigation for Shortcut Categories */}
                                    <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-base-300/30 border border-base-content/5 w-fit">
                                        {(Object.values(DEFAULT_SHORTCUTS) as ShortcutGroup[]).map((group) => (
                                            <button
                                                key={group.id}
                                                onClick={() => setShortcutCategory(group.id)}
                                                className={`
                                                    px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300
                                                    ${shortcutCategory === group.id
                                                        ? 'bg-primary text-white shadow-premium-sm ring-1 ring-primary/20'
                                                        : 'text-base-content/40 hover:text-base-content/70 hover:bg-base-content/5'}
                                                `}
                                            >
                                                {t(group.title)}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                                        {Object.values(DEFAULT_SHORTCUTS)
                                            .filter(group => group.id === shortcutCategory)
                                            .map((group) => (
                                                <SettingGroup
                                                    key={group.id}
                                                    label={t(group.title)}
                                                    desc={t(`${group.title}_desc`, { defaultValue: group.id === 'global' ? t('settings.shortcuts.global.desc') : t('settings.shortcuts.desc') })}
                                                >
                                                    <div className="pt-6">
                                                        <ShortcutTable
                                                            groupId={group.id}
                                                            shortcuts={Object.entries(group.shortcuts).map(([actionId, config]: [string, ShortcutConfig]) => ({
                                                                id: actionId,
                                                                action: t(config.action),
                                                            }))}
                                                            t={t}
                                                        />
                                                    </div>
                                                </SettingGroup>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer Actions Removed for Auto-save */}
                    </div>
                </div>
            </div>
        </div>
    );
};

function NavButton({ active, onClick, icon: Icon, label, desc }: { active: boolean, onClick: () => void, icon: React.ComponentType<{ className?: string; size?: number }>, label: string, desc: string }) {
    return (
        <button
            onClick={onClick}
            className={`
                p-4 rounded-xl flex items-center gap-4 transition-all duration-300 text-left relative group w-full
                ${active
                    ? 'bg-primary/5 border border-primary/20 shadow-premium-sm ring-1 ring-primary/10'
                    : 'hover:bg-base-200/40 border border-transparent hover:border-base-content/5'
                }
            `}
        >
            <div className={`
                p-2.5 rounded-lg transition-all duration-500 flex-shrink-0
                ${active
                    ? 'bg-primary text-primary-content shadow-lg shadow-primary/20 rotate-0 scale-110'
                    : 'bg-base-300/40 text-base-content/30 group-hover:bg-base-300 group-hover:text-base-content/50 -rotate-3 group-hover:rotate-0'}
            `}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
                <p className={`text-[13px] font-black uppercase tracking-tight truncate transition-colors ${active ? 'text-base-content' : 'text-base-content/40 group-hover:text-base-content/60'}`}>
                    {label}
                </p>
                <p className={`text-[9px] font-bold uppercase tracking-widest truncate transition-colors ${active ? 'text-base-content/30' : 'text-base-content/10 group-hover:text-base-content/20'}`}>
                    {desc}
                </p>
            </div>

            {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-full -ml-[2px] shadow-[0_0_12px_var(--color-primary)]" />
            )}

            <div className={`
                ml-auto transition-all duration-500
                ${active ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 group-hover:opacity-30 group-hover:translate-x-0'}
            `}>
                <ChevronRight className={`w-4 h-4 ${active ? 'text-primary' : 'text-base-content/20'}`} />
            </div>
        </button>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div className="relative mb-8">
            <h4 className="text-3xl font-black text-base-content tracking-tighter uppercase relative z-10">{title}</h4>
            <div className="absolute -bottom-2 left-0 w-12 h-1 bg-primary rounded-full" />
        </div>
    );
}

function SettingGroup({ label, desc, children }: { label: string, desc: string, children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="px-1">
                <h5 className="text-[11px] font-black text-base-content/60 uppercase tracking-[0.2em] mb-1">{label}</h5>
                <p className="text-[10px] font-bold text-base-content/20 uppercase tracking-widest leading-relaxed max-w-lg">{desc}</p>
            </div>
            <div className="relative">
                {children}
            </div>
        </div>
    );
}

function ToggleControl({
    id,
    name,
    label,
    checked,
    onChange,
    desc,
}: {
    id: string;
    name?: string;
    label: string;
    desc?: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <label
            htmlFor={id}
            className={`
                flex items-center justify-between p-5 rounded-[1.5rem] border-2 transition-all duration-500 cursor-pointer group
                ${checked
                    ? 'bg-primary/[0.03] border-primary/20 shadow-premium-sm'
                    : 'bg-base-200/20 border-base-content/5 hover:border-base-content/10'
                }
            `}
        >
            <div className="space-y-1 pr-4">
                <div className={`text-[11px] font-black uppercase tracking-widest transition-colors ${checked ? 'text-primary' : 'text-base-content/40 group-hover:text-base-content/60'}`}>{label}</div>
                {desc && <div className="text-[10px] font-bold text-base-content/20 uppercase tracking-widest leading-tight">{desc}</div>}
            </div>

            <div className="relative flex items-center">
                <input
                    id={id}
                    name={name || id}
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm ring-offset-base-100 focus:ring-primary/20"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    autoComplete="off"
                />
            </div>
        </label>
    );
}

function HealthRow({ label, status, color }: { label: string, status: string, color: string }) {
    return (
        <div className="flex justify-between items-center px-1.5 py-1 rounded-lg transition-colors hover:bg-base-content/[0.02]">
            <span className="text-[9px] font-bold text-base-content/40 uppercase tracking-widest">{label}</span>
            <span className={`text-[9px] font-black ${color} tracking-tight tabular-nums`}>{status}</span>
        </div>
    );
}

interface ShortcutItem {
    id: string; // Action ID
    action: string;
    context?: string;
}

function ShortcutRecorder({
    groupId,
    actionId,
    onSave,
    onCancel,
    t
}: {
    groupId: string,
    actionId: string,
    onSave: (newKey: string) => void,
    onCancel: () => void,
    t: (key: string, options?: any) => string
}) {
    const [recorded, setRecorded] = React.useState('');
    const { getShortcut } = useShortcut();

    // Conflict detection
    const conflictAction = React.useMemo(() => {
        if (!recorded) return null;
        for (const gId in DEFAULT_SHORTCUTS) {
            for (const aId in DEFAULT_SHORTCUTS[gId].shortcuts) {
                if (gId === groupId && aId === actionId) continue;
                if (getShortcut(gId, aId) === recorded) {
                    return t(DEFAULT_SHORTCUTS[gId].shortcuts[aId].action);
                }
            }
        }
        return null;
    }, [recorded, groupId, actionId, getShortcut, t]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const comboParts = [];
            if (e.ctrlKey || e.metaKey) comboParts.push('Control');
            if (e.shiftKey) comboParts.push('Shift');
            if (e.altKey) comboParts.push('Alt');

            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key === 'ArrowLeft') key = 'ArrowLeft';
            if (key === 'ArrowRight') key = 'ArrowRight';
            if (key === 'ArrowUp') key = 'ArrowUp';
            if (key === 'ArrowDown') key = 'ArrowDown';

            comboParts.push(key.charAt(0).toUpperCase() + key.slice(1));
            setRecorded(comboParts.join('+'));
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-base-300/40 backdrop-blur-md animate-in fade-in duration-500"
                onClick={onCancel}
            />

            <div className="bg-base-100 border-2 border-primary/20 p-10 rounded-[2.5rem] shadow-premium-2xl max-w-sm w-full text-center space-y-6 relative overflow-hidden group animate-in zoom-in-95 fade-in duration-300">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse shadow-[0_0_15px_var(--color-primary)]" />

                <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">{t('settings.shortcuts.recording')}</div>
                    <h4 className="text-xl font-black tracking-tight">{t('settings.shortcuts.press_keys')}</h4>
                    <p className="text-[10px] font-medium text-base-content/30 opacity-60">{t('settings.shortcuts.recording_hint')}</p>
                </div>

                <div className="py-8 px-4 rounded-3xl bg-base-content/[0.03] border border-base-content/5 font-mono relative overflow-hidden">
                    {recorded ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center justify-center gap-2">
                                {recorded.split('+').map((part, i) => (
                                    <React.Fragment key={part}>
                                        {i > 0 && <span className="opacity-20">+</span>}
                                        <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-black border border-primary/20 shadow-sm animate-in zoom-in-50 duration-200">
                                            {part}
                                        </span>
                                    </React.Fragment>
                                ))}
                            </div>
                            {conflictAction && (
                                <div className="text-[9px] font-black text-error uppercase tracking-widest animate-in slide-in-from-top-1 duration-300">
                                    ⚠️ {t('settings.shortcuts.conflict')} {conflictAction}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-20 animate-pulse">
                            {t('settings.shortcuts.wait_input')}
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 rounded-2xl bg-base-content/5 border border-base-content/5 text-[10px] font-black uppercase tracking-widest hover:bg-error/10 hover:text-error transition-all"
                    >
                        {t('common.actions.cancel')}
                    </button>
                    <button
                        onClick={() => recorded && onSave(recorded)}
                        disabled={!recorded}
                        className="flex-1 py-3 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-20 transition-all shadow-lg shadow-primary/20"
                    >
                        {t('common.actions.save')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ShortcutTable({ groupId, shortcuts, t }: { groupId: string, shortcuts: ShortcutItem[], t: (key: string) => string }) {
    const { getShortcut } = useShortcut();
    const { actions: { updatePreferences }, preferences: { shortcuts: userShortcuts, shortcutProfile, deviceId } } = useUserSettings();
    const [editing, setEditing] = React.useState<{ id: string } | null>(null);

    const activeProfileId = shortcutProfile === 'device' && deviceId ? `device_${deviceId}` : 'global';
    const profileShortcuts = userShortcuts[activeProfileId] || {};

    const handleSave = (actionId: string, newKey: string) => {
        const nextProfile: ShortcutProfile = {
            ...profileShortcuts,
            [groupId]: {
                ...(profileShortcuts[groupId] || {}),
                [actionId]: newKey
            }
        };
        updatePreferences({
            shortcuts: {
                ...userShortcuts,
                [activeProfileId]: nextProfile
            }
        });
        setEditing(null);
    };

    const handleReset = (actionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const nextGroup = { ...(profileShortcuts[groupId] || {}) };
        delete nextGroup[actionId];

        const nextProfile: ShortcutProfile = { ...profileShortcuts, [groupId]: nextGroup };
        updatePreferences({
            shortcuts: {
                ...userShortcuts,
                [activeProfileId]: nextProfile
            }
        });
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-base-content/5 bg-base-content/[0.02]">
            {editing && (
                <ShortcutRecorder
                    groupId={groupId}
                    actionId={editing.id}
                    onSave={(key) => handleSave(editing.id, key)}
                    onCancel={() => setEditing(null)}
                    t={t}
                />
            )}
            <table className="w-full">
                <thead>
                    <tr className="border-b border-base-content/5 bg-base-content/[0.03]">
                        <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.2em] text-base-content/30">
                            {t('settings.shortcuts.table.key')}
                        </th>
                        <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.2em] text-base-content/30">
                            {t('settings.shortcuts.table.action')}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-base-content/5">
                    {shortcuts.map((item) => {
                        const effectiveKey = getShortcut(groupId, item.id);
                        const isOverridden = profileShortcuts[groupId]?.[item.id] !== undefined;

                        return (
                            <tr
                                key={item.id}
                                className="group transition-colors hover:bg-primary/[0.02] cursor-pointer"
                                onClick={() => setEditing({ id: item.id })}
                            >
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        <kbd className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black tracking-wider shadow-sm transition-all group-hover:scale-105 ${isOverridden
                                            ? 'bg-primary/10 border-primary/30 text-primary'
                                            : 'bg-base-content/5 border-base-content/10 text-base-content/40 group-hover:bg-primary/5 group-hover:border-primary/20 group-hover:text-primary'
                                            }`}>
                                            {effectiveKey.split('+').map((part: string, j: number) => (
                                                <React.Fragment key={j}>
                                                    {j > 0 && <span className="text-base-content/20">+</span>}
                                                    <span className={isOverridden ? 'text-primary' : ''}>
                                                        {part}
                                                    </span>
                                                </React.Fragment>
                                            ))}
                                        </kbd>
                                        <div className="flex items-center gap-2 pr-2">
                                            {isOverridden && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary" title="Customized" />
                                            )}
                                            {isOverridden && (
                                                <button
                                                    onClick={(e) => handleReset(item.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-error/10 hover:text-error transition-all text-base-content/20"
                                                    title={t('common.actions.reset')}
                                                >
                                                    <RefreshCw size={10} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-3 text-[11px] font-bold text-base-content/70 group-hover:text-base-content transition-colors">
                                    {item.action}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
