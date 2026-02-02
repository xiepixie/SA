import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { GenericSkeleton } from './PageSkeletons';
import { useAppStore } from '../../app/state/useAppStore';
import { AppSidebar, useSidebar, SidebarProvider } from './Sidebar';
import { useUserSettings } from '../../app/state/useUserSettings';
import { Info } from 'lucide-react';
import type { UXEffect } from '@v2/shared';
import { Toast, type ToastLevel } from '../ui/Toast';
import { GlassCard } from '../ui/GlassCard';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';

type Level = 'success' | 'error' | 'info';

const TTL: Record<Level, number> = {
    success: 2500,
    info: 4000,
    error: 0, // 0 = sticky by default
};

const LayoutShell: React.FC = () => {
    const isFetching = useIsFetching();
    const isMutating = useIsMutating();
    const isLoading = isFetching > 0 || isMutating > 0;
    const { isCollapsed, isMobile, isRestoring } = useSidebar();
    const preferences = useUserSettings(s => s.preferences);
    const effects = useAppStore(s => s.effects);
    const dismissEffect = useAppStore(s => s.dismissEffect);
    const location = useLocation();

    const timers = useRef<Record<string, number>>({});
    const prevPathRef = useRef(location.pathname);

    // Track navigation direction for page transitions
    const navDirection = useMemo(() => {
        const prev = prevPathRef.current;
        const curr = location.pathname;

        // Simple heuristic: deeper path = push, shallower = pop
        const prevDepth = prev.split('/').filter(Boolean).length;
        const currDepth = curr.split('/').filter(Boolean).length;

        if (currDepth > prevDepth) return 'nav-push';
        if (currDepth < prevDepth) return 'nav-pop';
        return 'nav-swap'; // Same level
    }, [location.pathname]);

    // Update prevPathRef after render
    React.useLayoutEffect(() => {
        prevPathRef.current = location.pathname;
    }, [location.pathname]);

    const visibleMax = 3;
    const visible = useMemo<UXEffect[]>(() => effects.slice(-visibleMax), [effects]);
    const hiddenCount = Math.max(0, effects.length - visible.length);

    // Per-toast TTL scheduling
    useEffect(() => {

        // 1) Schedule timers for new effects
        effects.forEach((eff) => {
            if (timers.current[eff.id]) return; // already scheduled

            const level: Level = (eff.level as Level) ?? 'info';
            const sticky = eff.sticky ?? (level === 'error');
            const baseTtl = sticky ? 0 : TTL[level];

            // Errors get a longer default TTL if not sticky
            const ttl = (level === 'error' && !eff.sticky) ? 15000 : baseTtl;

            if (ttl > 0) {
                timers.current[eff.id] = window.setTimeout(() => {
                    dismissEffect(eff.id);
                    delete timers.current[eff.id];
                }, ttl);
            }
        });

        // 2) Cleanup timers for removed effects
        const currentIds = new Set(effects.map(e => e.id));
        Object.keys(timers.current).forEach(id => {
            if (!currentIds.has(id)) {
                window.clearTimeout(timers.current[id]);
                delete timers.current[id];
            }
        });
    }, [effects, dismissEffect]);

    // ESC closes the most recent toast
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && effects.length > 0) {
                dismissEffect(effects[effects.length - 1].id);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [effects, dismissEffect]);

    return (
        <div className="sea">
            {/* Background Loading Indicator */}
            {isLoading && <div className="bg-loading-indicator" aria-hidden="true" />}

            {/* Background Decorator: Liquid Blobs for Glass Refraction */}
            {(preferences.ux?.reflections ?? true) && (
                <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-40">
                    <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
                    <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] rounded-full bg-secondary/10 blur-[140px] animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-[40%] right-[30%] w-[300px] h-[300px] rounded-full bg-accent/15 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
                </div>
            )}

            <div
                id="app-shell"
                className={`app-shell relative 
                    ${(isCollapsed && !isMobile) ? 'collapsed' : ''} 
                    ${isRestoring ? 'no-transitions' : ''}
                    ${!(preferences.ux?.animations ?? true) ? 'disable-animations' : ''}
                    ${(preferences.ux?.reducedMotion ?? false) ? 'reduced-motion' : ''}
                `}
            >
                {/* Sidebar */}
                <AppSidebar />

                {/* Main Content */}
                <GlassCard
                    variant="surface"
                    className="main relative flex flex-col min-w-0 w-full min-h-0 overflow-hidden"
                >
                    <div className="main-body flex-1 overflow-hidden relative">
                        {/* Page Stage: enables smooth page transitions */}
                        <div className={`page-stage h-full ${navDirection}`}>
                            {/*
                              * REMOVED key={location.pathname} to prevent full unmount/remount on navigation.
                              * React Router's Outlet handles component switching automatically.
                              * Using key caused: 1) Suspense fallback flash, 2) useActiveView re-triggering markStale
                              * The navDirection class still enables CSS-based page transition animations.
                              */}
                            <div className="page-content h-full w-full flex flex-col overflow-y-auto custom-scrollbar">
                                <Suspense fallback={<GenericSkeleton />}>
                                    <Outlet />
                                </Suspense>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* Toast Stack */}
                <div
                    className="toast toast-end toast-bottom z-50 p-4 sm:p-6 flex flex-col gap-2.5 items-end overflow-visible pointer-events-none"
                    aria-label="Notifications"
                >
                    {visible.map((eff: UXEffect) => (
                        <Toast
                            key={eff.id}
                            id={eff.id}
                            message={eff.message}
                            level={eff.level as ToastLevel}
                            sticky={eff.sticky}
                            onDismiss={dismissEffect}
                        />
                    ))}

                    {hiddenCount > 0 && (
                        <GlassCard variant="card" className="alert shadow-2xl border-l-4 border-base-content/20 animate-reveal-spring">
                            <Info className="w-5 h-5 opacity-70" />
                            <div className="flex-1">
                                <h3 className="font-bold text-sm">+{hiddenCount} more queued</h3>
                                <p className="text-[10px] uppercase tracking-widest opacity-60 font-black mt-0.5">
                                    Notifications overflow
                                </p>
                            </div>
                        </GlassCard>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Layout: React.FC = () => {
    return (
        <SidebarProvider>
            <LayoutShell />
        </SidebarProvider>
    );
};
