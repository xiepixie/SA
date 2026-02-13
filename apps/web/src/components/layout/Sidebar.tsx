import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../app/state/useAppStore';
import { useUserSettings } from '../../app/state/useUserSettings';
import {
    Home,
    Zap,
    Database,
    Upload,
    BarChart3,
    ClipboardList,
    Globe,
    Settings2,
    Moon,
    Sun,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    Play,
    LogOut,
    ShieldCheck,
    AlertTriangle,
    BookOpen
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSync';
import { Tooltip } from '../ui/Tooltip';

const VIEW_MAP: Record<string, string> = {
    'dashboard': 'v:dashboard',
    'questions': 'v:question_list',
    'review': 'v:due_list',
    'exams': 'v:exam_list'
};

const prefetchCache = new Map<string, number>();

/**
 * Prefetch view data on hover/focus/tap intents.
 *
 * IMPORTANT: This now checks if data already exists to avoid redundant fetches.
 * The page's useActiveView will handle initial data loading - prefetch is only
 * for warming the cache BEFORE navigation when data doesn't exist yet.
 */
function prefetchView(itemId: string, intent: 'hover' | 'focus' | 'tap') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((navigator as any).connection?.saveData && intent !== 'tap') return;

    const viewKey = VIEW_MAP[itemId];
    if (!viewKey) return;

    // Check if we already have cached data for this view - if so, skip prefetch
    const state = useAppStore.getState();
    const hasCachedData = (() => {
        if (viewKey === 'v:dashboard') return !!state.entities.dashboard.me;
        if (viewKey === 'v:question_list') return Object.keys(state.entities.questions).length > 0;
        if (viewKey === 'v:due_list') return Object.keys(state.entities.cardsPulse).length > 0;
        if (viewKey === 'v:exam_list') return Object.keys(state.entities.exams).length > 0;
        return false;
    })();

    // If data exists, no need to prefetch - useActiveView won't refetch either
    if (hasCachedData) return;

    const cacheKey = `${itemId}:${intent}`;
    const now = Date.now();
    if (prefetchCache.has(cacheKey) && now - prefetchCache.get(cacheKey)! < 10000) {
        return;
    }
    prefetchCache.set(cacheKey, now);

    const performPrefetch = () => {
        // Re-check in case data was loaded while waiting
        const currentState = useAppStore.getState();
        const stillNeedsData = (() => {
            if (viewKey === 'v:dashboard') return !currentState.entities.dashboard.me;
            if (viewKey === 'v:question_list') return Object.keys(currentState.entities.questions).length === 0;
            if (viewKey === 'v:due_list') return Object.keys(currentState.entities.cardsPulse).length === 0;
            if (viewKey === 'v:exam_list') return Object.keys(currentState.entities.exams).length === 0;
            return true;
        })();

        if (!stillNeedsData) return;

        if (intent === 'hover') {
            currentState.markStale(viewKey, 'intent', 40, { prefetch: true, intent: 'hover' });
        } else if (intent === 'focus') {
            currentState.markStale(viewKey, 'intent', 55, { prefetch: true, intent: 'focus' });
        } else if (intent === 'tap') {
            // Tap prefetch: lower priority since useActiveView will handle mount with strong=true
            currentState.markStale(viewKey, 'intent', 70, { prefetch: true, intent: 'tap', strong: false });
        }
    };

    // Use requestIdleCallback for hover AND focus to avoid blocking interaction
    if ((intent === 'hover' || intent === 'focus') && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => performPrefetch(), { timeout: 200 });
    } else {
        performPrefetch();
    }
}

/* -------------------------------------------------------------------------------------------------
 * 1. Context & State Logic
 * -----------------------------------------------------------------------------------------------*/

interface SidebarContextType {
    isCollapsed: boolean;
    toggleCollapse: () => void;
    isMobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
    isMobile: boolean;
    isRestoring: boolean;
    theme: string;
    mode: 'light' | 'dark' | 'system';
    setMode: (mode: 'light' | 'dark' | 'system') => void;
    toggleTheme: (e?: React.MouseEvent) => void;
    prefersReducedMotion: boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) throw new Error('useSidebar must be used within a SidebarProvider');
    return context;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const preferences = useUserSettings(s => s.preferences);
    const actions = useUserSettings(s => s.actions);
    const { mode = 'system', lightTheme = 'liquid-light', darkTheme = 'liquid-dark' } = preferences?.theme ?? {};

    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sidebar:collapsed') === 'true';
        }
        return false;
    });

    const [isMobileOpen, setMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 768;
        }
        return false;
    });
    const [isRestoring, setIsRestoring] = useState(false);
    const [systemIsDark, setSystemIsDark] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    // Listen for reduced motion preference
    useEffect(() => {
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, []);

    // Realtime sync & subscription
    useEffect(() => {
        const unsubscribe = actions.subscribeToChanges();
        actions.syncWithSupabase();
        return unsubscribe;
    }, [actions]);

    // Bfcache restoration guard
    useEffect(() => {
        const handlePageShow = (e: PageTransitionEvent) => {
            if (e.persisted) {
                setIsRestoring(true);
                setTimeout(() => setIsRestoring(false), 350);
            }
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    // Listen for system theme changes
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, []);

    const lastThemeEventRef = useRef<{ x: number, y: number } | null>(null);

    // Resolved state for Smooth Transitions (lag behind store)
    const [resolvedMode, setResolvedMode] = useState(mode);
    const [resolvedTheme, setResolvedTheme] = useState(() => {
        if (mode === 'system') {
            return systemIsDark ? darkTheme : lightTheme;
        }
        return mode === 'dark' ? darkTheme : lightTheme;
    });

    // Calculate store's desired theme
    const storeTheme = useMemo(() => {
        if (mode === 'system') {
            return systemIsDark ? darkTheme : lightTheme;
        }
        return mode === 'dark' ? darkTheme : lightTheme;
    }, [mode, lightTheme, darkTheme, systemIsDark]);

    // Apply theme to document    // Unified theme application logic
    const themeAppliedRef = useRef(resolvedTheme);
    useEffect(() => {
        const root = document.documentElement;

        // Ensure attribute is set on mount/remount
        if (root.getAttribute('data-theme') !== storeTheme && storeTheme === resolvedTheme) {
            root.setAttribute('data-theme', storeTheme);
        }

        // If theme matches resolved state, we are synced
        if (storeTheme === resolvedTheme && mode === resolvedMode) {
            themeAppliedRef.current = storeTheme;
            return;
        }

        const applyTheme = () => {
            root.setAttribute('data-theme', storeTheme);
            flushSync(() => {
                setResolvedTheme(storeTheme);
                setResolvedMode(mode);
            });
            themeAppliedRef.current = storeTheme;
        };

        // Fallback or Reduced Motion: No animation
        if (prefersReducedMotion || !document.startViewTransition) {
            applyTheme();
            return;
        }

        // Apply with Ripple Transition
        try {
            root.classList.add('is-theme-switching');

            const transition = document.startViewTransition(() => {
                applyTheme();
            });

            transition.ready.then(() => {
                const coords = lastThemeEventRef.current;
                const x = coords?.x ?? window.innerWidth / 2;
                const y = coords?.y ?? window.innerHeight / 2;

                const endRadius = Math.hypot(
                    Math.max(x, window.innerWidth - x),
                    Math.max(y, window.innerHeight - y)
                );

                const animation = root.animate(
                    {
                        clipPath: [
                            `circle(0px at ${x}px ${y}px)`,
                            `circle(${endRadius}px at ${x}px ${y}px)`,
                        ],
                    },
                    {
                        duration: 500,
                        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        pseudoElement: '::view-transition-new(root)',
                    }
                );

                animation.onfinish = () => {
                    // Small delay to ensure browser has painted the final state
                    // before re-enabling standard CSS transitions
                    setTimeout(() => {
                        root.classList.remove('is-theme-switching');
                    }, 50);
                    lastThemeEventRef.current = null;
                };
            }).catch(() => {
                root.classList.remove('is-theme-switching');
            });

            // If the transition itself fails or is skipped by the browser
            transition.finished.catch(() => {
                root.classList.remove('is-theme-switching');
            });
        } catch (e) {
            // Absolute fallback
            applyTheme();
            root.classList.remove('is-theme-switching');
        }
    }, [storeTheme, mode, resolvedTheme, resolvedMode, prefersReducedMotion]);

    // Persist collapse state
    useEffect(() => {
        localStorage.setItem('sidebar:collapsed', String(isCollapsed));
    }, [isCollapsed]);

    // Mobile detection
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Keyboard shortcut Cmd+B
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (isMobile) {
                    setMobileOpen(prev => !prev);
                } else {
                    setIsCollapsed(prev => !prev);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMobile]);

    const toggleCollapse = useCallback(() => {
        const root = document.documentElement;
        if (!prefersReducedMotion) {
            root.classList.add('is-sidebar-moving');
        }
        setIsCollapsed(prev => !prev);
        setTimeout(() => {
            root.classList.remove('is-sidebar-moving');
        }, 350);
    }, [prefersReducedMotion]);

    const setMode = useCallback((newMode: 'light' | 'dark' | 'system') => {
        actions.updatePreferences({
            theme: { mode: newMode }
        });
    }, [actions]);

    const toggleTheme = useCallback((e?: React.MouseEvent) => {
        if (e) {
            lastThemeEventRef.current = { x: e.clientX, y: e.clientY };
        }
        const currentIsDark = mode === 'system' ? systemIsDark : mode === 'dark';
        setMode(currentIsDark ? 'light' : 'dark');
    }, [mode, systemIsDark, setMode]);

    return (
        <SidebarContext.Provider value={{
            isCollapsed, toggleCollapse,
            isMobileOpen, setMobileOpen,
            isMobile, isRestoring,
            theme: resolvedTheme,
            mode: resolvedMode,
            setMode, toggleTheme,
            prefersReducedMotion
        }}>
            {children}
        </SidebarContext.Provider>
    );
}

/* -------------------------------------------------------------------------------------------------
 * 2. Sidebar Components
 * -----------------------------------------------------------------------------------------------*/

interface NavItem {
    id: string;
    icon: React.ElementType;
    label: string;
    path: string;
    badge?: number;
    isPrimary?: boolean;
}

const NAV_ITEMS: { sectionKey: string; items: NavItem[] }[] = [
    {
        sectionKey: 'main',
        items: [
            { id: 'welcome', icon: Home, label: 'Welcome', path: '/' },
            { id: 'dashboard', icon: BarChart3, label: 'Dashboard', path: '/dashboard' },
            { id: 'review', icon: Zap, label: 'Review', path: '/review', isPrimary: true },
            { id: 'notebook', icon: BookOpen, label: 'Notebook', path: '/notebook' },
            { id: 'exams', icon: ClipboardList, label: 'Exams', path: '/exams' },
            { id: 'questions', icon: Database, label: 'Question Bank', path: '/questions' },
        ]
    },
    {
        sectionKey: 'systems',
        items: [
            { id: 'import', icon: Upload, label: 'Import', path: '/import' },
            { id: 'sync', icon: Globe, label: 'Sync', path: '/sync' },
            { id: 'manage', icon: Settings2, label: 'Manage', path: '/manage' },
        ]
    }
];

export function AppSidebar() {
    const { t } = useTranslation(['layout', 'ui', 'dashboard', 'settings', 'common']);
    const {
        isCollapsed, toggleCollapse, isMobileOpen, setMobileOpen,
        isMobile, isRestoring, theme, mode, toggleTheme, prefersReducedMotion
    } = useSidebar();
    const { userId, isAuthenticated } = useSupabaseAuth();
    const displayName = useUserSettings(s => s.profile.username);
    const navigate = useNavigate();
    const location = useLocation();

    // Refs for accessibility
    const asideRef = useRef<HTMLElement | null>(null);
    const lastFocusRef = useRef<HTMLElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const menuButtonRef = useRef<HTMLButtonElement | null>(null);

    // Logout confirmation state
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const logoutCancelRef = useRef<HTMLButtonElement | null>(null);

    const handleLogoutRequest = useCallback(() => {
        setShowLogoutConfirm(true);
    }, []);

    const handleLogoutConfirm = useCallback(async () => {
        setIsLoggingOut(true);
        try {
            await supabase.auth.signOut();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setIsLoggingOut(false);
            setShowLogoutConfirm(false);
        }
    }, [navigate]);

    const handleLogoutCancel = useCallback(() => {
        setShowLogoutConfirm(false);
    }, []);

    // Focus management for logout modal
    useEffect(() => {
        if (showLogoutConfirm && logoutCancelRef.current) {
            logoutCancelRef.current.focus();
        }
    }, [showLogoutConfirm]);

    // Mock due count (replace with real data)
    const dueCount = 12;

    const isDark = useMemo(() => {
        if (mode === 'dark') return true;
        if (mode === 'light') return false;
        return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }, [mode, theme]);

    // P0: Focus trap + scroll lock + return focus for mobile drawer
    useEffect(() => {
        if (!isMobileOpen || !isMobile) return;

        // Store last focused element
        lastFocusRef.current = document.activeElement as HTMLElement;

        // Lock body scroll
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus the close button or first focusable element
        requestAnimationFrame(() => {
            if (closeButtonRef.current) {
                closeButtonRef.current.focus();
            } else if (asideRef.current) {
                const focusables = asideRef.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                focusables[0]?.focus();
            }
        });

        // Keyboard handler for Tab trap and Esc
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setMobileOpen(false);
                return;
            }

            if (e.key !== 'Tab' || !asideRef.current) return;

            const focusables = Array.from(
                asideRef.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );
            if (!focusables.length) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement;

            if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            } else if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            }
        };

        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', onKeyDown, true);
            // Return focus to trigger button
            lastFocusRef.current?.focus?.();
        };
    }, [isMobileOpen, isMobile, setMobileOpen]);

    // Start Review CTA handler
    const handleStartReview = useCallback(() => {
        if (isMobile) setMobileOpen(false);
        navigate('/review');
    }, [navigate, isMobile, setMobileOpen]);

    const sidebarContent = (
        <aside
            ref={asideRef}
            id="sidebar-main"
            className={`
                sidebar glass-surface flex flex-col h-full
                ${isCollapsed && !isMobile ? 'collapsed' : ''}
                ${isMobile ? (isMobileOpen ? 'open' : '') : ''}
                ${isRestoring || prefersReducedMotion ? 'no-transitions' : ''}
            `}
            // Modal semantics for mobile drawer
            {...(isMobile && isMobileOpen ? {
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': t('layout:nav.sidebar')
            } : {})}
        >
            {/* Mobile Close Button */}
            {isMobile && isMobileOpen && (
                <button
                    ref={closeButtonRef}
                    onClick={() => setMobileOpen(false)}
                    className="absolute top-4 right-4 btn btn-ghost btn-sm btn-circle z-10"
                    aria-label={t('ui:actions.close')}
                >
                    <X className="w-5 h-5" />
                </button>
            )}

            {/* Header: User Profile & Settings */}
            <div className={`sidebar-header ${isCollapsed && !isMobile ? 'flex justify-center' : ''}`}>
                {isAuthenticated ? (
                    <Tooltip
                        position="right"
                        content={t('layout:nav.items.settings')}
                        disabled={!isCollapsed && !isMobile}
                        ariaLabel={isCollapsed && !isMobile}
                    >
                        <button
                            onClick={() => {
                                if (isMobile) setMobileOpen(false);
                                navigate('/settings');
                            }}
                            className={`
                                flex items-center transition-all duration-300 group/avatar group se-interactive
                                ${isCollapsed && !isMobile
                                    ? 'w-11 h-11 justify-center rounded-xl hover:bg-base-content/5'
                                    : 'gap-3 w-full p-2 rounded-2xl hover:bg-base-content/5'}
                            `}
                            aria-label={isCollapsed && !isMobile ? t('layout:nav.items.settings') : undefined}
                        >
                            <div className={`avatar placeholder online ${isCollapsed && !isMobile ? '' : 'transition-transform group-hover/avatar:scale-105'}`}>
                                <div className={`
                                    rounded-full bg-primary text-primary-content font-bold shadow-sm grid place-items-center transition-all duration-300
                                    ${isCollapsed && !isMobile ? 'w-7 h-7' : 'w-9 h-9'}
                                `}>
                                    <span className="text-xs leading-none">
                                        {userId?.substring(0, 1).toUpperCase() || 'U'}
                                    </span>
                                </div>
                            </div>
                            <div className="user-info min-w-0 flex-1 text-left">
                                <h2 className="text-sm font-bold truncate text-base-content group-hover/avatar:text-primary transition-colors">
                                    {displayName || t('welcome.default_username')}
                                </h2>
                                <p className="text-[10px] font-medium text-base-content/50 truncate">
                                    {userId?.substring(0, 8)}...
                                </p>
                            </div>
                        </button>
                    </Tooltip>
                ) : (
                    <button
                        onClick={() => navigate('/login')}
                        className={`
                            flex items-center gap-3 w-full p-2 rounded-2xl hover:bg-base-content/5 group se-interactive
                            ${isCollapsed && !isMobile ? 'justify-center' : ''}
                        `}
                    >
                        <div className="w-9 h-9 rounded-full bg-base-content/5 grid place-items-center">
                            <ShieldCheck className="w-5 h-5 opacity-40" />
                        </div>
                        {(!isCollapsed || isMobile) && (
                            <div className="text-left">
                                <h2 className="text-sm font-bold text-base-content">Sign In</h2>
                                <p className="text-[10px] text-base-content/50">Protect your data</p>
                            </div>
                        )}
                    </button>
                )}
            </div>

            {/* Primary CTA: Start Review (only when expanded or mobile) */}
            {(!isCollapsed || isMobile) && dueCount > 0 && (
                <div className="px-3 pt-3">
                    <button
                        onClick={handleStartReview}
                        className="w-full btn btn-primary gap-2 shadow-lg hover:shadow-xl transition-shadow"
                    >
                        <Play className="w-4 h-4" />
                        <span>{t('layout:nav.startReview')}</span>
                        <span className="badge badge-sm bg-primary-content/20 text-primary-content border-0">
                            {dueCount > 99 ? '99+' : dueCount}
                        </span>
                    </button>
                </div>
            )}

            {/* Navigation */}
            <div className={`sidebar-content py-4 space-y-6 thin-scrollbar ${isCollapsed && !isMobile ? 'flex flex-col items-center' : 'px-3'}`}>
                {NAV_ITEMS.map(group => (
                    <div key={group.sectionKey}>
                        <div className="nav-title px-3 mb-2 text-[10px] font-black uppercase text-base-content/30 tracking-[0.2em]">
                            {t(`layout:nav.sections.${group.sectionKey}`)}
                        </div>
                        <nav className="flex flex-col gap-1.5" aria-label={t(`layout:nav.sections.${group.sectionKey}`)}>
                            {group.items.map(item => {
                                const showTooltip = isCollapsed && !isMobile;
                                const tooltipLabel = t(`layout:nav.items.${item.id}`);
                                return (
                                    <Tooltip
                                        key={item.id}
                                        content={tooltipLabel}
                                        position="right"
                                        disabled={!showTooltip}
                                    >
                                        <NavLink
                                            to={item.path}
                                            onClick={() => {
                                                if (isMobile) setMobileOpen(false);
                                            }}
                                            className={({ isActive }) => [
                                                'nav-item se-interactive relative flex items-center rounded-xl outline-none',
                                                isActive ? 'active' : '',
                                                isCollapsed && !isMobile
                                                    ? 'w-11 h-11 justify-center mx-auto'
                                                    : 'w-full px-3 py-2.5 gap-3'
                                            ].filter(Boolean).join(' ')}
                                            aria-label={showTooltip ? tooltipLabel : undefined}
                                            aria-current={location.pathname === item.path ? 'page' : undefined}
                                            onMouseEnter={() => prefetchView(item.id, 'hover')}
                                            onFocus={() => prefetchView(item.id, 'focus')}
                                            onPointerDown={() => prefetchView(item.id, 'tap')}
                                        >
                                            <item.icon
                                                className="nav-icon flex-shrink-0 transition-transform duration-200 w-5 h-5"
                                                aria-hidden="true"
                                            />

                                            <span className="nav-label flex-1 truncate text-sm font-semibold">
                                                {tooltipLabel}
                                            </span>

                                            {/* Badge for Review with due count */}
                                            {item.id === 'review' && dueCount > 0 && (
                                                <span className={`
                                                    nav-badge px-1.5 py-0.5 rounded-md text-[9px] font-black transition-colors
                                                    ${location.pathname === item.path
                                                        ? 'bg-primary/20 text-primary'
                                                        : 'bg-warning/20 text-warning'}
                                                `}>
                                                    {dueCount > 99 ? '99+' : dueCount}
                                                </span>
                                            )}
                                        </NavLink>
                                    </Tooltip>
                                );
                            })}
                        </nav>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className={`sidebar-footer flex p-3 border-t border-base-content/5 ${isCollapsed && !isMobile ? 'flex-col-reverse gap-2 items-center justify-center' : 'items-center justify-between gap-2'}`}>
                {/* Theme Toggle */}
                <Tooltip position="right" content={`${t('ui:theme.toggle')} (${mode})`} ariaLabel>
                    <button
                        onClick={(e) => toggleTheme(e)}
                        className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content hover:bg-base-content/10 transition-colors"
                        aria-label={isDark ? t('ui:theme.switchToLight') : t('ui:theme.switchToDark')}
                    >
                        {isDark ? <Moon className="w-4 h-4" aria-hidden="true" /> : <Sun className="w-4 h-4" aria-hidden="true" />}
                    </button>
                </Tooltip>

                {/* Logout Button */}
                {isAuthenticated && (
                    <Tooltip position="right" content={t('layout:nav.signOut', 'Sign Out')}>
                        <button
                            onClick={handleLogoutRequest}
                            className="btn btn-ghost btn-sm btn-square text-error/60 hover:text-error hover:bg-error/10 transition-colors"
                            aria-label={t('layout:nav.signOut', 'Sign Out')}
                        >
                            <LogOut className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </Tooltip>
                )}

                {/* Collapse Toggle */}
                {!isMobile && (
                    <Tooltip position={isCollapsed && !isMobile ? 'right' : 'left'} content={isCollapsed ? t('layout:nav.expand') : t('layout:nav.collapse')} ariaLabel>
                        <button
                            onClick={toggleCollapse}
                            className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content hover:bg-base-content/10 transition-colors"
                            aria-label={isCollapsed ? t('layout:nav.expand') : t('layout:nav.collapse')}
                            aria-expanded={!isCollapsed}
                        >
                            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" aria-hidden="true" /> : <PanelLeftClose className="w-4 h-4" aria-hidden="true" />}
                        </button>
                    </Tooltip>
                )}
            </div>
        </aside>
    );

    // Mobile: Drawer pattern with proper accessibility
    if (isMobile) {
        return (
            <>
                {/* Mobile Menu Button */}
                <button
                    ref={menuButtonRef}
                    onClick={() => setMobileOpen(true)}
                    className="btn btn-circle btn-primary fixed bottom-6 left-6 z-40 shadow-xl md:hidden"
                    aria-controls="sidebar-main"
                    aria-expanded={isMobileOpen}
                    aria-label={t('layout:nav.openMenu')}
                >
                    <Menu className="w-5 h-5" aria-hidden="true" />
                </button>

                {/* Overlay with inert background */}
                {isMobileOpen && (
                    <div
                        className="sidebar-overlay"
                        onClick={() => setMobileOpen(false)}
                        aria-hidden="true"
                    />
                )}

                {/* Sidebar */}
                {sidebarContent}
            </>
        );
    }

    // Desktop
    return (
        <>
            {sidebarContent}
            <LogoutConfirmModal
                isOpen={showLogoutConfirm}
                isLoading={isLoggingOut}
                onConfirm={handleLogoutConfirm}
                onCancel={handleLogoutCancel}
                cancelRef={logoutCancelRef}
            />
        </>
    );
}

/* -------------------------------------------------------------------------------------------------
 * 3. Logout Confirmation Modal (inline for sidebar use)
 * -----------------------------------------------------------------------------------------------*/

interface LogoutConfirmModalProps {
    isOpen: boolean;
    isLoading: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    cancelRef: React.RefObject<HTMLButtonElement | null>;
}

function LogoutConfirmModal({ isOpen, isLoading, onConfirm, onCancel, cancelRef }: LogoutConfirmModalProps) {
    const { t } = useTranslation();

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
            aria-describedby="logout-modal-desc"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in duration-200"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="relative bg-base-100 rounded-3xl shadow-2xl border border-base-content/10 p-6 w-full max-w-sm motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-error/10 flex items-center justify-center">
                        <AlertTriangle className="w-7 h-7 text-error" aria-hidden="true" />
                    </div>

                    <div>
                        <h2 id="logout-modal-title" className="text-lg font-black text-base-content">
                            {t('nav.logout.title', 'Sign Out?')}
                        </h2>
                        <p id="logout-modal-desc" className="text-sm text-base-content/60 mt-1">
                            {t('nav.logout.description', 'You will need to sign in again to access your data.')}
                        </p>
                    </div>

                    <div className="flex gap-3 w-full mt-2">
                        <button
                            ref={cancelRef}
                            onClick={onCancel}
                            disabled={isLoading}
                            className="flex-1 btn btn-ghost rounded-xl font-bold"
                        >
                            {t('common.actions.cancel', 'Cancel')}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className="flex-1 btn btn-error rounded-xl font-bold gap-2"
                        >
                            {isLoading ? (
                                <span className="loading loading-spinner loading-sm" />
                            ) : (
                                <LogOut className="w-4 h-4" aria-hidden="true" />
                            )}
                            {t('nav.signOut', 'Sign Out')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
