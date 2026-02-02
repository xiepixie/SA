import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorScreen';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * GlobalErrorBoundary: Class-based error boundary for bootstrap failures.
 * Catches errors before the router mounts.
 * Offers "Safe Mode" for degraded but functional experience.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[GlobalErrorBoundary] Bootstrap failure:', error, errorInfo);
    }

    private handleRetry = () => {
        // Clear the error state and let React re-render
        this.setState({ hasError: false, error: null });
    };

    private handleSafeMode = () => {
        // Set safe mode flags and reload
        localStorage.setItem('sea:safeMode', '1');
        localStorage.setItem('sea:perfLite', '1');
        window.location.reload();
    };

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            const errorMessage = this.state.error?.message || 'Unknown bootstrap error';
            const stackTrace = this.state.error?.stack;

            // Detect specific fatal errors
            let title = 'Application Failed to Start';
            let message = 'The application encountered a critical error during initialization. You can try Safe Mode for a basic experience.';

            if (errorMessage.includes('WASM') || errorMessage.includes('WebAssembly')) {
                title = 'Rendering Engine Failed';
                message = 'The math rendering engine failed to initialize. Safe Mode will use basic text rendering.';
            } else if (errorMessage.includes('chunk') || errorMessage.includes('module')) {
                title = 'Module Load Failed';
                message = 'Failed to load required application modules. This might be a network or cache issue.';
            }

            return (
                <div className="sea fixed inset-0 z-[9999] bg-mesh-surface overflow-auto">
                    <ErrorScreen
                        kind="fatal"
                        title={title}
                        message={message}
                        detail={errorMessage}
                        stack={stackTrace}
                        onRetry={this.handleRetry}
                        onReload={this.handleReload}
                        onSafeMode={this.handleSafeMode}
                        showNavigation={false}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
