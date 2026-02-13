/**
 * AppRoutes.tsx - React Router Configuration with React.lazy()
 *
 * Simplified approach using standard React.lazy() for code splitting.
 * The Layout component wraps Outlet in Suspense to show GenericSkeleton
 * while lazy components are loading.
 */

import React, { Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GenericSkeleton } from './components/layout/PageSkeletons';

// Lazy load all page components using React.lazy()
const WelcomePage = React.lazy(() => import('./pages/WelcomePage').then(m => ({ default: m.WelcomePage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ReviewSession = React.lazy(() => import('./pages/ReviewSession').then(m => ({ default: m.ReviewSession })));
const QuestionBank = React.lazy(() => import('./pages/QuestionBank').then(m => ({ default: m.QuestionBank })));
const ImportPage = React.lazy(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));
const ExamsPage = React.lazy(() => import('./pages/ExamsPage').then(m => ({ default: m.ExamsPage })));
const SyncPage = React.lazy(() => import('./pages/SyncPage').then(m => ({ default: m.SyncPage })));
const ManagePage = React.lazy(() => import('./pages/ManagePage').then(m => ({ default: m.ManagePage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const FsrsProfilesPage = React.lazy(() => import('./pages/FsrsProfilesPage').then(m => ({ default: m.FsrsProfilesPage })));
const QuestionDetailPage = React.lazy(() => import('./pages/QuestionDetailPage').then(m => ({ default: m.QuestionDetailPage })));
const NotebookPage = React.lazy(() => import('./pages/NotebookPage.tsx'));
const LatexTestPage = React.lazy(() => import('./pages/LatexTestPage').then(m => ({ default: m.LatexTestPage })));
const AuthPage = React.lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const NotFound = React.lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

export const router = createBrowserRouter([
    {
        path: '/',
        element: <Layout />,
        errorElement: <ErrorBoundary />,
        children: [
            { index: true, element: <WelcomePage /> },
            { path: 'dashboard', element: <DashboardPage /> },
            { path: 'review', element: <ReviewSession /> },
            { path: 'notebook', element: <NotebookPage /> },
            { path: 'questions', element: <QuestionBank /> },
            { path: 'import', element: <ImportPage /> },
            { path: 'exams', element: <ExamsPage /> },
            { path: 'sync', element: <SyncPage /> },
            { path: 'manage', element: <ManagePage /> },
            { path: 'settings', element: <SettingsPage /> },
            { path: 'settings/fsrs-profiles', element: <FsrsProfilesPage /> },
            { path: 'questions/:id', element: <QuestionDetailPage /> },
            { path: 'test/latex', element: <LatexTestPage /> }
        ],
    },
    {
        path: '/login',
        element: <Suspense fallback={<GenericSkeleton />}><AuthPage /></Suspense>
    },
    {
        path: '*',
        element: <Suspense fallback={<GenericSkeleton />}><NotFound /></Suspense>
    }
]);
