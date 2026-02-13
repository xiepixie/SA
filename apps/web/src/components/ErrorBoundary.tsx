import React, { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorScreen, type ErrorKind } from './ErrorScreen';

/**
 * Route-level ErrorBoundary for react-router.
 * Inherits theme from parent context (no forced data-theme).
 * Categorizes errors and delegates to unified ErrorScreen.
 */
export const ErrorBoundary: React.FC = () => {
    const error = useRouteError();
    const { t } = useTranslation(['common']);

    // Classify the error
    let kind: ErrorKind = 'recoverable';
    let status: number | undefined;
    let title = t('errors.boundary.title', 'Something went wrong');
    let message = t('errors.boundary.message', 'An unexpected error occurred.');
    let detail: string | undefined;
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        status = error.status;

        // Classify by status
        if (status === 404 || status === 403) {
            kind = 'navigable';
        } else if (status >= 500) {
            kind = 'recoverable'; // Server errors are often transient
        }

        title = `${error.status} ${error.statusText}`;
        message = typeof error.data === 'string'
            ? error.data
            : error.data?.message || t('errors.boundary.route_error', 'Route error occurred');
        detail = typeof error.data === 'object' ? JSON.stringify(error.data) : undefined;
    } else if (error instanceof Error) {
        message = error.message;
        stack = error.stack;

        // Detect specific recoverable errors
        if (error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('Load failed')) {
            kind = 'recoverable';
            title = t('errors.network_error', 'Network Error');
            message = t('errors.network_message', 'Unable to connect. Please check your connection and try again.');
        } else if (error.message.includes('Loading chunk') ||
            error.message.includes('dynamically imported module')) {
            kind = 'recoverable';
            title = t('errors.chunk_error', 'Loading Error');
            message = t('errors.chunk_message', 'Failed to load a required module. This might be a caching issue.');
        }
    }

    // Log the error
    useEffect(() => {
        console.error('[ErrorBoundary]', { kind, status, message, error });
    }, [kind, status, message, error]);

    return (
        <div className="sea fixed inset-0 z-[9999] bg-mesh-surface overflow-auto">
            <ErrorScreen
                kind={kind}
                status={status}
                title={title}
                message={message}
                detail={detail}
                stack={stack}
                showNavigation={true}
            />
        </div>
    );
};

export default ErrorBoundary;
