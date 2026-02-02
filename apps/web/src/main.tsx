import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/app.css';
import App from './App.tsx';
import './app/i18n'; // Initialize i18n
import { AppBootSplash } from './components/layout/AppBootSplash';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';

// 1) Global Noise Filter for Browser Extensions (DEV only)
if (import.meta.env.DEV) {
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('A listener indicated')) return;
    originalError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('A listener indicated')) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
}

// 2) Query Client Configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Realtime handles staleness
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// 3) Root Render with Bootstrap Error Boundary
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<AppBootSplash />}>
          <App />
        </Suspense>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
);
