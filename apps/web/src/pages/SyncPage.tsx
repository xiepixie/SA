import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Globe,
    GitFork,
    RefreshCw,
    Search,
    Layers,
    AlertCircle,
    CheckCircle2,
    Clock,
    XCircle,
    ExternalLink,
    Inbox,
    AlertTriangle,
    X,
    Sparkles,
    Eye,
    Plus,
    Heart,
    Loader2
} from 'lucide-react';
import {
    usePublicQuestions,
    useMyForks,
    useSyncActivity,
    useForkQuestion,
    useSyncFork,
    useSyncAllForks,
    type PublicQuestion,
    type MyFork,
    type SyncActivity,
    type ForkSyncStatus
} from '../hooks/useSync';
import { useSupabaseAuth } from '../hooks/useSync';

// ============================================================
// Types
// ============================================================

type SyncTab = 'discover' | 'my_forks' | 'activity';
type ButtonSize = 'xs' | 'sm' | 'md';
type ButtonVariant = 'primary' | 'secondary' | 'warning' | 'ghost';

// ============================================================
// Unified Button Component
// ============================================================

interface ButtonProps {
    children: React.ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: React.ReactNode;
    iconRight?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
}

function Button({
    children,
    variant = 'secondary',
    size = 'sm',
    icon,
    iconRight,
    className = '',
    onClick,
    disabled,
    loading
}: ButtonProps) {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] whitespace-nowrap';

    const sizeStyles = {
        xs: 'h-8 px-2.5 text-xs gap-1',
        sm: 'h-9 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2'
    };

    const variantStyles = {
        primary: 'bg-info text-info-content hover:bg-info/90 shadow-md shadow-info/20 hover:shadow-info/30 focus-visible:ring-info/50',
        secondary: 'bg-base-200/60 text-base-content/70 hover:bg-base-200 hover:text-base-content border border-base-content/10 focus-visible:ring-base-content/20',
        warning: 'bg-warning text-warning-content hover:bg-warning/90 shadow-md shadow-warning/20 hover:shadow-warning/30 focus-visible:ring-warning/50',
        ghost: 'text-base-content/60 hover:text-base-content hover:bg-base-200/50 focus-visible:ring-base-content/20'
    };

    const isDisabled = disabled || loading;

    return (
        <button
            className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${isDisabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
            onClick={onClick}
            disabled={isDisabled}
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
            {children}
            {iconRight}
        </button>
    );
}

// ============================================================
// Activity Type Labels
// ============================================================

const ACTIVITY_TYPE_KEYS: Record<SyncActivity['type'], string> = {
    'fork_success': 'sync.activity.events.fork_success',
    'sync_success': 'sync.activity.events.sync_success',
    'sync_failed': 'sync.activity.events.sync_failed',
    'source_updated': 'sync.activity.events.source_updated'
};

const ACTIVITY_TYPE_FALLBACKS: Record<SyncActivity['type'], string> = {
    'fork_success': '已收藏',
    'sync_success': '已更新',
    'sync_failed': '更新失败',
    'source_updated': '原题有更新'
};

// ============================================================
// Main Component
// ============================================================

export const SyncPage: React.FC = () => {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    const [activeTab, setActiveTab] = useState<SyncTab>('discover');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'forked' | 'not_forked'>('all');

    // Auth state
    const { isAuthenticated, isLoading: authLoading } = useSupabaseAuth();

    // Data queries (only fetch when authenticated)
    const { data: publicQuestions, isLoading: loadingQuestions } = usePublicQuestions(
        { search: search || undefined },
        { enabled: isAuthenticated }
    );
    const { data: myForks, isLoading: loadingForks } = useMyForks({ enabled: isAuthenticated });
    const { data: activities, isLoading: loadingActivity } = useSyncActivity({ enabled: isAuthenticated });

    // Mutations
    const forkMutation = useForkQuestion();
    const syncMutation = useSyncFork();
    const syncAllMutation = useSyncAllForks();

    // Filtered questions
    const filteredQuestions = useMemo(() => {
        if (!publicQuestions) return [];
        let result = publicQuestions;

        if (filterStatus === 'forked') {
            result = result.filter((item: PublicQuestion) => item.my_fork_id !== null);
        } else if (filterStatus === 'not_forked') {
            result = result.filter((item: PublicQuestion) => item.my_fork_id === null);
        }

        return result;
    }, [publicQuestions, filterStatus]);

    // Stats
    const stats = useMemo(() => ({
        total: myForks?.length || 0,
        outdated: myForks?.filter((f: MyFork) => f.sync_status === 'outdated').length || 0
    }), [myForks]);

    // Outdated fork IDs for bulk sync
    const outdatedForkIds = useMemo(() =>
        myForks?.filter((f: MyFork) => f.sync_status === 'outdated').map((f: MyFork) => f.id) || [],
        [myForks]
    );

    // Filter labels
    const filterLabels = {
        all: t('sync.filter.forked.all', '全部'),
        forked: t('sync.filter.forked.forked', '已收藏'),
        not_forked: t('sync.filter.forked.not_forked', '未收藏')
    };

    // Handlers
    const handleFork = async (questionId: string) => {
        try {
            await forkMutation.mutateAsync(questionId);
        } catch (error) {
            console.error('Fork failed:', error);
        }
    };

    const handleSync = async (questionId: string) => {
        try {
            await syncMutation.mutateAsync(questionId);
        } catch (error) {
            console.error('Sync failed:', error);
        }
    };

    const handleSyncAll = async () => {
        if (outdatedForkIds.length === 0) return;
        try {
            await syncAllMutation.mutateAsync(outdatedForkIds);
        } catch (error) {
            console.error('Sync all failed:', error);
        }
    };

    // Show login required message if not authenticated
    if (!authLoading && !isAuthenticated) {
        return (
            <div className="min-h-full flex flex-col">
                {/* Hero Section */}
                <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
                    {/* Decorative Background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-info/5 rounded-full blur-3xl" />
                        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
                    </div>

                    {/* Main Content */}
                    <div className="relative z-10 max-w-2xl text-center space-y-8">
                        {/* Icon */}
                        <div className="relative inline-block">
                            <div className="absolute inset-0 bg-info/20 blur-2xl rounded-full scale-150" />
                            <div className="relative p-6 bg-gradient-to-br from-info/20 to-info/5 rounded-3xl border border-info/20 backdrop-blur-sm">
                                <Globe className="w-16 h-16 text-info" />
                            </div>
                        </div>

                        {/* Title & Description */}
                        <div className="space-y-4">
                            <h1 className="text-4xl md:text-5xl font-black text-base-content tracking-tight">
                                {t('sync.hero.title', '题库广场')}
                            </h1>
                            <p className="text-lg md:text-xl text-base-content/60 max-w-lg mx-auto leading-relaxed">
                                {t('sync.hero.desc', '浏览社区共享的高质量题目，一键加入你的题库并保持同步。')}
                            </p>
                        </div>

                        {/* Feature Highlights */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                            <div className="glass-card p-4 text-center group hover:border-info/30 transition-all">
                                <div className="p-3 bg-info/10 text-info rounded-xl w-fit mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <Search className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-base-content/80 text-sm">{t('sync.features.discover', '发现好题')}</h3>
                                <p className="text-xs text-base-content/50 mt-1">{t('sync.features.discover_desc', '浏览社区精选题目')}</p>
                            </div>
                            <div className="glass-card p-4 text-center group hover:border-success/30 transition-all">
                                <div className="p-3 bg-success/10 text-success rounded-xl w-fit mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <Heart className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-base-content/80 text-sm">{t('sync.features.save', '一键收藏')}</h3>
                                <p className="text-xs text-base-content/50 mt-1">{t('sync.features.save_desc', '快速添加到题库')}</p>
                            </div>
                            <div className="glass-card p-4 text-center group hover:border-warning/30 transition-all">
                                <div className="p-3 bg-warning/10 text-warning rounded-xl w-fit mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <RefreshCw className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-base-content/80 text-sm">{t('sync.features.sync', '自动同步')}</h3>
                                <p className="text-xs text-base-content/50 mt-1">{t('sync.features.sync_desc', '原题更新时提醒')}</p>
                            </div>
                        </div>

                        {/* Login CTA */}
                        <div className="glass-card p-6 md:p-8 space-y-4 border-warning/20 bg-warning/5">
                            <div className="flex items-center justify-center gap-2 text-warning">
                                <AlertTriangle className="w-5 h-5" />
                                <span className="font-semibold">{t('sync.auth.required_title', '需要登录')}</span>
                            </div>
                            <p className="text-sm text-base-content/60">
                                {t('sync.auth.required_desc', '请先登录后再使用题库广场功能')}
                            </p>
                            <Button
                                variant="primary"
                                size="md"
                                icon={<ExternalLink className="w-4 h-4" />}
                                className="px-8"
                            >
                                {t('sync.auth.login_btn', '去登录')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-5 reveal-smooth">

                {/* Compact Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-info/10 text-info rounded-xl">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-base-content">
                                {t('sync.hero.title', '题库广场')}
                            </h1>
                            <p className="text-xs text-base-content/50">
                                {t('sync.hero.desc', '浏览社区共享的高质量题目')}
                            </p>
                        </div>
                    </div>
                </header>

                {/* Tab Bar + Actions */}
                <nav className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
                    <div className="flex bg-base-200/50 p-1 rounded-xl">
                        {(['discover', 'my_forks', 'activity'] as const).map((tab) => {
                            const isActive = activeTab === tab;
                            const labels = {
                                discover: t('sync.tabs.discover', '发现'),
                                my_forks: t('sync.tabs.my_forks', '已收藏'),
                                activity: t('sync.tabs.activity', '动态')
                            };
                            const icons = { discover: Globe, my_forks: Heart, activity: Clock };
                            const Icon = icons[tab];

                            return (
                                <button
                                    key={tab}
                                    className={`
                                        flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium
                                        transition-all duration-200
                                        ${isActive
                                            ? 'bg-info text-info-content shadow-sm'
                                            : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'
                                        }
                                    `}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span>{labels[tab]}</span>
                                    {tab === 'my_forks' && stats.outdated > 0 && (
                                        <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-warning text-warning-content' : 'bg-warning/20 text-warning'}`}>
                                            {stats.outdated}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Actions */}
                    {activeTab === 'my_forks' && stats.outdated > 0 && (
                        <Button
                            variant="warning"
                            icon={<RefreshCw className="w-4 h-4" />}
                            onClick={handleSyncAll}
                            loading={syncAllMutation.isPending}
                        >
                            {t('sync.my_forks.actions.pull_all', '全部更新')} ({stats.outdated})
                        </Button>
                    )}
                </nav>

                {/* Search + Filters (Discover only) */}
                {activeTab === 'discover' && (
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30" />
                            <input
                                id="sync-search"
                                name="search"
                                type="text"
                                placeholder={t('sync.controls.search', '搜索题目…')}
                                className="input input-sm h-10 w-full pl-9 pr-9 bg-base-200/50 border-base-content/10 rounded-lg text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoComplete="off"
                            />
                            {search && (
                                <button
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-base-content/10"
                                    onClick={() => setSearch('')}
                                >
                                    <X className="w-4 h-4 text-base-content/40" />
                                </button>
                            )}
                        </div>
                        <div className="flex bg-base-200/50 p-1 rounded-lg">
                            {(['all', 'forked', 'not_forked'] as const).map((status) => (
                                <button
                                    key={status}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filterStatus === status
                                        ? 'bg-info text-info-content'
                                        : 'text-base-content/60 hover:text-base-content'
                                        }`}
                                    onClick={() => setFilterStatus(status)}
                                >
                                    {filterLabels[status]}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
                    <main className="space-y-3">
                        {activeTab === 'discover' && (
                            <DiscoverTab
                                questions={filteredQuestions}
                                isLoading={loadingQuestions}
                                onFork={handleFork}
                                forkingId={forkMutation.isPending ? forkMutation.variables : undefined}
                            />
                        )}
                        {activeTab === 'my_forks' && (
                            <MyForksTab
                                forks={myForks || []}
                                isLoading={loadingForks}
                                onSync={handleSync}
                                syncingId={syncMutation.isPending ? syncMutation.variables : undefined}
                            />
                        )}
                        {activeTab === 'activity' && (
                            <ActivityTab activities={activities || []} isLoading={loadingActivity} />
                        )}
                    </main>

                    {/* Sidebar */}
                    <aside className="space-y-4">
                        <SidebarStats total={stats.total} outdated={stats.outdated} />
                        <SidebarActivity activities={(activities || []).slice(0, 3)} />
                        <SidebarConfig />
                    </aside>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// Sidebar Components
// ============================================================

function SidebarStats({ total, outdated }: { total: number; outdated: number }) {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    return (
        <div className="glass-card p-4">
            <h3 className="text-xs font-bold text-base-content/40 uppercase tracking-wide mb-3">
                {t('sync.matrix.title', '同步状态')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-base-200/30">
                    <p className="text-xl font-bold text-base-content/90">{total}</p>
                    <p className="text-xs text-base-content/50">{t('sync.my_forks.title', '已收藏')}</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10">
                    <p className="text-xl font-bold text-warning">{outdated}</p>
                    <p className="text-xs text-warning/70">{t('sync.my_forks.status.outdated', '有更新')}</p>
                </div>
            </div>
        </div>
    );
}

function SidebarActivity({ activities }: { activities: SyncActivity[] }) {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    return (
        <div className="glass-card p-4">
            <h3 className="text-xs font-bold text-base-content/40 uppercase tracking-wide mb-3">
                {t('sync.activity.title', '最近动态')}
            </h3>
            {activities.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">{t('sync.activity.empty', '暂无动态')}</p>
            ) : (
                <div className="space-y-2">
                    {activities.map(activity => (
                        <div key={activity.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-base-200/30 transition-colors">
                            <ActivityIcon type={activity.type} size="sm" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-base-content/70 truncate">{activity.entity_name}</p>
                                <p className="text-[10px] text-base-content/40">{t(ACTIVITY_TYPE_KEYS[activity.type], ACTIVITY_TYPE_FALLBACKS[activity.type])}</p>
                            </div>
                            <span className="text-[10px] text-base-content/30 shrink-0">{formatRelativeTime(activity.timestamp)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SidebarConfig() {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    return (
        <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/60">{t('sync.matrix.protocol', '自动同步')}</span>
                <input id="sync-auto-protocol" name="auto_sync" type="checkbox" className="toggle toggle-info toggle-xs" defaultChecked autoComplete="off" />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/60">{t('sync.matrix.notifications', '更新提醒')}</span>
                <input id="sync-notif" name="sync_notifications" type="checkbox" className="toggle toggle-info toggle-xs" defaultChecked autoComplete="off" />
            </div>
            <Button variant="ghost" size="sm" className="w-full">
                {t('sync.matrix.btn_settings', '设置')}
            </Button>
        </div>
    );
}

// ============================================================
// Discover Tab
// ============================================================

interface DiscoverTabProps {
    questions: PublicQuestion[];
    isLoading: boolean;
    onFork: (id: string) => void;
    forkingId?: string;
}

function DiscoverTab({ questions, isLoading, onFork, forkingId }: DiscoverTabProps) {
    const { t } = useTranslation(['sync', 'auth', 'common']);

    if (isLoading) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 text-info animate-spin" />
                <p className="text-sm text-base-content/50">加载中...</p>
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 bg-base-300/50 rounded-xl">
                    <Inbox className="w-8 h-8 text-base-content/25" />
                </div>
                <div>
                    <h3 className="font-semibold text-base-content/60">{t('sync.discover.empty', '暂无题目')}</h3>
                    <p className="text-sm text-base-content/40">{t('sync.discover.empty_desc', '尝试调整筛选条件')}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <p className="text-xs font-medium text-base-content/40 px-1">
                {t('sync.feed.title', '社区题目')} ({questions.length})
            </p>
            <div className="space-y-2">
                {questions.map(q => (
                    <QuestionCard
                        key={q.id}
                        question={q}
                        onFork={onFork}
                        isForking={forkingId === q.id}
                    />
                ))}
            </div>
            <Button variant="ghost" className="w-full" icon={<Sparkles className="w-4 h-4" />}>
                {t('sync.feed.btn_load_more', '加载更多')}
            </Button>
        </>
    );
}

// ============================================================
// Question Card
// ============================================================

interface QuestionCardProps {
    question: PublicQuestion;
    onFork: (id: string) => void;
    isForking: boolean;
}

function QuestionCard({ question: q, onFork, isForking }: QuestionCardProps) {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    const isForked = q.my_fork_id !== null;

    return (
        <article className="glass-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-base-200/40 transition-all group">
            <div className="flex gap-3 items-start md:items-center flex-1 min-w-0">
                <div className="p-2.5 bg-base-300/50 text-base-content/40 rounded-lg group-hover:bg-info/10 group-hover:text-info transition-all shrink-0">
                    <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-base-content/90 truncate">{q.title}</h4>
                        {isForked && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/15 text-success text-xs font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                {t('sync.discover.already_forked', '已收藏')}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <span className="text-info">{q.subject_name || '未分类'}</span>
                        <span className="w-1 h-1 rounded-full bg-base-content/20" />
                        <span>{q.fork_count.toLocaleString()} {t('sync.feed.forks_count', '人收藏')}</span>
                    </div>
                    {q.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                            {q.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="px-1.5 py-0.5 bg-base-300/40 text-base-content/50 rounded text-xs">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* Fixed-width button container for alignment */}
            <div className="flex gap-2 shrink-0 items-center justify-end w-[180px]">
                <Button variant="ghost" size="xs" icon={<Eye className="w-3.5 h-3.5" />}>
                    {t('sync.feed.btn_details', '详情')}
                </Button>
                {isForked ? (
                    <Button variant="secondary" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />} className="min-w-[88px]">
                        {t('sync.discover.go_to_fork', '查看副本')}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        className="min-w-[88px]"
                        onClick={() => onFork(q.id)}
                        loading={isForking}
                    >
                        {t('sync.feed.btn_fork', '加入题库')}
                    </Button>
                )}
            </div>
        </article>
    );
}

// ============================================================
// My Forks Tab
// ============================================================

interface MyForksTabProps {
    forks: MyFork[];
    isLoading: boolean;
    onSync: (id: string) => void;
    syncingId?: string;
}

function MyForksTab({ forks, isLoading, onSync, syncingId }: MyForksTabProps) {
    const { t } = useTranslation(['sync', 'auth', 'common']);

    if (isLoading) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 text-info animate-spin" />
                <p className="text-sm text-base-content/50">加载中...</p>
            </div>
        );
    }

    if (forks.length === 0) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 bg-base-300/50 rounded-xl">
                    <Heart className="w-8 h-8 text-base-content/25" />
                </div>
                <div>
                    <h3 className="font-semibold text-base-content/60">{t('sync.my_forks.empty', '还没有收藏')}</h3>
                    <p className="text-sm text-base-content/40">{t('sync.my_forks.empty_cta', '去发现好题')}</p>
                </div>
                <Button variant="primary" icon={<Globe className="w-4 h-4" />}>
                    {t('sync.tabs.discover', '发现')}
                </Button>
            </div>
        );
    }

    return (
        <>
            <p className="text-xs font-medium text-base-content/40 px-1">
                {t('sync.my_forks.title', '已收藏')} ({forks.length})
            </p>
            <div className="space-y-2">
                {forks.map(fork => (
                    <ForkCard
                        key={fork.id}
                        fork={fork}
                        onSync={onSync}
                        isSyncing={syncingId === fork.id}
                    />
                ))}
            </div>
        </>
    );
}

// ============================================================
// Fork Card
// ============================================================

interface ForkCardProps {
    fork: MyFork;
    onSync: (id: string) => void;
    isSyncing: boolean;
}

function ForkCard({ fork, onSync, isSyncing }: ForkCardProps) {
    const { t } = useTranslation(['sync', 'auth', 'common']);

    return (
        <article className="glass-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-base-200/40 transition-all group">
            <div className="flex gap-3 items-start md:items-center flex-1 min-w-0">
                <SyncStatusIcon status={fork.sync_status} />
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-base-content/90 truncate">{fork.title}</h4>
                        <ForkStatusBadge status={fork.sync_status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <span className="text-info">{fork.subject_name || '未分类'}</span>
                        <span className="w-1 h-1 rounded-full bg-base-content/20" />
                        <span>{t('sync.my_forks.last_synced', '同步于')} {formatRelativeTime(fork.updated_at)}</span>
                    </div>
                    {fork.sync_status === 'outdated' && (
                        <div className="flex gap-1 flex-wrap">
                            {fork.diff_summary.content_changed && <DiffChip label={t('sync.my_forks.diff.content_changed', '内容')} />}
                            {fork.diff_summary.answer_changed && <DiffChip label={t('sync.my_forks.diff.answer_changed', '答案')} />}
                            {fork.diff_summary.title_changed && <DiffChip label={t('sync.my_forks.diff.title_changed', '标题')} />}
                        </div>
                    )}
                </div>
            </div>
            {/* Fixed-width button container for alignment */}
            <div className="flex gap-2 shrink-0 items-center justify-end w-[160px]">
                {fork.sync_status === 'outdated' && (
                    <>
                        <Button variant="ghost" size="xs" icon={<Eye className="w-3.5 h-3.5" />}>
                            {t('sync.my_forks.actions.view_diff', '查看变更')}
                        </Button>
                        <Button
                            variant="warning"
                            size="xs"
                            icon={<RefreshCw className="w-3.5 h-3.5" />}
                            onClick={() => onSync(fork.id)}
                            loading={isSyncing}
                        >
                            {t('sync.my_forks.actions.pull', '更新')}
                        </Button>
                    </>
                )}
                {fork.sync_status === 'up_to_date' && (
                    <Button variant="ghost" size="xs" icon={<Eye className="w-3.5 h-3.5" />}>
                        {t('sync.feed.btn_details', '详情')}
                    </Button>
                )}
                {fork.sync_status === 'source_deleted' && (
                    <span className="text-xs text-error/60 font-medium">
                        {t('sync.my_forks.source_deleted_hint', '原题已删除')}
                    </span>
                )}
            </div>
        </article>
    );
}

function DiffChip({ label }: { label: string }) {
    return <span className="px-1.5 py-0.5 bg-warning/15 text-warning rounded text-xs font-medium">{label}</span>;
}

// ============================================================
// Activity Tab
// ============================================================

interface ActivityTabProps {
    activities: SyncActivity[];
    isLoading: boolean;
}

function ActivityTab({ activities, isLoading }: ActivityTabProps) {
    const { t } = useTranslation(['sync', 'auth', 'common']);

    if (isLoading) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 text-info animate-spin" />
                <p className="text-sm text-base-content/50">加载中...</p>
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className="glass-card p-10 flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 bg-base-300/50 rounded-xl">
                    <Clock className="w-8 h-8 text-base-content/25" />
                </div>
                <h3 className="font-semibold text-base-content/60">{t('sync.activity.empty', '暂无动态')}</h3>
            </div>
        );
    }

    return (
        <>
            <p className="text-xs font-medium text-base-content/40 px-1">
                {t('sync.tabs.activity', '动态')} ({activities.length})
            </p>
            <div className="space-y-2">
                {activities.map(activity => (
                    <article key={activity.id} className="glass-card p-4 flex items-center justify-between gap-3 hover:bg-base-200/40 transition-all">
                        <div className="flex items-center gap-3">
                            <ActivityIcon type={activity.type} />
                            <div>
                                <p className="text-sm font-medium text-base-content/80">{activity.entity_name}</p>
                                <p className="text-xs text-base-content/50">{t(ACTIVITY_TYPE_KEYS[activity.type], ACTIVITY_TYPE_FALLBACKS[activity.type])}</p>
                            </div>
                        </div>
                        <span className="text-xs text-base-content/40">{formatRelativeTime(activity.timestamp)}</span>
                    </article>
                ))}
            </div>
        </>
    );
}

// ============================================================
// Helper Components
// ============================================================

function SyncStatusIcon({ status }: { status: ForkSyncStatus }) {
    const styles: Record<ForkSyncStatus, string> = {
        up_to_date: 'bg-success/10 text-success',
        outdated: 'bg-warning/10 text-warning',
        source_deleted: 'bg-error/10 text-error'
    };
    const icons: Record<ForkSyncStatus, typeof CheckCircle2> = { up_to_date: CheckCircle2, outdated: AlertTriangle, source_deleted: XCircle };
    const Icon = icons[status];

    return (
        <div className={`p-2.5 rounded-lg shrink-0 ${styles[status]}`}>
            <Icon className="w-5 h-5" />
        </div>
    );
}

function ForkStatusBadge({ status }: { status: ForkSyncStatus }) {
    const { t } = useTranslation(['sync', 'auth', 'common']);
    const config: Record<ForkSyncStatus, { bg: string; text: string; icon: typeof CheckCircle2; label: string; pulse?: boolean }> = {
        up_to_date: { bg: 'bg-success/15', text: 'text-success', icon: CheckCircle2, label: t('sync.my_forks.status.up_to_date', '最新') },
        outdated: { bg: 'bg-warning/15', text: 'text-warning', icon: AlertCircle, label: t('sync.my_forks.status.outdated', '有更新'), pulse: true },
        source_deleted: { bg: 'bg-error/15', text: 'text-error', icon: XCircle, label: t('sync.my_forks.status.source_deleted', '已删除') }
    };
    const c = config[status];
    const Icon = c.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text} ${'pulse' in c && c.pulse ? 'animate-pulse' : ''}`}>
            <Icon className="w-3 h-3" />
            {c.label}
        </span>
    );
}

function ActivityIcon({ type, size = 'md' }: { type: SyncActivity['type']; size?: 'sm' | 'md' }) {
    const styles: Record<SyncActivity['type'], string> = {
        fork_success: 'bg-info/10 text-info',
        sync_success: 'bg-success/10 text-success',
        sync_failed: 'bg-error/10 text-error',
        source_updated: 'bg-warning/10 text-warning'
    };
    const icons: Record<SyncActivity['type'], typeof GitFork> = { fork_success: GitFork, sync_success: CheckCircle2, sync_failed: XCircle, source_updated: AlertCircle };
    const Icon = icons[type];
    const sizeClass = size === 'sm' ? 'p-1.5 w-7 h-7' : 'p-2 w-9 h-9';

    return (
        <div className={`rounded-lg ${styles[type]} ${sizeClass} flex items-center justify-center shrink-0`}>
            <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </div>
    );
}

// ============================================================
// Utility
// ============================================================

function formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
}
