import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, setSessionPersistence, getSessionPersistence } from '../lib/supabase';
import { Mail, Lock, ArrowRight, Loader2, Sparkles, ShieldCheck, Eye, EyeOff, Command, Users, TrendingUp, Check, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../app/state/useAppStore';
import { useShallow } from 'zustand/shallow';
import { GlassCard } from '../components/ui/GlassCard';
import { Toast, type ToastLevel } from '../components/ui/Toast';
import { cn } from '../app/utils/cn';

// Animated counter hook for statistics
const useCountUp = (end: number, duration: number = 2000, decimals: number = 0) => {
    const [count, setCount] = useState(0);
    const countRef = useRef<number>(0);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
        const animate = (timestamp: number) => {
            if (!startTimeRef.current) startTimeRef.current = timestamp;
            const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
            // Easing function: ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            countRef.current = eased * end;
            setCount(countRef.current);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [end, duration]);

    return decimals > 0 ? count.toFixed(decimals) : Math.floor(count);
};

// Stat card component for hero section
interface StatCardProps {
    value: string | number;
    suffix?: string;
    label: string;
    icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ value, suffix, label, icon }) => (
    <div className="group flex items-center gap-4 p-3 -m-3 rounded-2xl transition-all duration-300 hover:bg-base-content/[0.03]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-base-content/5 to-base-content/10 flex items-center justify-center text-base-content/30 group-hover:text-primary group-hover:from-primary/10 group-hover:to-primary/5 transition-all duration-300">
            {icon}
        </div>
        <div className="space-y-0.5">
            <div className="text-2xl font-black text-base-content tabular-nums tracking-tighter flex items-baseline gap-0.5">
                {value}
                {suffix && <span className="text-lg text-primary/60">{suffix}</span>}
            </div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/30">{label}</div>
        </div>
    </div>
);

export const AuthPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { pushEffect, dismissEffect, effects } = useAppStore(useShallow(s => ({
        pushEffect: s.pushEffect,
        dismissEffect: s.dismissEffect,
        effects: s.effects
    })));

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [honeypot, setHoneypot] = useState('');
    const [isCapsLock, setIsCapsLock] = useState(false);
    const [rememberMe, setRememberMe] = useState(() => getSessionPersistence());
    const emailRef = React.useRef<HTMLInputElement>(null);

    // Caps Lock Detection
    const handlePasswordDetect = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ('getModifierState' in e) {
            setIsCapsLock(e.getModifierState('CapsLock'));
        }
    };

    // Helper to translate Supabase auth error messages
    const translateAuthError = (message: string): string => {
        const lowerMsg = message.toLowerCase();

        // Map known Supabase error patterns to translation keys
        if (lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid email or password')) {
            return t('auth.status.error_invalid');
        }
        if (lowerMsg.includes('user already registered') || lowerMsg.includes('already exists')) {
            return t('auth.status.error_exists');
        }
        if (lowerMsg.includes('email not confirmed')) {
            return t('auth.status.error_email_not_confirmed');
        }
        if (lowerMsg.includes('too many requests') || lowerMsg.includes('rate limit')) {
            return t('auth.status.error_rate_limit');
        }
        if (lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
            return t('auth.status.error_network');
        }
        // Fallback to original message or generic error
        return t('auth.status.error_general');
    };

    // Resolve theme details
    useEffect(() => {
        emailRef.current?.focus();
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (honeypot) return;

        if (password.length < 8 && !isLogin) {
            pushEffect({
                id: `auth-val-pwd-${Date.now()}`,
                type: 'toast',
                message: t('auth.status.error_password_length', 'Password must be at least 8 characters'),
                level: 'info'
            });
            return;
        }

        setLoading(true);

        try {
            if (isLogin) {
                // Set persistence preference before login
                setSessionPersistence(rememberMe);
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                pushEffect({
                    id: `auth-success-${Date.now()}`,
                    type: 'toast',
                    message: t('auth.status.success_login'),
                    level: 'success'
                });
                navigate('/dashboard');
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: window.location.origin + '/login' }
                });
                if (error) throw error;
                pushEffect({
                    id: `auth-signup-success-${Date.now()}`,
                    type: 'toast',
                    message: t('auth.status.success_signup'),
                    level: 'success',
                    sticky: true
                });
            }
        } catch (err: unknown) {
            const rawMessage = err instanceof Error ? err.message : String(err);
            pushEffect({
                id: `auth-error-${Date.now()}`,
                type: 'toast',
                message: translateAuthError(rawMessage),
                level: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!email) {
            pushEffect({
                id: `auth-reset-no-email-${Date.now()}`,
                type: 'toast',
                message: t('auth.status.reset_email_required'),
                level: 'info'
            });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login',
            });
            if (error) throw error;
            pushEffect({
                id: `auth-reset-sent-${Date.now()}`,
                type: 'toast',
                message: t('auth.status.reset_sent'),
                level: 'success'
            });
        } catch (err: unknown) {
            const rawMessage = err instanceof Error ? err.message : String(err);
            pushEffect({ id: `auth-reset-error-${Date.now()}`, type: 'toast', message: translateAuthError(rawMessage), level: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const passwordStrength = useMemo(() => {
        if (!password) return 0;
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        return score;
    }, [password]);

    const strengthColor = ['bg-base-content/10', 'bg-error', 'bg-warning', 'bg-info', 'bg-success'][passwordStrength];

    return (
        <div className="sea w-full min-h-dvh bg-base-100 selection:bg-primary/30 relative overflow-hidden flex items-stretch">
            {/* Liquid Background Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] -left-[5%] w-[60%] h-[60%] rounded-full bg-primary/15 blur-[120px] animate-blob-drift opacity-60" />
                <div className="absolute bottom-[-10%] -right-[5%] w-[50%] h-[50%] rounded-full bg-secondary/15 blur-[140px] animate-blob-drift opacity-60" style={{ animationDelay: '2s' }} />
                <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/15 blur-[100px] animate-blob-drift opacity-40" style={{ animationDelay: '4s' }} />

                {/* Architectural Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(from_var(--color-base-content)_l_c_h_/_0.03)_1px,transparent_1px),linear-gradient(to_bottom,oklch(from_var(--color-base-content)_l_c_h_/_0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_20%,transparent_100%)]" />
            </div>

            {/* Left Panel: Hero Section (Visible on LG and up) */}
            <div className="hidden lg:flex flex-1 relative flex-col justify-between p-16 z-10 overflow-hidden border-r border-base-content/5">
                <div className="space-y-16">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl shadow-primary/20 ring-1 ring-white/10">
                            <Command className="w-7 h-7 text-primary-content" />
                        </div>
                        <span className="text-2xl font-black tracking-[-0.04em] text-base-content uppercase">{t('auth.hero.brand')}</span>
                    </div>

                    <div className="space-y-8 max-w-xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary animate-reveal-spring">
                            <Sparkles className="w-3.5 h-3.5" />
                            {t('auth.hero.version')}
                        </div>
                        <h2
                            className="text-6xl font-black leading-[0.95] text-base-content tracking-[-0.05em] 
                                [&_span]:italic [&_span]:bg-clip-text [&_span]:text-transparent 
                                [&_span]:bg-gradient-to-r [&_span]:from-primary [&_span]:via-primary/80 [&_span]:to-accent 
                                [&_span]:pr-[0.15em] [&_span]:pb-[0.15em] [&_span]:inline-block [&_span]:leading-[1.1]
                                [&_span]:drop-shadow-[0_0_20px_oklch(from_var(--color-primary)_l_c_h_/_0.3)]"
                            dangerouslySetInnerHTML={{ __html: t('auth.hero.headline') }}
                        />
                        <p className="text-lg text-base-content/50 leading-relaxed font-medium">
                            {t('auth.hero.subtitle')}
                        </p>
                    </div>
                </div>

                {/* Stats Section with Animated Counters */}
                <div className="flex items-center gap-10">
                    <StatCard
                        value={useCountUp(24802, 2500)}
                        suffix="+"
                        label={t('auth.hero.stats.nodes')}
                        icon={<Users className="w-4 h-4" />}
                    />
                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-base-content/10 to-transparent" />
                    <StatCard
                        value={useCountUp(94.8, 2000, 1)}
                        suffix="%"
                        label={t('auth.hero.stats.retention')}
                        icon={<TrendingUp className="w-4 h-4" />}
                    />
                </div>

                {/* Background Pattern */}
                <div className="absolute bottom-0 right-0 w-[80%] h-[80%] -z-10 bg-[radial-gradient(circle_at_bottom_right,oklch(from_var(--color-primary)_l_c_h_/_0.08),transparent_70%)] blur-3xl" />
            </div>

            {/* Right Panel: Auth Container */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-16 relative z-10">
                <div className="w-full max-w-[440px]">
                    <GlassCard
                        variant="card"
                        className="p-10 sm:p-12 space-y-10 animate-reveal-spring shadow-3xl border-t border-white/10"
                    >
                        {/* Header */}
                        <div className="space-y-3">
                            <div className="lg:hidden flex items-center gap-3 mb-8">
                                <Command className="w-6 h-6 text-primary" />
                                <span className="font-black text-sm uppercase tracking-widest">{t('auth.hero.brand')}</span>
                            </div>
                            <h1 className="text-4xl font-black text-base-content tracking-tight">
                                {isLogin ? t('auth.login.title') : t('auth.signup.title')}
                            </h1>
                            <p className="text-sm font-medium text-base-content/40">
                                {isLogin ? t('auth.login.desc') : t('auth.signup.desc')}
                            </p>
                        </div>

                        {/* Form */}
                        <form id="auth-form" name="auth_form" onSubmit={handleAuth} className="space-y-8">
                            {/* Honeypot field - Bot detection */}
                            <input
                                type="text"
                                id="hp_field"
                                name="hp_field"
                                value={honeypot}
                                onChange={e => setHoneypot(e.target.value)}
                                className="absolute opacity-0 -z-50 pointer-events-none"
                                tabIndex={-1}
                                aria-hidden="true"
                            />

                            <div className="space-y-6">
                                {/* Email */}
                                <div className="space-y-2.5">
                                    <label htmlFor="email" className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/50 ml-1 flex items-center gap-2">
                                        {t('auth.fields.email')}
                                        <span className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
                                    </label>
                                    <div className="relative group">
                                        {/* Glow effect */}
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/40 to-accent/40 rounded-[22px] opacity-0 group-focus-within:opacity-100 blur-sm transition-opacity duration-300" />
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-primary transition-colors duration-300 text-base-content/20 z-10">
                                            <Mail className="h-4.5 w-4.5" />
                                        </div>
                                        <input
                                            ref={emailRef}
                                            id="email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="relative w-full bg-base-content/[0.03] border border-base-content/10 focus:border-primary/50 focus:bg-base-content/[0.06] hover:bg-base-content/[0.05] rounded-[20px] h-14 pl-12 pr-4 text-sm font-bold transition-all placeholder:text-base-content/20 outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder={t('auth.fields.email_ph')}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-2.5 text-right">
                                    <div className="flex justify-between items-center ml-1 mb-1">
                                        <label htmlFor="password" className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/50 flex items-center gap-2">
                                            {t('auth.fields.password')}
                                            <span className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent min-w-8" />
                                        </label>
                                        {isLogin && (
                                            <button
                                                type="button"
                                                onClick={handleResetPassword}
                                                className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                                            >
                                                {t('auth.forgot')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative group">
                                        {/* Glow effect */}
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/40 to-accent/40 rounded-[22px] opacity-0 group-focus-within:opacity-100 blur-sm transition-opacity duration-300" />
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-primary transition-colors duration-300 text-base-content/20 z-10">
                                            <Lock className="h-4.5 w-4.5" />
                                        </div>
                                        <input
                                            id="password"
                                            name="password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete={isLogin ? "current-password" : "new-password"}
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onKeyDown={handlePasswordDetect}
                                            onMouseDown={handlePasswordDetect}
                                            className="relative w-full bg-base-content/[0.03] border border-base-content/10 focus:border-primary/50 focus:bg-base-content/[0.06] hover:bg-base-content/[0.05] rounded-[20px] h-14 pl-12 pr-12 text-sm font-bold transition-all placeholder:text-base-content/20 outline-none focus:ring-2 focus:ring-primary/20"
                                            placeholder={t('auth.fields.password_ph')}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-base-content/20 hover:text-primary transition-colors z-10"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                                        </button>

                                        {/* Caps Lock Indicator */}
                                        {isCapsLock && (
                                            <div className="absolute -top-7 right-1 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning/10 border border-warning/20 animate-reveal-spring select-none pointer-events-none">
                                                <div className="w-1 h-1 rounded-full bg-warning animate-pulse" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-warning">
                                                    {t('auth.fields.caps_lock')}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {!isLogin && password.length > 0 && (
                                        <div className="space-y-2 px-1 text-left mt-3">
                                            <div className="flex gap-1.5">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-700", passwordStrength >= i ? strengthColor : 'bg-base-content/5')} />
                                                ))}
                                            </div>
                                            <p className={cn("text-[8px] font-black uppercase tracking-widest", strengthColor.replace('bg-', 'text-'))}>
                                                {t(`auth.fields.strength.${passwordStrength}`)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Remember Me - Only show on login */}
                            {isLogin && (
                                <div className="flex items-center justify-between pt-1 animate-reveal-spring">
                                    <label
                                        htmlFor="remember-me"
                                        className="flex items-center gap-3 cursor-pointer group select-none"
                                    >
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                id="remember-me"
                                                checked={rememberMe}
                                                onChange={(e) => setRememberMe(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className={cn(
                                                "w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center",
                                                rememberMe
                                                    ? "bg-primary border-primary"
                                                    : "border-base-content/20 group-hover:border-primary/50"
                                            )}>
                                                <Check className={cn(
                                                    "w-3.5 h-3.5 text-primary-content transition-all duration-200",
                                                    rememberMe ? "opacity-100 scale-100" : "opacity-0 scale-75"
                                                )} />
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold text-base-content/50 group-hover:text-base-content/70 transition-colors">
                                            {t('auth.fields.remember_me')}
                                        </span>
                                    </label>

                                    {/* Tooltip */}
                                    <div className="relative group/tooltip">
                                        <Info className="w-4 h-4 text-base-content/20 group-hover/tooltip:text-primary/60 transition-colors cursor-help" />
                                        <div className="absolute right-0 bottom-full mb-2 w-56 p-3 rounded-xl bg-base-300/95 backdrop-blur-xl border border-base-content/10 shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 pointer-events-none z-50">
                                            <p className="text-[10px] font-medium text-base-content/70 leading-relaxed">
                                                {t('auth.fields.remember_me_hint')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-15 rounded-[22px] bg-primary text-primary-content font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {loading ? (
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>{t('auth.status.loading')}</span>
                                        </div>
                                    ) : (
                                        <>
                                            {isLogin ? t('auth.login.btn') : t('auth.signup.btn')}
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsLogin(!isLogin);
                                        setPassword('');
                                        setShowPassword(false);
                                    }}
                                    className="w-full text-center text-xs font-black uppercase tracking-widest text-base-content/30 hover:text-primary transition-all py-3"
                                >
                                    {isLogin ? t('auth.login.switch') : t('auth.signup.switch')}
                                </button>
                            </div>
                        </form>

                        {/* Footer Info */}
                        <div className="pt-6 border-t border-base-content/5 flex items-center justify-between opacity-30">
                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em]">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {t('auth.footer.security')}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em]">
                                {t('auth.footer.version')}
                            </div>
                        </div>
                    </GlassCard>

                    <footer className="mt-12 flex items-center justify-center gap-8 opacity-20 hover:opacity-100 transition-all duration-700">
                        {['Documentation', 'Status', 'Privacy'].map(link => (
                            <a key={link} href="#" className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content hover:text-primary transition-colors">
                                {link}
                            </a>
                        ))}
                    </footer>
                </div>
            </div>

            {/* Toasts - Outside the center flow */}
            <div className="toast toast-end toast-bottom z-[1000] p-8 flex flex-col gap-3">
                {effects.slice(-3).map((eff) => (
                    <Toast
                        key={eff.id}
                        id={eff.id}
                        message={eff.message}
                        level={eff.level as ToastLevel}
                        onDismiss={dismissEffect}
                    />
                ))}
            </div>
        </div >
    );
};
