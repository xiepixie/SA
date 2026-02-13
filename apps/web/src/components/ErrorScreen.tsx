import React, { useEffect, useRef, useState, useCallback, useContext, useMemo } from 'react';
import { useNavigate, useLocation, UNSAFE_NavigationContext } from 'react-router-dom';
import {
    Home, RefreshCw, ArrowLeft, Copy, Check,
    Zap, Shield, ChevronRight,
    ServerCrash, AlertOctagon, Bug, Wifi
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../app/state/useAppStore';

// =========================================================
// Error Classification
// =========================================================
export type ErrorKind =
    | 'recoverable'   // Network, chunk load, WASM init, timeout
    | 'navigable'     // 404, 403
    | 'fatal';        // Bootstrap failure

export interface ErrorScreenProps {
    kind: ErrorKind;
    status?: number;
    title: string;
    message: string;
    detail?: string;
    stack?: string;
    onRetry?: () => void;           // Soft retry (reset boundary)
    onReload?: () => void;          // Hard reload
    onSafeMode?: () => void;        // Enter safe mode
    showNavigation?: boolean;       // Show nav buttons (may not be available during bootstrap)
}

// =========================================================
// ErrorScreen Component - Entry point
// =========================================================
export const ErrorScreen: React.FC<ErrorScreenProps> = (props) => {
    // Top-level context check is safe
    const navCtx = useContext(UNSAFE_NavigationContext);

    // Branching component strategy ensures Hooks are called in fixed order within branches
    if (navCtx) {
        return <ErrorScreenWithRouter {...props} />;
    }
    return <ErrorScreenNoRouter {...props} />;
};

// =========================================================
// Branch: With Router Support
// =========================================================
const ErrorScreenWithRouter: React.FC<ErrorScreenProps> = (props) => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <ErrorScreenBase
            {...props}
            navigate={navigate}
            pathname={location.pathname}
            hasRouter={true}
        />
    );
};

// =========================================================
// Icon Selection by Error Kind
// =========================================================
const getIcon = (kind: ErrorKind, status?: number) => {
    if (kind === 'navigable' && status === 404) return AlertOctagon;
    if (kind === 'navigable' && status === 403) return Shield;
    if (kind === 'recoverable') return Wifi;
    if (kind === 'fatal') return ServerCrash;
    return Bug;
};

const getAccentColor = (kind: ErrorKind, _status?: number) => {
    if (kind === 'navigable') return 'warning';
    if (kind === 'recoverable') return 'info';
    return 'error';
};

// =========================================================
// Branch: No Router (Bootstrap/Fatal)
// =========================================================
const ErrorScreenNoRouter: React.FC<ErrorScreenProps> = (props) => {
    return (
        <ErrorScreenBase
            {...props}
            navigate={null}
            pathname={undefined}
            hasRouter={false}
        />
    );
};

interface ErrorScreenBaseProps extends ErrorScreenProps {
    navigate: ReturnType<typeof useNavigate> | null;
    pathname?: string;
    hasRouter: boolean;
}

// =========================================================
// Base Implementation - Pure UI Logic
// =========================================================
const ErrorScreenBase: React.FC<ErrorScreenBaseProps> = (props) => {
    const {
        kind,
        status,
        title,
        message,
        detail,
        stack,
        onRetry,
        onReload,
        onSafeMode,
        showNavigation: showNavigationProp = true,
        navigate,
        pathname,
        hasRouter,
    } = props;

    const { t } = useTranslation(['common']);

    // Stability: Fixed ID and Memoized Report
    const errorIdRef = useRef(`ERR-${Date.now().toString(36).toUpperCase()}`);
    const report = useMemo(() => ({
        timestamp: new Date().toISOString(),
        errorId: errorIdRef.current,
        kind,
        status,
        title,
        message,
        detail,
        stack: import.meta.env.DEV ? stack : undefined,
        path: pathname,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        safeMode: localStorage.getItem('sea:safeMode') === '1',
    }), [kind, status, title, message, detail, stack, pathname]);

    // UI State
    const [copied, setCopied] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const primaryRef = useRef<HTMLButtonElement>(null);

    // Online Status Tracking
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Store Access
    const dashEntity = useAppStore.getState().entities?.dashboard?.['me'];
    const dueCount = dashEntity?.dueCount ?? 0;
    const hasDueCards = dueCount > 0;

    // Auto-focus primary button
    useEffect(() => {
        primaryRef.current?.focus();
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle ESC if we are in a state that allows navigation
            if (e.key === 'Escape' && (kind === 'navigable' || kind === 'recoverable')) {
                if (navigate) {
                    navigate('/');
                } else {
                    window.location.href = '/';
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate, kind]);

    // Robust Clipboard Helper
    const copyToClipboard = async (text: string) => {
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (err) {
            console.warn('Clipboard API failed, falling back to textarea', err);
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch (err) {
            console.error('Final clipboard fallback failed', err);
            return false;
        }
    };

    const handleCopyReport = useCallback(async () => {
        const success = await copyToClipboard(JSON.stringify(report, null, 2));
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
            try {
                const pushEffect = useAppStore.getState().pushEffect;
                if (pushEffect) {
                    pushEffect({
                        id: `copy-report-${Date.now()}`,
                        type: 'toast',
                        message: t('errors.report_copied', 'Diagnostic info copied'),
                        level: 'success',
                        sticky: false,
                    });
                }
            } catch { /* ignore */ }
        }
    }, [report, t]);

    const handleRetry = useCallback(async () => {
        if (retrying) return;
        setRetrying(true);
        await new Promise(r => setTimeout(r, 600));

        if (onRetry) {
            onRetry();
        } else if (onReload) {
            onReload();
        } else {
            window.location.reload();
        }
    }, [retrying, onRetry, onReload]);

    const handleSafeMode = useCallback(() => {
        localStorage.setItem('sea:safeMode', '1');
        if (onSafeMode) {
            onSafeMode();
        } else {
            window.location.reload();
        }
    }, [onSafeMode]);

    const Icon = getIcon(kind, status);
    const accentColor = getAccentColor(kind, status);

    const getSuggestions = () => {
        const items: string[] = [];
        if (!isOnline) {
            items.push(t('errors.suggest.offline', 'You appear to be offline. Check your connection.'));
        }
        if (kind === 'recoverable') {
            items.push(t('errors.suggest.vpn', 'Disable VPN or proxy if enabled'));
            items.push(t('errors.suggest.refresh', 'Try refreshing the page in a few moments'));
        }
        if (kind === 'fatal') {
            items.push(t('errors.suggest.browser', 'Ensure your browser is up to date'));
            items.push(t('errors.suggest.storage', 'Check if your disk is full'));
            items.push(t('errors.suggest.contact', 'Contact support if this persists'));
        }
        return items;
    };

    const suggestions = getSuggestions();

    return (
        <div
            className={`sea error-screen min-h-full relative flex items-center justify-center p-6 bg-transparent theme-${accentColor}`}
            role="main"
            aria-labelledby="error-title"
            aria-describedby="error-desc"
            style={{
                '--accent-color': `var(--color-${accentColor})`,
                '--accent-color-content': `var(--color-${accentColor}-content)`,
            } as React.CSSProperties}
        >
            {/* Critical Announcement for Screen Readers */}
            <div className="sr-only" role="alert" aria-live="assertive">
                {title}. {message}
            </div>

            {/* Decorative Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-[var(--accent-color)]/5 rounded-full blur-[100px] animate-blob-drift" />
                <div className="absolute bottom-[-5%] right-[-5%] w-[35%] h-[35%] bg-primary/5 rounded-full blur-[80px] animate-blob-drift" style={{ animationDelay: '-4s' }} />
            </div>

            {/* Error Card */}
            <div className="error-card p-8 md:p-12 max-w-2xl w-full mx-auto relative z-10 reveal-smooth shadow-2xl">
                {/* Icon with subtle lift */}
                <div className="flex items-center justify-center mb-10">
                    <div className="relative group">
                        <div className="error-icon error-icon-container se-interactive w-20 h-20 rounded-2xl">
                            <Icon className="w-10 h-10 text-[var(--accent-color)]/70 transition-transform group-hover:scale-105" strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        {status && (
                            <div className="absolute -bottom-2 -right-2 error-badge px-3 py-1 font-mono text-sm">
                                {status}
                            </div>
                        )}
                        {!status && kind === 'fatal' && (
                            <div className="absolute -bottom-2 -right-2 error-badge px-3 py-1 bg-error">
                                !
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="text-center mb-10">
                    <h1 id="error-title" className="text-3xl md:text-4xl font-black text-base-content tracking-tight mb-4 transition-all">
                        {title}
                    </h1>
                    <div id="error-desc" className="space-y-3">
                        <p className="text-base-content/70 text-lg leading-relaxed max-w-md mx-auto">
                            {message}
                        </p>
                        {detail && (
                            <p className="text-base-content/50 text-sm italic max-w-sm mx-auto">
                                "{detail}"
                            </p>
                        )}
                    </div>

                    <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/5 text-[10px] font-mono text-base-content/40 uppercase tracking-widest border border-base-content/5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-error'} animate-pulse`} />
                        ID: {errorIdRef.current}
                    </div>
                </div>

                {/* Troubleshooting Suggestions - Balanced Context */}
                {suggestions.length > 0 && (
                    <div className="mb-10 p-5 rounded-2xl bg-base-content/5 border border-base-content/5 max-w-md mx-auto">
                        <h2 className="text-xs font-bold text-base-content/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-[var(--accent-color)]" />
                            {t('errors.troubleshooting', 'Troubleshooting')}
                        </h2>
                        <ul className="space-y-2">
                            {suggestions.map((s, i) => (
                                <li key={i} className="text-sm text-base-content/60 flex items-start gap-2">
                                    <div className="w-1 h-1 rounded-full bg-base-content/20 mt-2 shrink-0" />
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Primary Actions - Recovery Focused */}
                <div className="flex flex-col gap-4 mb-8 max-w-sm mx-auto">
                    {kind === 'recoverable' && (
                        <>
                            <button
                                ref={primaryRef}
                                onClick={handleRetry}
                                disabled={retrying || !isOnline}
                                className="btn btn-primary btn-lg w-full gap-3 shadow-xl shadow-primary/20 error-cta-primary group"
                            >
                                <RefreshCw className={`w-5 h-5 ${retrying ? 'animate-spin' : 'group-hover:rotate-90 transition-transform duration-500'}`} />
                                {retrying ? t('errors.retrying', 'Retrying...') : (!isOnline ? t('errors.offline_retry', 'Waiting for network...') : t('errors.retry', 'Retry Now'))}
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="btn btn-ghost w-full gap-2 text-base-content/50 hover:text-base-content"
                            >
                                <RefreshCw className="w-4 h-4" />
                                {t('errors.hard_reload', 'Force Refresh')}
                            </button>
                        </>
                    )}

                    {kind === 'navigable' && navigate && (
                        <>
                            {hasDueCards && (
                                <button
                                    ref={primaryRef}
                                    onClick={() => navigate('/review')}
                                    className="btn btn-primary btn-lg w-full gap-3 shadow-xl shadow-primary/20 error-cta-primary"
                                >
                                    <Zap className="w-5 h-5 fill-current" />
                                    {t('errors.continue_review', 'Back to Review')}
                                    <span className="badge badge-sm bg-white/20 border-none font-mono text-white ml-auto">{dueCount}</span>
                                </button>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    ref={hasDueCards ? undefined : primaryRef}
                                    onClick={() => navigate(-1)}
                                    className="btn btn-outline gap-2 border-base-content/10"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    {t('errors.go_back', 'Go Back')}
                                </button>
                                <button
                                    onClick={() => navigate('/')}
                                    className="btn btn-ghost gap-2 bg-base-content/5"
                                >
                                    <Home className="w-4 h-4" />
                                    {t('errors.go_home', 'Home')}
                                </button>
                            </div>
                        </>
                    )}

                    {!hasRouter && kind === 'navigable' && (
                        <button
                            ref={primaryRef}
                            onClick={() => window.location.href = '/'}
                            className="btn btn-primary btn-lg w-full gap-3 shadow-xl shadow-primary/20 error-cta-primary"
                        >
                            <Home className="w-5 h-5" />
                            {t('errors.go_home', 'Home')}
                        </button>
                    )}

                    {kind === 'fatal' && (
                        <>
                            <button
                                ref={primaryRef}
                                onClick={handleSafeMode}
                                className="btn btn-warning btn-lg w-full gap-3 shadow-xl shadow-warning/20 error-cta-primary"
                            >
                                <Shield className="w-5 h-5" />
                                {t('errors.safe_mode', 'Launch Safe Mode')}
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="btn btn-outline w-full gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                {t('errors.reload_page', 'Reload Page')}
                            </button>
                        </>
                    )}
                </div>

                {/* Footer Utilities */}
                <div className="flex flex-col items-center gap-6 mt-4">
                    <button
                        onClick={handleCopyReport}
                        className="btn btn-ghost btn-xs gap-2 opacity-40 hover:opacity-100 transition-opacity"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3 h-3 text-success" />
                                <span role="status" aria-live="polite">{t('errors.copied', 'Copied to Clipboard')}</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3 h-3" />
                                {t('errors.copy_report', 'Copy Diagnostic Report')}
                            </>
                        )}
                    </button>

                    {/* Developer Details */}
                    {import.meta.env.DEV && stack && (
                        <div className="w-full">
                            <details
                                className="group p-1"
                                open={detailsOpen}
                                onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
                            >
                                <summary className="cursor-pointer text-[10px] font-bold text-base-content/30 hover:text-base-content/60 uppercase tracking-widest flex items-center justify-center gap-2 select-none list-none transition-colors">
                                    <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${detailsOpen ? 'rotate-90' : ''}`} />
                                    {t('errors.dev_details', 'Technical Details')}
                                </summary>
                                <div className="mt-4 p-4 bg-base-300/30 rounded-xl overflow-hidden border border-base-content/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <pre className="text-[11px] text-error/70 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-48 scrollbar-thin">
                                        {stack}
                                    </pre>
                                </div>
                            </details>
                        </div>
                    )}
                </div>

                {/* Keyboard Bottom Hint */}
                {hasRouter && showNavigationProp && (
                    <div className="mt-12 pt-8 border-t border-base-content/5">
                        <div className="flex items-center justify-center gap-1.5 keyboard-hint px-3 py-1.5 opacity-30">
                            <span>{t('errors.keyboard_prefix', 'Press')}</span>
                            <kbd className="min-w-[32px] h-5 flex items-center justify-center bg-base-content/10 border-b-2 border-base-content/20 rounded shadow-sm text-[10px]">{t('errors.key_esc', 'ESC')}</kbd>
                            <span>{t('errors.keyboard_suffix', 'to return home')}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ErrorScreen;
