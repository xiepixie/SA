import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from './AppRoutes';
import { startRealtime } from './app/realtime/startRealtime';
import { ensureScheduler, disposeScheduler } from './schedulerSingleton';
import { useAppStore } from './app/state/useAppStore';
import { useSupabaseAuth } from './hooks/useSync';

function App() {
  const queryClient = useQueryClient();
  const pushEffect = useAppStore(s => s.pushEffect);
  const { userId } = useSupabaseAuth();
  const { t, i18n } = useTranslation(['common', 'auth', 'dashboard', 'review', 'import', 'library', 'exams', 'sync', 'settings', 'notes', 'markdown']);

  // 1) Global Unified Notification Listener
  useEffect(() => {
    const handleNotify = (e: any) => {
      const { message, level, i18nKey, i18nParams } = e.detail;

      // Support both raw messages and i18n keys
      let displayMessage = message;
      if (i18nKey) {
        // Check if translation exists
        const translated = t(i18nKey, i18nParams);
        displayMessage = translated !== i18nKey ? translated : (message || i18nKey);
      }

      pushEffect({
        id: `notify-${Date.now()}`,
        type: 'toast',
        message: displayMessage || t('markdown.notifications.tex_copied'),
        level: level || 'success',
        sticky: false
      });
    };
    window.addEventListener('app-notify', handleNotify);
    return () => window.removeEventListener('app-notify', handleNotify);
  }, [pushEffect, t, i18n.language]);

  // 2) Services Lifecycle
  useEffect(() => {
    if (!userId) {
      disposeScheduler();
      return;
    }

    let stopRealtime = startRealtime(userId);
    ensureScheduler(queryClient);

    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) {
        stopRealtime();
        disposeScheduler();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        stopRealtime = startRealtime(userId);
        ensureScheduler(queryClient);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    // NOTE: Global click-to-copy for TeX formulas was removed.
    // Single-click copy caused accidental copies and poor UX.
    // Users can now double-click formulas to view source and copy from there.

    return () => {
      stopRealtime();
      disposeScheduler();
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [queryClient, userId, pushEffect, t]);

  return <RouterProvider router={router} />;
}

export default App;
