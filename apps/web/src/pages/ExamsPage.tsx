import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../app/utils/cn';
import {
    ClipboardList,
    FilePlus,
    Clock,
    Trophy,
    Search,
    BookOpen,
    Filter,
    ChevronRight,
    ChevronLeft,
    Play,
    Target,
    BarChart3,
    CheckCircle2,
    XCircle,
    SlidersHorizontal,
    Shuffle,
    Hash,
    Layers,
    TrendingUp,
    AlertCircle,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    X,
    Sparkles,
    History,
    FileText,
    Check,
    RefreshCw,
    Timer,
    Flame,
    TrendingDown,
    Archive,
    Heart
} from 'lucide-react';

// ============================================
// Types & Interfaces (Aligned with DB Schema V5.9)
// ============================================

// DB ENUMs (exact match with schema_full.sql)
type ExamMode = 'exam' | 'practice';                           // exam_mode_enum
type ExamStatus = 'in_progress' | 'completed' | 'abandoned';   // exam_status_enum
type AnswerMode = 'online' | 'paper';                          // answer_mode_enum
type Difficulty = 'easy' | 'medium' | 'hard';                  // difficulty_enum
type QuestionType = 'choice' | 'fill_blank' | 'short_answer';  // question_type_enum

// Frontend-only types (not in DB)
type SamplingStrategy = 'random' | 'weakness' | 'due_first' | 'new_first';
type TagLogic = 'OR' | 'AND';
type ViewMode = 'dashboard' | 'create' | 'history';

// DB Table: subjects
interface Subject {
    id: string;                    // UUID
    name: string;
    color: string | null;
    user_id?: string | null;       // UUID, NULL = public
    deleted_at?: string | null;    // soft delete
    created_at?: string;
    updated_at?: string;
    // Computed (not in DB)
    question_count?: number;
}

// DB Table: tags
interface Tag {
    id: string;                    // UUID
    name: string;
    color: string | null;
    user_id?: string | null;       // UUID, NULL = public
    deleted_at?: string | null;    // soft delete
    created_at?: string;
    updated_at?: string;
    // Computed (not in DB)
    question_count?: number;
}

// DB Table: exam_records (exact match)
interface ExamRecord {
    id: string;                    // UUID
    user_id: string;               // UUID NOT NULL
    subject_id: string | null;     // UUID
    title: string;
    mode: ExamMode;
    question_count: number;
    config: ExamRecordConfig;      // JSONB
    answers: Record<string, ExamAnswer>;  // JSONB { question_id: answer }
    results: Record<string, ExamResult>;  // JSONB { question_id: result }
    question_ids: string[];        // UUID[]
    duration_seconds: number | null;
    score: number | null;          // DOUBLE PRECISION
    status: ExamStatus;
    start_time: string;            // TIMESTAMPTZ
    end_time: string | null;
    template_id: string | null;
    answer_mode: AnswerMode | null;
    created_at: string;
    updated_at: string;
    // Joined fields (not in DB directly)
    subject_name?: string;
    tag_names?: string[];          // For UI display
    correct_count?: number;        // Computed from results
    is_favorite?: boolean;         // Future feature
}

// JSONB structure for exam_records.config
interface ExamRecordConfig {
    filters?: {
        tagIds?: string[];
        priority?: SamplingStrategy;
        difficulty?: Difficulty[];
        mastery_range?: [number, number];
    };
    settings?: {
        timeLimit?: number;        // minutes
        shuffle?: boolean;
    };
}

// JSONB structure for exam_records.answers[question_id]
interface ExamAnswer {
    choice?: string;               // For choice questions
    choice_ids?: string[];         // For multi-choice
    blanks?: string[];             // For fill_blank
    text?: string;                 // For short_answer
    imageUrls?: string[];
}

// JSONB structure for exam_records.results[question_id]
interface ExamResult {
    score: number;
    isCorrect: boolean;
    aiReason?: string;
}

// Frontend Wizard Config (superset of ExamRecordConfig for UI)
interface ExamConfig {
    title: string;
    // Source Filters (maps to config.filters)
    subject_ids: string[];
    tag_ids: string[];
    tag_logic: TagLogic;
    difficulty: Difficulty[];
    question_types: QuestionType[];
    mastery_range: [number, number];
    // Sampling (maps to config.filters.priority + question_count)
    question_count: number;
    strategy: SamplingStrategy;
    include_archived: boolean;
    shuffle: boolean;
    // Session Settings (maps to config.settings + mode)
    mode: ExamMode;
    answer_mode: AnswerMode;
    time_limit_minutes: number | null;
}


interface ExamFilters {
    search: string;
    statuses: ExamStatus[];
    modes: ExamMode[];
    subject_id: string | null;
    date_range: 'all' | 'today' | 'week' | 'month';
    score_range: 'all' | 'excellent' | 'good' | 'pass' | 'fail';
    sort_by: 'date' | 'score' | 'duration' | 'questions';
    sort_order: 'asc' | 'desc';
}

interface QuickStartTemplate {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    config: Partial<ExamConfig>;
    color: string;
}

interface UserStats {
    total_exams: number;
    completed_exams: number;
    average_score: number;
    total_time_minutes: number;
    streak_days: number;
    weak_subjects: string[];
    improvement_rate: number;
}

// ============================================
// Constants & Defaults
// ============================================

const DEFAULT_FILTERS: ExamFilters = {
    search: '',
    statuses: [],
    modes: [],
    subject_id: null,
    date_range: 'all',
    score_range: 'all',
    sort_by: 'date',
    sort_order: 'desc'
};

const DEFAULT_CONFIG: ExamConfig = {
    title: '',
    subject_ids: [],
    tag_ids: [],
    tag_logic: 'OR',
    difficulty: ['easy', 'medium', 'hard'],
    question_types: ['choice', 'fill_blank', 'short_answer'],
    mastery_range: [0, 100],
    question_count: 20,
    strategy: 'weakness',
    include_archived: false,
    shuffle: true,
    mode: 'practice',
    answer_mode: 'online',
    time_limit_minutes: null
};

const getQuickStartTemplates = (t: any): QuickStartTemplate[] => [
    {
        id: 'weakness',
        name: t('exams.strategies.weakness.title'),
        description: t('exams.strategies.weakness.desc'),
        icon: Target,
        config: { strategy: 'weakness', question_count: 15, mastery_range: [0, 50] },
        color: 'from-rose-500 to-orange-500'
    },
    {
        id: 'review',
        name: t('exams.strategies.due_first.title'),
        description: t('exams.strategies.due_first.desc'),
        icon: RefreshCw,
        config: { strategy: 'due_first', question_count: 20 },
        color: 'from-blue-500 to-cyan-500'
    },
    {
        id: 'challenge',
        name: t('exams.modes.eval.title'),
        description: t('exams.modes.eval.desc'),
        icon: Flame,
        config: { mode: 'exam', time_limit_minutes: 30, question_count: 25, difficulty: ['medium', 'hard'] },
        color: 'from-purple-500 to-pink-500'
    },
    {
        id: 'random',
        name: t('exams.strategies.random.title'),
        description: t('exams.strategies.random.desc'),
        icon: Shuffle,
        config: { strategy: 'random', question_count: 20 },
        color: 'from-emerald-500 to-teal-500'
    }
];

// ============================================
// Mock Data (Replace with real hooks)
// ============================================

const MOCK_SUBJECTS: Subject[] = [
    { id: '1', name: '数学', color: '#4caf50', question_count: 156 },
    { id: '2', name: '英语', color: '#3f51b5', question_count: 89 },
    { id: '3', name: '语文', color: '#f44336', question_count: 67 },
    { id: '4', name: '物理', color: '#ff9800', question_count: 124 },
    { id: '5', name: '化学', color: '#9c27b0', question_count: 78 },
    { id: '6', name: '生物', color: '#00bcd4', question_count: 45 },
    { id: '7', name: '历史', color: '#795548', question_count: 34 },
    { id: '8', name: '地理', color: '#607d8b', question_count: 28 },
];

const MOCK_TAGS: Tag[] = [
    { id: '1', name: '重要', color: '#ff9800', question_count: 89 },
    { id: '2', name: '易错', color: '#e91e63', question_count: 156 },
    { id: '3', name: '基础', color: '#2196f3', question_count: 234 },
    { id: '4', name: '高频考点', color: '#f44336', question_count: 67 },
    { id: '5', name: '公式', color: '#9c27b0', question_count: 45 },
    { id: '6', name: '概念', color: '#00bcd4', question_count: 78 },
];

// Mock data with full ExamRecord structure (matching DB schema)
const MOCK_EXAMS: ExamRecord[] = [
    {
        id: '1',
        user_id: 'mock-user-id',
        title: '数学期中模拟 - 三角函数专项',
        mode: 'exam',
        status: 'completed',
        subject_id: '1',
        question_count: 20,
        config: { filters: { priority: 'weakness' }, settings: { timeLimit: 30 } },
        answers: {},
        results: {},
        question_ids: [],
        score: 85,
        duration_seconds: 860,
        start_time: '2024-12-20T10:00:00Z',
        end_time: '2024-12-20T10:14:20Z',
        template_id: null,
        answer_mode: 'online',
        created_at: '2024-12-20T10:00:00Z',
        updated_at: '2024-12-20T10:14:20Z',
        // Computed/Joined
        subject_name: '数学',
        correct_count: 17,
        is_favorite: true
    },
    {
        id: '2',
        user_id: 'mock-user-id',
        title: '英语阅读理解练习',
        mode: 'practice',
        status: 'completed',
        subject_id: '2',
        question_count: 10,
        config: {},
        answers: {},
        results: {},
        question_ids: [],
        score: 92,
        duration_seconds: 525,
        start_time: '2024-12-18T14:30:00Z',
        end_time: '2024-12-18T14:38:45Z',
        template_id: null,
        answer_mode: 'online',
        created_at: '2024-12-18T14:30:00Z',
        updated_at: '2024-12-18T14:38:45Z',
        subject_name: '英语',
        correct_count: 9
    },
    {
        id: '3',
        user_id: 'mock-user-id',
        title: '物理力学综合测试',
        mode: 'exam',
        status: 'in_progress',
        subject_id: '4',
        question_count: 15,
        config: { settings: { timeLimit: 45 } },
        answers: {},
        results: {},
        question_ids: [],
        score: null,
        duration_seconds: 420,
        start_time: '2024-12-23T09:00:00Z',
        end_time: null,
        template_id: null,
        answer_mode: 'online',
        created_at: '2024-12-23T09:00:00Z',
        updated_at: '2024-12-23T09:07:00Z',
        subject_name: '物理',
        correct_count: 8
    },
    {
        id: '4',
        user_id: 'mock-user-id',
        title: '语文古诗词默写',
        mode: 'practice',
        status: 'abandoned',
        subject_id: '3',
        question_count: 25,
        config: {},
        answers: {},
        results: {},
        question_ids: [],
        score: 45,
        duration_seconds: 300,
        start_time: '2024-12-15T16:00:00Z',
        end_time: '2024-12-15T16:05:00Z',
        template_id: null,
        answer_mode: 'online',
        created_at: '2024-12-15T16:00:00Z',
        updated_at: '2024-12-15T16:05:00Z',
        subject_name: '语文',
        correct_count: 11
    },
    {
        id: '5',
        user_id: 'mock-user-id',
        title: '化学方程式专练',
        mode: 'practice',
        status: 'completed',
        subject_id: '5',
        question_count: 30,
        config: {},
        answers: {},
        results: {},
        question_ids: [],
        score: 78,
        duration_seconds: 1200,
        start_time: '2024-12-10T08:00:00Z',
        end_time: '2024-12-10T08:20:00Z',
        template_id: null,
        answer_mode: 'online',
        created_at: '2024-12-10T08:00:00Z',
        updated_at: '2024-12-10T08:20:00Z',
        subject_name: '化学',
        correct_count: 23
    },
];

const MOCK_USER_STATS: UserStats = {
    total_exams: 47,
    completed_exams: 42,
    average_score: 81,
    total_time_minutes: 1240,
    streak_days: 7,
    weak_subjects: ['Physics', 'Chemistry'],
    improvement_rate: 12
};

const getGrade = (score: number | null) => {
    if (score === null) return { letter: '-', color: 'text-base-content/40' };
    if (score >= 95) return { letter: 'S', color: 'text-success' };
    if (score >= 85) return { letter: 'A', color: 'text-info' };
    if (score >= 75) return { letter: 'B', color: 'text-warning' };
    if (score >= 60) return { letter: 'C', color: 'text-orange-500' };
    return { letter: 'D', color: 'text-error' };
};

// ============================================
// Utility Functions
// ============================================

const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatDurationLong = (minutes: number, t: any): string => {
    if (minutes < 60) return t('exams.live_stats.time_value', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    // For now using simple strings for hours/mins as I didn't add the complex plurals yet, 
    // but I can use common.time if needed.
    // Let's just use what's available or add to common.
    return mins > 0
        ? `${hours}h ${mins}m`
        : `${hours}h`;
};

const formatDate = (dateStr: string, t: any, lang: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('common.time.just_now');
    if (diffMins < 60) return t('common.time.mins_ago', { count: diffMins });
    if (diffHours < 24) return t('common.time.hours_ago', { count: diffHours });
    if (diffDays === 1) return t('common.time.yesterday');
    if (diffDays < 7) return t('common.time.days_ago', { count: diffDays });
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
};



const getStatusConfig = (status: ExamStatus, t: any) => {
    const configs = {
        in_progress: { icon: Play, label: t('common.status.in_progress'), color: 'text-info', bg: 'bg-info/10', border: 'border-info/20', pulse: true },
        completed: { icon: CheckCircle2, label: t('common.status.completed'), color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', pulse: false },
        abandoned: { icon: XCircle, label: t('common.status.abandoned'), color: 'text-base-content/40', bg: 'bg-base-content/5', border: 'border-base-content/10', pulse: false }
    };
    return configs[status];
};

const getModeConfig = (mode: ExamMode, t: any) => {
    const configs = {
        exam: { icon: ClipboardList, label: t('exams.modes.eval.title'), color: 'text-primary', bg: 'bg-primary/10', desc: t('exams.modes.eval.desc') },
        practice: { icon: BookOpen, label: t('exams.modes.drill.title'), color: 'text-secondary', bg: 'bg-secondary/10', desc: t('exams.modes.drill.desc') }
    };
    return configs[mode];
};

const generateExamTitle = (subjects: Subject[], config: ExamConfig, t: any, lang: string): string => {
    const date = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' });
    if (config.subject_ids.length === 1) {
        const subject = subjects.find(s => s.id === config.subject_ids[0]);
        const subjectName = subject?.name || t('exams.generate_title.general');
        return `${subjectName} ${t('exams.generate_title.practice')} ${date}`;
    }
    if (config.subject_ids.length > 1 && config.subject_ids.length <= 3) {
        const names = config.subject_ids.map(id => subjects.find(s => s.id === id)?.name).filter(Boolean).join('+');
        return `${names} ${date}`;
    }
    return `${t('exams.generate_title.comprehensive')} ${date}`;
};


// ============================================
// Sub-Components: Atomic UI Elements
// ============================================

const FilterChip: React.FC<{
    label: string;
    active: boolean;
    onClick: () => void;
    icon?: React.ElementType;
    count?: number;
}> = ({ label, active, onClick, icon: Icon, count }) => (
    <button
        onClick={onClick}
        className={`chip se-interactive inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide
            ${active
                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                : ''}`}
    >
        {Icon && <Icon size={12} />}
        {label}
        {count !== undefined && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[8px] ${active ? 'bg-white/20' : 'bg-[var(--chip-bg)]'}`}>
                {count}
            </span>
        )}
    </button>
);

const StatCard: React.FC<{
    label: string;
    value: string | number;
    icon: React.ElementType;
    trend?: { value: number; positive: boolean };
    color?: string;
    subtitle?: string;
    tooltip?: string;
    onClick?: () => void;
}> = ({ label, value, icon: Icon, trend, color = 'text-primary', subtitle, tooltip, onClick }) => {
    // Map color to bg variant
    const bgColor = color.replace('text-', 'bg-') + '/10';

    return (
        <div
            onClick={onClick}
            className={`glass-card-premium p-6 border-none flex flex-col gap-4 group transition-all duration-500 bg-base-content/[0.03] hover:bg-base-content/[0.06] ${onClick ? 'cursor-pointer se-interactive' : ''}`}
        >
            <div className="flex justify-between items-start">
                <div className={`p-3 rounded-2xl transition-all duration-500 ${bgColor} ${color} group-hover:scale-110 group-hover:rotate-3`}>
                    <Icon className="w-6 h-6" />
                </div>
                {trend && (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${trend.positive ? 'bg-success/10' : 'bg-error/10'}`}>
                        {trend.positive ? (
                            <TrendingUp size={12} className="text-success" />
                        ) : (
                            <TrendingDown size={12} className="text-error" />
                        )}
                        <span className={`text-[10px] font-black ${trend.positive ? 'text-success' : 'text-error'}`}>
                            {trend.positive ? '+' : ''}{trend.value}%
                        </span>
                    </div>
                )}
            </div>

            <div className="space-y-1 mt-auto">
                {tooltip ? (
                    <Tooltip content={tooltip}>
                        <p className="text-[11px] font-black text-base-content/30 uppercase tracking-widest cursor-help flex items-center gap-1">
                            {label}
                            <AlertCircle size={10} className="opacity-40" />
                        </p>
                    </Tooltip>
                ) : (
                    <p className="text-[11px] font-black text-base-content/30 uppercase tracking-widest">{label}</p>
                )}
                <h4 className={`text-4xl font-black tracking-tighter se-mono leading-none ${color}`}>
                    {value}
                </h4>
                {subtitle && (
                    <p className="text-xs font-bold text-base-content/40 truncate pt-2 mt-2 border-t border-base-content/5">
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    );
};

const Tooltip: React.FC<{
    content: string;
    children: React.ReactNode;
}> = ({ content, children }) => (
    <div className="relative group/tooltip">
        {children}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-base-content text-base-100 text-[10px] font-medium rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-base-content" />
        </div>
    </div>
);

const EmptyState: React.FC<{
    icon: React.ElementType;
    title: string;
    description: string;
    action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
    <div className="glass-card bg-base-content/[0.01] border-dashed border-base-content/10 rounded-[2.5rem] py-20 flex flex-col items-center gap-4 text-center">
        <div className="p-6 rounded-3xl bg-base-content/5 text-base-content/10">
            <Icon size={48} strokeWidth={1} />
        </div>
        <div className="space-y-1">
            <p className="text-sm font-black text-base-content/40 uppercase tracking-[0.2em]">{title}</p>
            <p className="text-[10px] font-bold text-base-content/20 italic">{description}</p>
        </div>
        {action && <div className="mt-4">{action}</div>}
    </div>
);

// ============================================
// In-Progress Exam Banner (High Priority UX)
// ============================================

const InProgressBanner: React.FC<{
    exam: ExamRecord;
    onContinue: () => void;
    onAbandon: () => void;
}> = ({ exam, onContinue, onAbandon }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const [showConfirm, setShowConfirm] = useState(false);
    const progress = exam.correct_count ? Math.round((exam.correct_count / exam.question_count) * 100) : 0;
    const timeLimitMins = (exam.config as any)?.settings?.timeLimit;
    const timeLimitSecs = timeLimitMins ? timeLimitMins * 60 : null;
    const isLowTime = timeLimitSecs && (timeLimitSecs - (exam.duration_seconds || 0)) < 300; // < 5 mins

    return (
        <div className="glass-card overflow-hidden border-info/30 bg-gradient-to-r from-info/5 via-transparent to-primary/5 animate-in slide-in-from-top-4 duration-500">
            {/* Progress bar at top */}
            <div className="h-1 bg-base-content/5">
                <div className="h-full bg-info transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>

            <div className="p-5">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Left: Info */}
                    <div className="flex items-start gap-4 flex-1">
                        <div className="relative">
                            <div className="p-3 rounded-2xl bg-info/10 text-info">
                                <Play className="w-6 h-6" />
                            </div>
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-info rounded-full animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-info/10 text-info text-[10px] font-black uppercase rounded-md">
                                    {t('common.status.in_progress')}
                                </span>
                                <span className="text-[10px] se-muted">{formatDate(exam.start_time, t, lang)}</span>
                            </div>
                            <h3 className="text-base font-black text-base-content/90 truncate mb-1">{exam.title}</h3>
                            <div className="flex items-center gap-4 text-xs se-muted">
                                <span className="flex items-center gap-1">
                                    <FileText size={12} />
                                    {exam.correct_count || 0}/{exam.question_count} {t('exams.wizard.step3.unit')}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {timeLimitSecs ? (
                                        <span className={isLowTime ? 'text-error animate-pulse font-bold' : ''}>
                                            {t('exams.banner.remaining', { time: formatDuration(Math.max(0, timeLimitSecs - (exam.duration_seconds || 0))) })}
                                        </span>
                                    ) : (
                                        t('exams.list.elapsed', { time: formatDuration(exam.duration_seconds) })
                                    )}
                                </span>
                                {exam.subject_name && (
                                    <span className="px-2 py-0.5 bg-base-content/5 rounded text-[10px]">
                                        {exam.subject_name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-3">
                        {showConfirm ? (
                            <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                <span className="text-xs se-muted">{t('exams.banner.confirm_abandon')}</span>
                                <button
                                    onClick={() => { onAbandon(); setShowConfirm(false); }}
                                    className="btn btn-error btn-sm rounded-xl text-[10px] font-black se-interactive"
                                >
                                    {t('exams.banner.confirm')}
                                </button>
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="btn btn-ghost btn-sm rounded-xl text-[10px] font-black se-interactive"
                                >
                                    {t('exams.banner.cancel')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowConfirm(true)}
                                    className="btn btn-ghost btn-sm rounded-xl se-dim hover:text-error text-[10px] font-black uppercase se-interactive"
                                >
                                    {t('exams.banner.abandon')}
                                </button>
                                <button
                                    onClick={onContinue}
                                    className="btn btn-info rounded-xl gap-2 shadow-lg shadow-info/30 hover:shadow-xl hover:shadow-info/40 transition-all text-sm font-black se-interactive"
                                >
                                    <Play className="w-4 h-4" />
                                    {t('exams.list.btn_continue')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================
// Quick Start Cards
// ============================================

// Compact version for sidebar panel
const CompactQuickStartCard: React.FC<{
    template: QuickStartTemplate;
    onClick: () => void;
    disabled?: boolean;
}> = ({ template, onClick, disabled }) => {
    const Icon = template.icon;

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="group relative p-3 text-left rounded-xl bg-base-content/[0.03] hover:bg-base-content/[0.08] border border-transparent hover:border-base-content/5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${template.color} text-white shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] font-bold text-base-content/80 truncate leading-tight">{template.name}</h4>
                    <p className="text-[9px] se-dim truncate">{template.description}</p>
                </div>
            </div>
        </button>
    );
};

// ============================================
// Wizard Step Components (Enhanced UX)
// ============================================

const WizardProgress: React.FC<{
    currentStep: number;
    totalSteps: number;
    onStepClick?: (step: number) => void;
}> = ({ currentStep, totalSteps, onStepClick }) => {
    const { t } = useTranslation();
    const steps = [
        { label: t('exams.wizard.step1.title'), icon: BookOpen },
        { label: t('exams.wizard.step2.title'), icon: Filter },
        { label: t('exams.wizard.step3.title'), icon: Target },
        { label: t('exams.wizard.step4.title'), icon: Play }
    ];

    return (
        <div className="px-8 py-7 bg-base-content/[0.02] border-b border-base-content/5 relative overflow-hidden">
            {/* Background subtle gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 opacity-50" />

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="space-y-1">
                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.25em]">
                        {t('exams.create.step_info', { current: currentStep, total: totalSteps })}
                    </span>
                    <h2 className="text-xl font-black tracking-tight">{steps[currentStep - 1].label}</h2>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-black text-base-content/20 tabular-nums">
                        {Math.round((currentStep / totalSteps) * 100)}%
                    </span>
                    <p className="text-[9px] font-black text-base-content/30 uppercase tracking-widest">{t('common.status.completed')}</p>
                </div>
            </div>

            <div className="flex items-center justify-between relative z-10">
                {steps.map((step, i) => {
                    const isCompleted = currentStep > i + 1;
                    const isCurrent = currentStep === i + 1;
                    const Icon = step.icon;

                    return (
                        <React.Fragment key={step.label}>
                            <button
                                onClick={() => onStepClick && isCompleted && onStepClick(i + 1)}
                                disabled={!isCompleted && !isCurrent}
                                className={cn(
                                    "flex flex-col items-center gap-2.5 transition-all duration-500",
                                    isCompleted || isCurrent ? "cursor-pointer" : "cursor-default opacity-40"
                                )}
                            >
                                <div className={cn(
                                    "relative p-3 rounded-2xl transition-all duration-500 ring-offset-base-100 ring-offset-2",
                                    isCurrent ? "bg-primary text-white shadow-xl shadow-primary/30 scale-110 ring-2 ring-primary" :
                                        isCompleted ? "bg-success/10 text-success border border-success/20" : "bg-base-content/5 text-base-content/20 border border-transparent"
                                )}>
                                    {isCompleted ? <Check size={18} strokeWidth={3} /> : <Icon size={18} strokeWidth={isCurrent ? 2.5 : 2} />}
                                    {isCurrent && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-ping" />
                                    )}
                                </div>
                            </button>
                            {i < steps.length - 1 && (
                                <div className="flex-1 px-4">
                                    <div className="h-[3px] w-full rounded-full bg-base-content/5 overflow-hidden">
                                        <div className={cn(
                                            "h-full transition-all duration-1000 ease-out",
                                            currentStep > i + 1 ? "bg-success w-full" : isCurrent ? "bg-primary w-1/2" : "bg-transparent w-0"
                                        )} />
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

// Step 1: Subject Selection
const WizardStep1: React.FC<{
    config: ExamConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExamConfig>>;
    subjects: Subject[];
}> = ({ config, setConfig, subjects }) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);

    const filteredSubjects = useMemo(() =>
        subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase())),
        [subjects, search]
    );

    const visibleSubjects = showAll ? filteredSubjects : filteredSubjects.slice(0, 8);
    const totalQuestions = useMemo(() =>
        config.subject_ids.reduce((sum, id) => {
            const subject = subjects.find(s => s.id === id);
            return sum + (subject?.question_count || 0);
        }, 0),
        [config.subject_ids, subjects]
    );

    const toggleSubject = (id: string) => {
        setConfig(prev => ({
            ...prev,
            subject_ids: prev.subject_ids.includes(id)
                ? prev.subject_ids.filter(x => x !== id)
                : [...prev.subject_ids, id]
        }));
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-base-content/90">{t('exams.wizard.step1.title')}</h3>
                    <p className="text-xs text-base-content/40 mt-1">{t('exams.wizard.step1.desc')}</p>
                </div>
                {config.subject_ids.length > 0 && (
                    <div className="text-right animate-in zoom-in duration-300">
                        <p className="text-3xl font-black text-primary leading-none tabular-nums">{totalQuestions}</p>
                        <p className="text-[9px] font-black text-base-content/30 uppercase tracking-widest mt-1">{t('exams.wizard.step1.available')}</p>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30 group-focus-within:text-primary transition-colors" />
                    <input
                        id="exam-wizard-search"
                        name="search"
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('exams.wizard.step1.search')}
                        autoComplete="off"
                        className="input h-11 w-full pl-11 bg-base-content/[0.03] border-base-content/5 rounded-2xl focus:border-primary/30 focus:bg-primary/[0.02] transition-all"
                    />
                </div>
                <div className="flex items-center gap-1.5 p-1 bg-base-content/5 rounded-2xl">
                    <button
                        onClick={() => setConfig(prev => ({ ...prev, subject_ids: subjects.map(s => s.id) }))}
                        className="btn btn-ghost btn-sm h-9 rounded-xl text-[10px] font-black uppercase hover:bg-primary/10 hover:text-primary px-3"
                    >
                        {t('exams.wizard.step1.all')}
                    </button>
                    {config.subject_ids.length > 0 && (
                        <button
                            onClick={() => setConfig(prev => ({ ...prev, subject_ids: [] }))}
                            className="btn btn-ghost btn-sm h-9 rounded-xl text-[10px] font-black uppercase hover:bg-error/10 hover:text-error px-3"
                        >
                            {t('exams.wizard.step1.clear')}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {visibleSubjects.map(subject => {
                    const isSelected = config.subject_ids.includes(subject.id);
                    return (
                        <button
                            key={subject.id}
                            onClick={() => toggleSubject(subject.id)}
                            className={cn(
                                "relative p-5 rounded-3xl border text-left transition-all duration-500 overflow-hidden group",
                                isSelected
                                    ? "bg-primary/[0.04] border-primary/30 ring-2 ring-primary/10 shadow-lg shadow-primary/5"
                                    : "bg-base-content/[0.02] border-base-content/5 hover:border-primary/20 hover:bg-primary/[0.01]"
                            )}
                        >
                            {/* Accent color background bleed */}
                            {isSelected && (
                                <div
                                    className="absolute -right-4 -top-4 w-12 h-12 blur-2xl opacity-20 pointer-events-none"
                                    style={{ backgroundColor: subject.color || 'var(--color-primary)' }}
                                />
                            )}

                            <div className="flex items-center gap-3 mb-3 relative z-10">
                                <div
                                    className={cn(
                                        "w-4 h-4 rounded-full ring-2 ring-offset-2 ring-offset-base-100 transition-all duration-500",
                                        isSelected ? "scale-110 shadow-[0_0_10px_rgba(0,0,0,0.1)]" : "opacity-60"
                                    )}
                                    style={{
                                        backgroundColor: subject.color || '#888',
                                        boxShadow: isSelected ? `0 0 12px ${subject.color}40` : 'none'
                                    }}
                                />
                                <span className={cn(
                                    "text-sm font-black truncate transition-colors duration-300",
                                    isSelected ? "text-base-content" : "text-base-content/50 group-hover:text-base-content/70"
                                )}>
                                    {subject.name}
                                </span>
                            </div>

                            <div className="flex items-end justify-between relative z-10 mt-2">
                                <p className="text-[10px] font-bold text-base-content/30 group-hover:text-base-content/40 transition-colors">
                                    {subject.question_count || 0} {t('exams.wizard.step3.unit')}
                                </p>
                                {isSelected && (
                                    <div className="text-primary animate-in zoom-in duration-500">
                                        <CheckCircle2 size={18} />
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {filteredSubjects.length > 8 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full text-center py-4 text-[10px] font-black uppercase tracking-widest text-base-content/30 hover:text-primary transition-all group"
                >
                    <div className="flex items-center justify-center gap-2">
                        <div className="h-px flex-1 bg-base-content/5 group-hover:bg-primary/10" />
                        {showAll ? (
                            <span className="flex items-center gap-2">{t('exams.wizard.step1.show_less')} <ChevronUp size={12} /></span>
                        ) : (
                            <span className="flex items-center gap-2">{t('exams.wizard.step1.show_more', { count: filteredSubjects.length - 8 })} <ChevronDown size={12} /></span>
                        )}
                        <div className="h-px flex-1 bg-base-content/5 group-hover:bg-primary/10" />
                    </div>
                </button>
            )}

            {config.subject_ids.length === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-warning/5 border border-warning/20 text-warning animate-in slide-in-from-top-2">
                    <AlertCircle size={18} />
                    <span className="text-xs font-bold">{t('exams.wizard.step1.error')}</span>
                </div>
            )}
        </div>
    );
};

// Step 2: Filters
const WizardStep2: React.FC<{
    config: ExamConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExamConfig>>;
    tags: Tag[];
}> = ({ config, setConfig, tags }) => {
    const { t } = useTranslation();
    const [showAllTags, setShowAllTags] = useState(false);
    const visibleTags = showAllTags ? tags : tags.slice(0, 8);

    const toggleTag = (id: string) => {
        setConfig(prev => ({
            ...prev,
            tag_ids: prev.tag_ids.includes(id) ? prev.tag_ids.filter(x => x !== id) : [...prev.tag_ids, id]
        }));
    };

    const toggleDifficulty = (d: Difficulty) => {
        setConfig(prev => {
            const newDiff = prev.difficulty.includes(d) ? prev.difficulty.filter(x => x !== d) : [...prev.difficulty, d];
            return { ...prev, difficulty: newDiff.length > 0 ? newDiff : [d] };
        });
    };

    const toggleQuestionType = (t: QuestionType) => {
        setConfig(prev => {
            const newTypes = prev.question_types.includes(t) ? prev.question_types.filter(x => x !== t) : [...prev.question_types, t];
            return { ...prev, question_types: newTypes.length > 0 ? newTypes : [t] };
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Tags */}
            <div className="space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-primary rounded-full" />
                            {t('exams.wizard.step2.tags')}
                        </h4>
                        <p className="text-[10px] font-bold text-base-content/30 mt-1 uppercase tracking-widest ml-3.5">{t('exams.wizard.step2.tags_desc')}</p>
                    </div>
                    {config.tag_ids.length > 0 && (
                        <button
                            onClick={() => setConfig(prev => ({ ...prev, tag_ids: [] }))}
                            className="text-[10px] font-black uppercase text-error/60 hover:text-error transition-colors"
                        >
                            {t('exams.wizard.step1.clear')}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                    {visibleTags.map(tag => {
                        const isSelected = config.tag_ids.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={cn(
                                    "flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all duration-300 group hover:scale-[1.02]",
                                    isSelected
                                        ? "border-primary/30 bg-primary/[0.04] shadow-md shadow-primary/5 ring-1 ring-primary/10"
                                        : "border-base-content/5 bg-base-content/[0.02] hover:border-base-content/20"
                                )}
                            >
                                <div
                                    className={cn("w-2.5 h-2.5 rounded-full ring-2 ring-white/10 transition-all duration-300", isSelected ? "scale-110" : "opacity-40")}
                                    style={{ backgroundColor: tag.color || '#888' }}
                                />
                                <span className={cn("text-xs font-black transition-colors", isSelected ? "text-base-content" : "text-base-content/50")}>
                                    {tag.name}
                                </span>
                                {tag.question_count && (
                                    <span className="text-[9px] font-mono text-base-content/30 group-hover:text-base-content/50">
                                        {tag.question_count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {tags.length > 8 && (
                    <button
                        onClick={() => setShowAllTags(!showAllTags)}
                        className="text-[10px] font-black uppercase tracking-widest text-base-content/30 hover:text-primary transition-colors py-1"
                    >
                        {showAllTags ? t('exams.wizard.step1.show_less') : t('exams.wizard.step1.show_more', { count: tags.length - 8 })}
                    </button>
                )}
            </div>

            {/* Mastery Range */}
            <div className="glass-card p-6 bg-gradient-to-br from-secondary/[0.02] to-transparent border-secondary/10">
                <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-secondary rounded-full" />
                        {t('exams.wizard.step2.mastery')}
                    </h4>
                    <div className="flex items-center gap-2 se-mono">
                        <span className="text-2xl font-black text-secondary">{config.mastery_range[0]}<span className="text-xs">%</span></span>
                        <span className="text-base-content/20">/</span>
                        <span className="text-2xl font-black text-secondary">{config.mastery_range[1]}<span className="text-xs">%</span></span>
                    </div>
                </div>
                <div className="relative pt-1 px-1">
                    <input
                        id="exam-mastery-range"
                        name="mastery_range"
                        type="range" min="0" max="100" step="5"
                        value={config.mastery_range[1]}
                        onChange={(e) => setConfig(prev => ({ ...prev, mastery_range: [prev.mastery_range[0], parseInt(e.target.value)] }))}
                        className="range range-secondary range-sm w-full h-1.5"
                        autoComplete="off"
                    />
                    <div className="flex justify-between mt-2 px-0.5">
                        {[0, 25, 50, 75, 100].map(val => (
                            <span key={val} className="text-[9px] font-black text-base-content/20">{val}%</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Difficulty & Types */}
            <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('exams.wizard.step2.difficulty')}</h4>
                    <div className="flex flex-col gap-2.5">
                        {([{ d: 'easy' as Difficulty, color: 'text-success', bg: 'bg-success/5' }, { d: 'medium' as Difficulty, color: 'text-warning', bg: 'bg-warning/5' }, { d: 'hard' as Difficulty, color: 'text-error', bg: 'bg-error/5' }] as const).map(({ d, color, bg }) => (
                            <label key={d} className={cn(
                                "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group",
                                config.difficulty.includes(d) ? cn("border-primary/20", bg) : "border-base-content/5 bg-base-content/[0.01]"
                            )}>
                                <div className="flex items-center gap-3">
                                    <input id={`exam-diff-${d}`} name={`diff_${d}`} type="checkbox" checked={config.difficulty.includes(d)} onChange={() => toggleDifficulty(d)} className="checkbox checkbox-primary checkbox-sm rounded-lg" autoComplete="off" />
                                    <span className={cn("text-xs font-black transition-colors uppercase tracking-wide", config.difficulty.includes(d) ? color : "text-base-content/40")}>{t(`common.difficulty.${d}`)}</span>
                                </div>
                                <div className={cn("w-2 h-2 rounded-full", config.difficulty.includes(d) ? color.replace('text-', 'bg-') : "bg-base-content/10")} />
                            </label>
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('exams.wizard.step2.type')}</h4>
                    <div className="flex flex-col gap-2.5">
                        {([{ t_key: 'choice' as QuestionType, icon: History }, { t_key: 'fill_blank' as QuestionType, icon: FileText }, { t_key: 'short_answer' as QuestionType, icon: ClipboardList }] as const).map(({ t_key, icon: Icon }) => (
                            <label key={t_key} className={cn(
                                "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group",
                                config.question_types.includes(t_key) ? "border-primary/20 bg-primary/5" : "border-base-content/5 bg-base-content/[0.01]"
                            )}>
                                <div className="flex items-center gap-3">
                                    <input id={`exam-type-${t_key}`} name={`type_${t_key}`} type="checkbox" checked={config.question_types.includes(t_key)} onChange={() => toggleQuestionType(t_key)} className="checkbox checkbox-primary checkbox-sm rounded-lg" autoComplete="off" />
                                    <div className="flex items-center gap-2">
                                        <Icon size={14} className={config.question_types.includes(t_key) ? "text-primary" : "text-base-content/20"} />
                                        <span className={cn("text-xs font-black transition-colors", config.question_types.includes(t_key) ? "text-base-content" : "text-base-content/40")}>{t(`common.type.${t_key}`)}</span>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


// Step 3: Strategy & Count
const WizardStep3: React.FC<{
    config: ExamConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExamConfig>>;
    availableCount: number;
}> = ({ config, setConfig, availableCount }) => {
    const { t } = useTranslation();

    const strategies: { value: SamplingStrategy; label: string; desc: string; icon: React.ElementType; color: string; recommended?: boolean }[] = [
        { value: 'weakness', label: t('exams.strategies.weakness.title'), desc: t('exams.strategies.weakness.desc'), icon: Target, color: 'from-rose-500 to-orange-500', recommended: true },
        { value: 'due_first', label: t('exams.strategies.due_first.title'), desc: t('exams.strategies.due_first.desc'), icon: Clock, color: 'from-blue-500 to-cyan-500' },
        { value: 'new_first', label: t('exams.strategies.new_first.title'), desc: t('exams.strategies.new_first.desc'), icon: Sparkles, color: 'from-purple-500 to-pink-500' },
        { value: 'random', label: t('exams.strategies.random.title'), desc: t('exams.strategies.random.desc'), icon: Shuffle, color: 'from-emerald-500 to-teal-500' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
                <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full" />
                    {t('exams.wizard.step3.title')}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    {strategies.map(({ value, label, desc, icon: Icon, color, recommended }) => (
                        <button
                            key={value}
                            onClick={() => setConfig(prev => ({ ...prev, strategy: value }))}
                            className={`relative p-5 rounded-2xl border text-left transition-all duration-300 group hover:scale-[1.02]
                                ${config.strategy === value ? 'border-primary/30 ring-2 ring-primary/20 shadow-xl' : 'border-base-content/5 bg-base-content/[0.02] hover:border-base-content/20 hover:shadow-lg'}`}
                        >
                            {recommended && (
                                <span className="absolute -top-2 -right-2 px-2.5 py-1 bg-gradient-to-r from-primary to-secondary text-white text-[8px] font-black uppercase rounded-full shadow-lg">{t('exams.wizard.step3.recommended')}</span>
                            )}
                            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${color} text-white mb-3 shadow-lg ${config.strategy === value ? 'scale-110' : 'group-hover:scale-105'} transition-transform duration-300`}>
                                <Icon size={20} />
                            </div>
                            <h5 className={`text-sm font-black mb-1 ${config.strategy === value ? 'text-base-content' : 'text-base-content/70'}`}>{label}</h5>
                            <p className="text-[10px] text-base-content/40 leading-relaxed">{desc}</p>
                            {config.strategy === value && <div className="absolute right-3 top-3 text-primary"><CheckCircle2 size={20} /></div>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                        <span className="w-1 h-4 bg-secondary rounded-full" />
                        {t('exams.wizard.step3.question_count')}
                    </h4>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-primary">{config.question_count}</span>
                        <span className="text-sm text-base-content/40">{t('exams.wizard.step3.unit')}</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    {[10, 15, 20, 30, 50].map(count => (
                        <button
                            key={count}
                            onClick={() => setConfig(prev => ({ ...prev, question_count: count }))}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                                ${config.question_count === count ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-base-content/5 text-base-content/50 hover:bg-base-content/10'}`}
                        >
                            {count}{t('exams.wizard.step3.unit')}
                        </button>
                    ))}
                </div>

                <input id="exam-question-count" name="question_count" type="range" min="5" max="50" step="1" value={config.question_count}
                    onChange={(e) => setConfig(prev => ({ ...prev, question_count: parseInt(e.target.value) }))}
                    className="range range-primary range-sm w-full" autoComplete="off" />

                {availableCount < config.question_count && availableCount > 0 && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning">
                        <AlertCircle size={16} />
                        <span className="text-xs font-medium">{t('exams.wizard.step3.available_hint', { count: availableCount })}</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01]
                    ${config.shuffle ? 'bg-info/10 border-info/30' : 'border-base-content/5 bg-base-content/[0.02]'}`}>
                    <input id="exam-shuffle" name="shuffle" type="checkbox" checked={config.shuffle} onChange={(e) => setConfig(prev => ({ ...prev, shuffle: e.target.checked }))} className="checkbox checkbox-info checkbox-sm rounded" autoComplete="off" />
                    <div>
                        <span className="text-xs font-bold flex items-center gap-1"><Shuffle size={12} />{t('exams.wizard.step3.shuffle')}</span>
                        <p className="text-[9px] text-base-content/40">{t('exams.wizard.step3.shuffle_desc')}</p>
                    </div>
                </label>
                <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01]
                    ${config.include_archived ? 'bg-info/10 border-info/30' : 'border-base-content/5 bg-base-content/[0.02]'}`}>
                    <input id="exam-archived" name="include_archived" type="checkbox" checked={config.include_archived} onChange={(e) => setConfig(prev => ({ ...prev, include_archived: e.target.checked }))} className="checkbox checkbox-info checkbox-sm rounded" autoComplete="off" />
                    <div>
                        <span className="text-xs font-bold flex items-center gap-1"><Archive size={12} />{t('exams.wizard.step3.archived')}</span>
                        <p className="text-[9px] text-base-content/40">{t('exams.wizard.step3.archived_desc')}</p>
                    </div>
                </label>
            </div>
        </div>
    );
};

// Step 4: Mode & Confirmation
const WizardStep4: React.FC<{
    config: ExamConfig;
    setConfig: React.Dispatch<React.SetStateAction<ExamConfig>>;
    stats: { count: number; subjects: number; estimatedTime: number };
    subjects: Subject[];
}> = ({ config, setConfig, stats, subjects }) => {
    const { t } = useTranslation();
    const selectedSubjectNames = config.subject_ids.map(id => subjects.find(s => s.id === id)?.name).filter(Boolean);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
                <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full" />
                    {t('exams.wizard.step4.mode')}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    {(['practice', 'exam'] as ExamMode[]).map(mode => {
                        const modeConfig = getModeConfig(mode, t);
                        const Icon = modeConfig.icon;
                        const isSelected = config.mode === mode;
                        return (
                            <button
                                key={mode}
                                onClick={() => setConfig(prev => ({ ...prev, mode, time_limit_minutes: mode === 'exam' ? 30 : null }))}
                                className={`relative p-5 rounded-2xl border transition-all duration-300 text-left hover:scale-[1.02]
                                    ${isSelected ? 'border-primary/30 ring-2 ring-primary/20 shadow-xl bg-primary/5' : 'border-base-content/5 bg-base-content/[0.02] hover:border-base-content/20'}`}
                            >
                                <div className={`p-3 rounded-xl inline-flex mb-3 transition-all duration-300
                                    ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-base-content/5 text-base-content/30'}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <h5 className={`text-base font-black mb-1 ${isSelected ? 'text-base-content' : 'text-base-content/60'}`}>{modeConfig.label}</h5>
                                <p className="text-[10px] text-base-content/40 leading-relaxed">{modeConfig.desc}</p>
                                {isSelected && <div className="absolute right-3 top-3 text-primary"><CheckCircle2 size={20} /></div>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {config.mode === 'exam' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-base-content/80 flex items-center gap-2">
                            <span className="w-1 h-4 bg-warning rounded-full" />
                            {t('exams.wizard.step4.time_limit')}
                        </h4>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-base-content/50">{t('exams.wizard.step4.enable_limit')}</span>
                            <input id="exam-time-limit-toggle" name="time_limit_enabled" type="checkbox" checked={config.time_limit_minutes !== null} onChange={(e) => setConfig(prev => ({ ...prev, time_limit_minutes: e.target.checked ? 30 : null }))} className="toggle toggle-warning toggle-sm" autoComplete="off" />
                        </label>
                    </div>
                    {config.time_limit_minutes !== null && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-base-content/50">{t('exams.wizard.step4.time_limit')}</span>
                                <span className="text-2xl font-black text-warning">{config.time_limit_minutes} {t('exams.wizard.step4.mins')}</span>
                            </div>
                            <input id="exam-time-limit-slider" name="time_limit_minutes" type="range" min="10" max="120" step="5" value={config.time_limit_minutes} onChange={(e) => setConfig(prev => ({ ...prev, time_limit_minutes: parseInt(e.target.value) }))} className="range range-warning range-sm w-full" autoComplete="off" />
                        </div>
                    )}
                </div>
            )}

            <div className="glass-card p-6 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 border-primary/10">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 bg-primary/20 text-primary rounded-xl"><FileText className="w-5 h-5" /></div>
                    <div>
                        <h4 className="text-sm font-black text-base-content/90">{t('exams.wizard.step4.overview')}</h4>
                        <p className="text-[10px] text-base-content/40">{t('exams.wizard.step4.overview_desc')}</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-4 bg-white/50 rounded-xl">
                        <p className="text-2xl font-black text-primary">{Math.min(stats.count, config.question_count)}</p>
                        <p className="text-[9px] font-black text-base-content/40 uppercase">{t('exams.wizard.step3.question_count')}</p>
                    </div>
                    <div className="text-center p-4 bg-white/50 rounded-xl">
                        <p className="text-2xl font-black text-secondary">{stats.subjects}</p>
                        <p className="text-[9px] font-black text-base-content/40 uppercase">{t('exams.wizard.step4.stats_subjects')}</p>
                    </div>
                    <div className="text-center p-4 bg-white/50 rounded-xl">
                        <p className="text-2xl font-black text-warning">{stats.estimatedTime}</p>
                        <p className="text-[9px] font-black text-base-content/40 uppercase">{t('exams.wizard.step4.stats_time')}</p>
                    </div>
                </div>
                <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-2 border-b border-dashed border-base-content/10">
                        <span className="text-base-content/50">{t('exams.wizard.step1.title')}</span>
                        <span className="font-bold text-base-content/80">{selectedSubjectNames.slice(0, 3).join('、')}{selectedSubjectNames.length > 3 && t('exams.wizard.step4.more_subjects', { count: selectedSubjectNames.length })}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <span className="text-base-content/50">{t('exams.wizard.step4.mode')}</span>
                        <span className={`font-bold ${getModeConfig(config.mode, t).color}`}>{getModeConfig(config.mode, t).label}{config.mode === 'exam' && config.time_limit_minutes && ` (${config.time_limit_minutes}${t('exams.wizard.step4.mins')})`}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};


// ============================================
// Live Stats Preview Panel
// ============================================

const LiveStatsPanel: React.FC<{
    config: ExamConfig;
    subjects: Subject[];
    tags: Tag[];
    availableCount: number;
    currentStep?: number;
}> = ({ config, subjects, tags, availableCount, currentStep = 1 }) => {
    const { t } = useTranslation();
    const selectedSubjects = subjects.filter(s => config.subject_ids.includes(s.id));
    const selectedTags = tags.filter(tag => config.tag_ids.includes(tag.id));

    // Time Estimate Logic
    const perQuestionTime = config.answer_mode === 'online' ? 2 : 1.5;
    const estimatedTime = Math.min(availableCount, config.question_count) * perQuestionTime;

    const isReady = config.subject_ids.length > 0 && availableCount >= Math.min(5, config.question_count);

    // Icons
    const strategyIcons: Record<SamplingStrategy, typeof Target> = {
        weakness: Target,
        due_first: Clock,
        new_first: Sparkles,
        random: Shuffle,
    };
    const StrategyIcon = strategyIcons[config.strategy] || Shuffle;

    return (
        <div className="flex flex-col h-full bg-base-content/[0.01] overflow-hidden">
            {/* Header: Premium Indicator */}
            <div className="shrink-0 px-6 py-5 border-b border-base-content/5 bg-base-content/[0.02]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-base-content/90 tracking-tight">{t('exams.live_stats.title')}</h3>
                            <p className="text-[9px] font-black text-base-content/20 uppercase tracking-widest leading-none mt-1">{t('exams.live_stats.realtime_config')}</p>
                        </div>
                    </div>
                    <div className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm transition-all duration-500",
                        isReady ? "bg-success/10 text-success border border-success/20 ring-4 ring-success/5" : "bg-warning/10 text-warning border border-warning/20"
                    )}>
                        {isReady ? t('exams.live_stats.ready') : t('exams.live_stats.configuring')}
                    </div>
                </div>
            </div>

            {/* Content: Dashboard View */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar relative">
                {/* 1. Primary Metrics */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass-card p-4 bg-gradient-to-br from-primary/[0.03] to-transparent border-primary/10">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('exams.live_stats.coverage')}</span>
                            <Target size={12} className="text-primary/40" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={cn(
                                "text-3xl font-black tabular-nums transition-colors duration-500",
                                availableCount === 0 ? "text-error/40" : availableCount < config.question_count ? "text-warning" : "text-primary"
                            )}>
                                {availableCount}
                            </span>
                            <span className="text-xs font-black text-base-content/20 italic">/ {config.question_count}</span>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-base-content/5 rounded-full overflow-hidden">
                            <div className={cn(
                                "h-full rounded-full transition-all duration-1000 ease-spring",
                                availableCount >= config.question_count ? "bg-primary shadow-[0_0_8px_var(--color-primary)]" : "bg-warning"
                            )}
                                style={{ width: `${Math.min(100, (availableCount / Math.max(1, config.question_count)) * 100)}%` }} />
                        </div>
                    </div>

                    <div className="glass-card p-4 bg-gradient-to-br from-accent/[0.03] to-transparent border-accent/10">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('exams.live_stats.est_time')}</span>
                            <Timer size={12} className="text-accent/40" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-base-content/70 tabular-nums">
                                {config.mode === 'exam' && config.time_limit_minutes ? config.time_limit_minutes : Math.ceil(estimatedTime)}
                            </span>
                            <span className="text-[10px] font-black text-base-content/20 uppercase tracking-widest">{t('exams.wizard.step4.mins')}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={cn("h-1 flex-1 rounded-full", i < Math.ceil(estimatedTime / 10) ? "bg-accent/40" : "bg-base-content/10")} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* 2. Intelligent Insights Section */}
                <div className="space-y-4">
                    {/* Distribution Bar */}
                    <div className="glass-card p-4 bg-base-content/5 border-none shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black text-base-content/40 uppercase tracking-widest flex items-center gap-2">
                                <SlidersHorizontal size={12} />
                                {t('exams.live_stats.distribution')}
                            </h4>
                            <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md uppercase">{t('exams.live_stats.intensity_high')}</span>
                        </div>
                        <div className="space-y-3">
                            <div className="flex h-4 w-full rounded-xl overflow-hidden bg-base-content/5 p-1 ring-1 ring-base-content/5 shadow-inner">
                                <div className="h-full bg-success/60 rounded-l-lg transition-all duration-1000" style={{ width: config.difficulty.includes('easy') ? '33.33%' : '0%' }} title="Easy" />
                                <div className="h-full bg-warning/60 transition-all duration-1000" style={{ width: config.difficulty.includes('medium') ? '33.34%' : '0%' }} title="Medium" />
                                <div className="h-full bg-error/60 rounded-r-lg transition-all duration-1000" style={{ width: config.difficulty.includes('hard') ? '33.33%' : '0%' }} title="Hard" />
                            </div>
                            <div className="flex justify-between px-1">
                                {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                                    <div key={d} className={cn(
                                        "flex flex-col items-center gap-1",
                                        config.difficulty.includes(d) ? "opacity-100" : "opacity-20 grayscale"
                                    )}>
                                        <div className={cn("w-1.5 h-1.5 rounded-full", d === 'easy' ? 'bg-success' : d === 'medium' ? 'bg-warning' : 'bg-error')} />
                                        <span className="text-[8px] font-black uppercase tracking-tighter se-muted">{t(`common.difficulty.${d}`)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Subjects Visualization */}
                    <div className="glass-card p-4">
                        <div className="text-[10px] font-black text-base-content/40 uppercase tracking-widest mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BookOpen size={12} className="text-secondary/60" />
                                {t('exams.live_stats.selected_subjects')}
                            </div>
                            <span className="px-2 py-0.5 rounded-lg bg-base-content/5 font-mono text-base-content/40">{selectedSubjects.length}</span>
                        </div>
                        {selectedSubjects.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {selectedSubjects.map(s => (
                                    <div key={s.id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-base-content/5 border border-base-content/5 hover:border-primary/20 transition-all group/sub">
                                        <div className="w-2 h-2 rounded-full shadow-sm ring-2 ring-white/20" style={{ backgroundColor: s.color || '#888' }} />
                                        <span className="text-[10px] font-black text-base-content/70 group-hover/sub:text-primary transition-colors">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 border border-dashed border-base-content/10 rounded-2xl text-center">
                                <p className="text-[10px] font-bold text-base-content/20 italic">{t('exams.live_stats.no_subjects')}</p>
                            </div>
                        )}
                    </div>

                    {/* Tags Visualization */}
                    {selectedTags.length > 0 && (
                        <div className="glass-card p-4">
                            <div className="text-[10px] font-black text-base-content/40 uppercase tracking-widest mb-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Hash size={12} className="text-accent/60" />
                                    {t('exams.wizard.step2.tags')}
                                </div>
                                <span className="px-2 py-0.5 rounded-lg bg-base-content/5 font-mono text-base-content/40">{selectedTags.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {selectedTags.map(tag => (
                                    <div key={tag.id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-base-content/5 border border-base-content/5">
                                        <div className="w-2 h-2 rounded-full shadow-sm ring-2 ring-white/20" style={{ backgroundColor: tag.color || '#888' }} />
                                        <span className="text-[10px] font-black text-base-content/70">{tag.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Question Types Visualization */}
                    <div className="glass-card p-4">
                        <div className="text-[10px] font-black text-base-content/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Layers size={12} className="text-info/60" />
                            {t('exams.wizard.step3.question_types')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(['choice', 'fill_blank', 'short_answer'] as QuestionType[]).map(qType => {
                                const isSelected = config.question_types.includes(qType);
                                return (
                                    <div
                                        key={qType}
                                        className={cn(
                                            "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all",
                                            isSelected
                                                ? "bg-info/10 text-info border-info/20"
                                                : "bg-base-content/5 text-base-content/20 border-transparent opacity-40"
                                        )}
                                    >
                                        {t(`common.type.${qType}`)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {currentStep >= 3 && (
                    <div className="animate-in slide-in-from-bottom-2 duration-500">
                        <div className={cn(
                            "glass-card p-4 relative overflow-hidden",
                            config.mode === 'exam' ? "border-primary/20 bg-primary/[0.02]" : "border-secondary/20 bg-secondary/[0.02]"
                        )}>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-500 hover:rotate-6",
                                    config.mode === 'exam' ? "bg-gradient-to-br from-primary to-primary-focus" : "bg-gradient-to-br from-secondary to-secondary-focus"
                                )}>
                                    <StrategyIcon className="w-6 h-6" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-black text-base-content/80 uppercase tracking-wide">
                                        {t(`exams.strategies.${config.strategy}.title`)}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase text-white",
                                            config.mode === 'exam' ? "bg-primary" : "bg-secondary"
                                        )}>
                                            {t(`exams.modes.${config.mode === 'exam' ? 'eval' : 'drill'}.title`)}
                                        </span>
                                        {config.mode === 'exam' && config.time_limit_minutes && (
                                            <span className="text-[10px] font-black text-warning flex items-center gap-1">
                                                <Timer size={10} /> {config.time_limit_minutes}m
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2 relative z-10">
                                <div className={cn(
                                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black border transition-all",
                                    config.shuffle ? "bg-success/5 border-success/20 text-success" : "bg-base-content/5 border-transparent text-base-content/20"
                                )}>
                                    <Shuffle size={10} className={config.shuffle ? "animate-spin-slow" : ""} />
                                    {t('exams.wizard.step3.shuffle')}
                                </div>
                                {config.include_archived && (
                                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[9px] font-black bg-warning/5 border border-warning/10 text-warning">
                                        <Archive size={10} />
                                        {t('exams.wizard.step3.archived')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================
// Exam History List
// ============================================

const HistoryCard: React.FC<{
    exam: ExamRecord;
    onClick: () => void;
    onToggleFavorite?: (examId: string) => void;
}> = ({ exam, onClick, onToggleFavorite }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const score = exam.score;
    const gradeObj = getGrade(score);
    const gradeColor = gradeObj.color;
    const statusConfig = getStatusConfig(exam.status, t);
    const StatusIcon = statusConfig.icon;
    const efficiency = exam.duration_seconds && exam.question_count ? Math.round(exam.duration_seconds / exam.question_count) : null;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
            className="group relative flex gap-4 p-5 rounded-2xl bg-base-100/60 backdrop-blur-sm border border-base-content/5 hover:border-primary/10 hover:bg-base-100/80 transition-all duration-500 text-left overflow-hidden se-interactive shadow-sm hover:shadow-md cursor-pointer"
        >
            {/* Background Accent */}
            <div className={cn(
                "absolute inset-y-0 left-0 w-1 transition-all duration-500",
                gradeColor.replace('text-', 'bg-')
            )} />

            {/* Background Grade Letter (Large, Faded) */}
            <span className={cn(
                "absolute -right-4 -bottom-8 text-[12rem] font-black opacity-[0.03] select-none pointer-events-none transition-all duration-700 group-hover:scale-110 group-hover:opacity-[0.06] rotate-12",
                gradeColor
            )}>
                {gradeObj.letter}
            </span>

            {/* Left: Score Hub */}
            <div className="shrink-0 flex flex-col items-center gap-3 relative z-10 w-24">
                <div className={cn(
                    "w-20 h-20 rounded-[2rem] flex items-center justify-center border-4 shadow-xl transition-all duration-700 group-hover:scale-105 group-hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.1)]",
                    gradeColor.length > 5 ? gradeColor.replace('text-', 'border-') + '/10' : 'border-base-content/10',
                    "bg-base-100/40 backdrop-blur-md"
                )}>
                    <div className="text-center">
                        <span className={cn("text-3xl font-black se-mono leading-none tracking-tighter", gradeColor)}>{score !== null ? Math.round(score) : '--'}</span>
                        <span className="block text-[8px] font-black opacity-30 mt-0.5">%</span>
                    </div>
                </div>
                <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm whitespace-nowrap backdrop-blur-sm",
                    gradeColor.replace('text-', 'bg-') + '/10',
                    gradeColor
                )}>
                    {t('exams.history.grade')} {gradeObj.letter}
                </div>
            </div>

            {/* Middle: Content */}
            <div className="flex-1 min-w-0 space-y-4 relative z-10 pt-1">
                <div className="space-y-2 px-1">
                    <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded-lg bg-base-content/5", statusConfig.color.replace('text-', 'bg-') + '/10')}>
                            <StatusIcon className={cn("w-3.5 h-3.5", statusConfig.color)} />
                        </div>
                        <h4 className="text-base font-black text-base-content/80 truncate leading-none group-hover:text-primary transition-colors">{exam.title}</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/10">
                            <BookOpen className="w-3 h-3 text-primary/40" />
                            <span className="text-[10px] font-black text-primary/70 uppercase tracking-wide">{exam.subject_name || t('common.general.unknown')}</span>
                        </div>

                        {exam.tag_names && exam.tag_names.slice(0, 3).map((tagName, i) => (
                            <div key={i} className="px-2 py-0.5 rounded-lg bg-base-content/[0.05] border border-base-content/5">
                                <span className="text-[9px] font-bold text-base-content/40 tracking-tight lowercase">#{tagName}</span>
                            </div>
                        ))}

                        <span className="text-[10px] font-bold text-base-content/20 italic ml-1">{formatDate(exam.start_time, t, lang)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="px-3 py-2 bg-base-content/[0.025] rounded-2xl group-hover:bg-primary/[0.04] transition-colors border border-transparent group-hover:border-primary/5">
                        <p className="text-[8px] font-black text-base-content/20 uppercase tracking-[0.15em] mb-1">{t('exams.history.stats.questions')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black se-mono">{exam.question_count}</span>
                            <span className="text-[8px] font-black text-base-content/20 uppercase">{t('exams.wizard.step3.unit')}</span>
                        </div>
                    </div>
                    <div className="px-3 py-2 bg-base-content/[0.025] rounded-2xl group-hover:bg-primary/[0.04] transition-colors border border-transparent group-hover:border-primary/5">
                        <p className="text-[8px] font-black text-base-content/20 uppercase tracking-[0.15em] mb-1">{t('exams.history.stats.correct')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black se-mono text-success">{exam.correct_count || 0}</span>
                            <span className="text-[8px] font-black text-base-content/20 uppercase">✓</span>
                        </div>
                    </div>
                    <div className="px-3 py-2 bg-base-content/[0.025] rounded-2xl group-hover:bg-primary/[0.04] transition-colors border border-transparent group-hover:border-primary/5">
                        <p className="text-[8px] font-black text-base-content/20 uppercase tracking-[0.15em] mb-1">{t('exams.history.stats.time')}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black se-mono">{formatDuration(exam.duration_seconds || 0)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side: Efficiency & Interaction */}
            <div className="shrink-0 flex flex-col justify-between items-end pb-1 pt-1 relative z-10">
                <div className="text-right">
                    <p className="text-[9px] font-black text-base-content/20 uppercase tracking-widest mb-1.5">{t('exams.history.efficiency')}</p>
                    {efficiency ? (
                        <div className="flex flex-col items-end">
                            <span className="text-xl font-black se-mono leading-none">{efficiency}</span>
                            <span className="text-[8px] font-black text-base-content/40 uppercase mt-0.5">{t('exams.history.efficiency_unit')}</span>
                        </div>
                    ) : (
                        <span className="text-xs font-black text-base-content/10">--</span>
                    )}
                </div>

                <div className="bg-base-content/5 p-2 rounded-full text-base-content/30 group-hover:bg-primary group-hover:text-white transition-all duration-500 scale-90 group-hover:scale-100 shadow-sm">
                    <ChevronRight size={16} strokeWidth={3} />
                </div>
            </div>

            {/* Favorite Toggle Overlay */}
            {onToggleFavorite && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(exam.id); }}
                    className={cn(
                        "absolute top-4 right-4 p-2 rounded-xl transition-all duration-500 z-20 group/heart",
                        exam.is_favorite ? "bg-error/10 text-error shadow-sm" : "bg-base-content/5 text-base-content/20 hover:bg-error/5 hover:text-error/40 lg:opacity-0 lg:group-hover:opacity-100"
                    )}
                >
                    <Heart size={14} fill={exam.is_favorite ? "currentColor" : "none"} className={cn(exam.is_favorite && "animate-heart-pop")} />
                </button>
            )}
        </div>
    );
};

const ExamHistoryList: React.FC<{
    exams: ExamRecord[];
    onExamsClick: (exam: ExamRecord) => void;
    onToggleFavorite?: (examId: string) => void;
}> = ({ exams, onExamsClick, onToggleFavorite }) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-3">
            {exams.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                    {exams.map(exam => (
                        <HistoryCard
                            key={exam.id}
                            exam={exam}
                            onClick={() => onExamsClick(exam)}
                            onToggleFavorite={onToggleFavorite}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={ClipboardList}
                    title={t('exams.list.empty_title')}
                    description={t('exams.list.empty_desc')}
                    action={
                        <button onClick={() => (window as any).examsPageOnStartCreate?.()} className="btn btn-primary btn-sm rounded-xl px-6">
                            {t('exams.header.btn_create')}
                        </button>
                    }
                />
            )}
        </div>
    );
};


// ============================================
// Advanced Filters Panel
// ============================================

const AdvancedFiltersPanel: React.FC<{
    filters: ExamFilters;
    setFilters: React.Dispatch<React.SetStateAction<ExamFilters>>;
    subjects: Subject[];
    onClose: () => void;
}> = ({ filters, setFilters, subjects, onClose }) => {
    const { t } = useTranslation();

    function updateFilter<K extends keyof ExamFilters>(key: K, value: ExamFilters[K]) {
        setFilters(prev => ({ ...prev, [key]: value }));
    }

    function toggleArrayFilter<K extends keyof ExamFilters>(key: K, value: ExamFilters[K] extends (infer T)[] ? T : never) {
        setFilters(prev => {
            const arr = prev[key] as unknown[];
            const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
            return { ...prev, [key]: newArr };
        });
    }

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.statuses.length > 0) count++;
        if (filters.modes.length > 0) count++;
        if (filters.subject_id) count++;
        if (filters.date_range !== 'all') count++;
        if (filters.score_range !== 'all') count++;
        return count;
    }, [filters]);

    return (
        <div className="glass-card p-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10"><SlidersHorizontal size={16} className="text-primary" /></div>
                    <div>
                        <h4 className="text-sm font-black text-base-content/90">{t('exams.filters.title')}</h4>
                        <p className="text-[10px] text-base-content/40 font-medium">{activeFilterCount > 0 ? t('exams.filters.active', { count: activeFilterCount }) : t('exams.filters.desc')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                        <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-ghost btn-xs text-[10px] font-black uppercase text-base-content/40 hover:text-error">
                            <RotateCcw size={12} className="mr-1" />{t('common.reset')}
                        </button>
                    )}
                    <button onClick={onClose} className="btn btn-ghost btn-square btn-sm"><X size={16} /></button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.filters.status')}</label>
                    <div className="flex flex-wrap gap-2">
                        {(['completed', 'in_progress', 'abandoned'] as ExamStatus[]).map(status => {
                            const config = getStatusConfig(status, t);
                            return <FilterChip key={status} label={config.label} active={filters.statuses.includes(status)} onClick={() => toggleArrayFilter('statuses', status)} icon={config.icon} />;
                        })}
                    </div>
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.filters.mode')}</label>
                    <div className="flex flex-wrap gap-2">
                        {(['exam', 'practice'] as ExamMode[]).map(mode => {
                            const config = getModeConfig(mode, t);
                            return <FilterChip key={mode} label={config.label} active={filters.modes.includes(mode)} onClick={() => toggleArrayFilter('modes', mode)} icon={config.icon} />;
                        })}
                    </div>
                </div>
                <div className="space-y-3">
                    <label htmlFor="exam-filter-subject" className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.wizard.step1.title')}</label>
                    <select id="exam-filter-subject" name="subject_id" value={filters.subject_id || ''} onChange={(e) => updateFilter('subject_id', e.target.value || null)} className="select select-bordered select-sm w-full bg-base-content/[0.03] border-base-content/10 rounded-xl text-xs font-bold">
                        <option value="">{t('common.all')}</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.filters.time_range')}</label>
                    <div className="flex flex-wrap gap-2">
                        {([{ value: 'all', label: t('common.all') }, { value: 'today', label: t('exams.filters.time_today') }, { value: 'week', label: t('exams.filters.time_week') }, { value: 'month', label: t('exams.filters.time_month') }] as const).map(({ value, label }) => (
                            <FilterChip key={value} label={label} active={filters.date_range === value} onClick={() => updateFilter('date_range', value as ExamFilters['date_range'])} />
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.filters.score_range')}</label>
                    <div className="flex flex-wrap gap-2">
                        {([{ value: 'all', label: t('common.all') }, { value: 'excellent' as const, label: t('exams.grades.excellent') }, { value: 'good' as const, label: t('exams.grades.good') }, { value: 'pass' as const, label: t('exams.grades.pass') }, { value: 'fail' as const, label: t('exams.grades.poor') }] as const).map(({ value, label }) => (
                            <FilterChip key={value} label={label as string} active={filters.score_range === value} onClick={() => updateFilter('score_range', value as ExamFilters['score_range'])} />
                        ))}
                    </div>
                </div>
                <div className="space-y-3">
                    <label htmlFor="exam-filter-sort" className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{t('exams.filters.sort_by')}</label>
                    <div className="flex gap-2">
                        <select id="exam-filter-sort" name="sort_by" value={filters.sort_by} onChange={(e) => updateFilter('sort_by', e.target.value as ExamFilters['sort_by'])} className="select select-bordered select-sm flex-1 bg-base-content/[0.03] border-base-content/10 rounded-xl text-xs font-bold">
                            <option value="date">{t('exams.filters.sort_date')}</option>
                            <option value="score">{t('exams.filters.sort_score')}</option>
                            <option value="duration">{t('exams.filters.sort_duration')}</option>
                            <option value="questions">{t('exams.filters.sort_questions')}</option>
                        </select>
                        <button onClick={() => updateFilter('sort_order', filters.sort_order === 'asc' ? 'desc' : 'asc')} className={`btn btn-sm btn-square rounded-xl border border-base-content/10 bg-base-content/[0.03] ${filters.sort_order === 'desc' ? '' : 'rotate-180'}`}>
                            <ChevronDown size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================
// Main ExamsPage Component
// ============================================

export const ExamsPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;

    // View State
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 4;

    // Exam Configuration
    const [config, setConfig] = useState<ExamConfig>({ ...DEFAULT_CONFIG });
    const [filters, setFilters] = useState<ExamFilters>({ ...DEFAULT_FILTERS });
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Data (using mock data - replace with real hooks)
    const subjects = MOCK_SUBJECTS;
    const tags = MOCK_TAGS;
    const [exams, setExams] = useState(MOCK_EXAMS);
    const userStats = MOCK_USER_STATS;

    // Filtered Exams logic
    const filteredExams = useMemo(() => {
        return exams.filter(e => {
            const matchesSearch = !filters.search ||
                e.title.toLowerCase().includes(filters.search.toLowerCase()) ||
                (e.subject_name?.toLowerCase().includes(filters.search.toLowerCase()) ?? false);

            const matchesSubject = !filters.subject_id || e.subject_id === filters.subject_id;

            const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(e.status);

            const score = e.score ?? 0;
            let matchesScore = true;
            if (filters.score_range !== 'all') {
                if (filters.score_range === 'excellent') matchesScore = score >= 90;
                else if (filters.score_range === 'good') matchesScore = score >= 80 && score < 90;
                else if (filters.score_range === 'pass') matchesScore = score >= 60 && score < 80;
                else if (filters.score_range === 'fail') matchesScore = score < 60;
            }

            return matchesSearch && matchesSubject && matchesStatus && matchesScore;
        }).sort((a, b) => {
            if (filters.sort_by === 'date') {
                const da = new Date(a.start_time).getTime();
                const db = new Date(b.start_time).getTime();
                return filters.sort_order === 'desc' ? db - da : da - db;
            }
            if (filters.sort_by === 'score') {
                const sa = a.score ?? 0;
                const sb = b.score ?? 0;
                return filters.sort_order === 'desc' ? sb - sa : sa - sb;
            }
            return 0;
        });
    }, [exams, filters]);

    // Dynamic Stats based on filtered data
    const dynamicStats = useMemo(() => {
        if (filteredExams.length === 0) return userStats;
        const completed = filteredExams.filter(e => e.status === 'completed');
        const avgScore = completed.length > 0
            ? Math.round(completed.reduce((acc, curr) => acc + (curr.score ?? 0), 0) / completed.length)
            : 0;

        return {
            ...userStats,
            total_exams: filteredExams.length,
            average_score: avgScore
        };
    }, [filteredExams, userStats]);

    // Find in-progress exam
    const inProgressExam = useMemo(() => exams.find(e => e.status === 'in_progress'), [exams]);

    // Calculate available questions based on config
    const availableCount = useMemo(() => {
        if (config.subject_ids.length === 0) return 0;

        // Mock filtering logic for demonstration
        let count = config.subject_ids.length * 25; // Base questions per subject

        // Apply tag filter mock reduction
        if (config.tag_ids.length > 0) {
            const tagFactor = config.tag_logic === 'AND' ? 0.4 : 0.8;
            count = Math.floor(count * Math.pow(tagFactor, Math.min(2, config.tag_ids.length)));
        }

        // Difficulty filter mock reduction
        if (config.difficulty.length < 3) {
            count = Math.floor(count * (config.difficulty.length / 3));
        }

        return Math.max(5, Math.min(200, count));
    }, [config.subject_ids, config.tag_ids, config.tag_logic, config.difficulty]);

    const setupStats = useMemo(() => ({
        count: availableCount,
        subjects: config.subject_ids.length,
        estimatedTime: Math.min(availableCount, config.question_count) * 2
    }), [availableCount, config.subject_ids.length, config.question_count]);

    // Auto-generate title when subjects change
    useEffect(() => {
        if (config.subject_ids.length > 0 && !config.title) {
            setConfig(prev => ({ ...prev, title: generateExamTitle(subjects, prev, t, lang) }));
        }
    }, [config.subject_ids, subjects, t, lang]);

    // Wizard Navigation
    const nextStep = useCallback(() => {
        if (currentStep === 1 && config.subject_ids.length === 0) return;
        setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }, [currentStep, config.subject_ids.length, totalSteps]);

    const prevStep = useCallback(() => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
    }, []);

    const goToStep = useCallback((step: number) => {
        if (step < currentStep) setCurrentStep(step);
    }, [currentStep]);

    // Actions
    const handleStartCreate = useCallback(() => {
        setConfig({ ...DEFAULT_CONFIG });
        setCurrentStep(1);
        setViewMode('create');
    }, []);

    // Expose for EmptyState in sub-components
    useEffect(() => {
        (window as any).examsPageOnStartCreate = handleStartCreate;
        return () => { delete (window as any).examsPageOnStartCreate; };
    }, [handleStartCreate]);

    const handleQuickStart = useCallback((template: QuickStartTemplate) => {
        setConfig({ ...DEFAULT_CONFIG, ...template.config });
        setCurrentStep(1);
        setViewMode('create');
    }, []);

    const handleCancelCreate = useCallback(() => {
        setViewMode('dashboard');
        setCurrentStep(1);
    }, []);

    const handleGenerateExam = useCallback(() => {
        console.log('Generating exam with config:', config);
        setViewMode('dashboard');
    }, [config]);

    const handleExamClick = useCallback((exam: ExamRecord) => {
        console.log('View exam:', exam.id);
    }, []);

    const handleToggleFavorite = useCallback((examId: string) => {
        setExams(prev => prev.map(e => e.id === examId ? { ...e, is_favorite: !e.is_favorite } : e));
    }, []);

    const handleAbandonExam = useCallback((exam: ExamRecord) => {
        setExams(prev => prev.map(e => e.id === exam.id ? { ...e, status: 'abandoned' } : e));
    }, []);

    const handleContinueExam = useCallback((exam: ExamRecord) => {
        console.log('Continue exam:', exam.id);
        // In a real app, this would navigate to the review/exam session
    }, []);


    // Render Wizard Step
    const renderWizardStep = () => {
        switch (currentStep) {
            case 1: return <WizardStep1 config={config} setConfig={setConfig} subjects={subjects} />;
            case 2: return <WizardStep2 config={config} setConfig={setConfig} tags={tags} />;
            case 3: return <WizardStep3 config={config} setConfig={setConfig} availableCount={availableCount} />;
            case 4: return <WizardStep4 config={config} setConfig={setConfig} stats={setupStats} subjects={subjects} />;
            default: return null;
        }
    };

    // Dashboard View
    if (viewMode === 'dashboard') {
        return (
            <div className="p-4 md:p-8 lg:p-10">
                <div className="max-w-7xl mx-auto w-full space-y-6 reveal-smooth">
                    {/* Compact Header */}
                    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <ClipboardList className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-base-content/90 tracking-tight">{t('exams.header.title')}</h1>
                                <p className="text-[10px] se-dim font-medium">{t('exams.header.subtitle')}</p>
                            </div>
                        </div>
                        <button onClick={handleStartCreate} className="btn btn-primary btn-sm rounded-xl gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all se-interactive">
                            <FilePlus className="w-4 h-4" />
                            {t('exams.header.btn_create')}
                        </button>
                    </header>

                    {/* In-Progress Banner (Compact) */}
                    {inProgressExam && (
                        <InProgressBanner
                            exam={inProgressExam}
                            onContinue={() => handleContinueExam(inProgressExam)}
                            onAbandon={() => handleAbandonExam(inProgressExam)}
                        />
                    )}

                    {/* Stats Row - Full Width */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <StatCard
                            label={t('exams.stats.total_exams')}
                            value={dynamicStats.total_exams}
                            icon={ClipboardList}
                            color="text-primary"
                            tooltip={t('exams.stats.total_exams_tooltip')}
                        />
                        <StatCard
                            label={t('exams.stats.avg_score')}
                            value={dynamicStats.average_score}
                            icon={Trophy}
                            color="text-warning"
                            trend={{ value: dynamicStats.improvement_rate, positive: true }}
                            tooltip={t('exams.stats.avg_score_tooltip')}
                        />
                        <StatCard
                            label={t('exams.stats.streak')}
                            value={t('exams.milestone.streak_unit', { count: dynamicStats.streak_days })}
                            icon={Flame}
                            color="text-error"
                            tooltip={t('exams.stats.streak_tooltip')}
                        />
                        <StatCard
                            label={t('exams.stats.total_time')}
                            value={formatDurationLong(dynamicStats.total_time_minutes, t)}
                            icon={Timer}
                            color="text-info"
                            tooltip={t('exams.stats.total_time_tooltip')}
                        />
                        <StatCard
                            label={t('exams.stats.weak_subjects')}
                            value={dynamicStats.weak_subjects.join(', ')}
                            icon={AlertCircle}
                            color="text-error"
                            tooltip={t('exams.stats.weak_subjects_tooltip')}
                        />
                    </div>

                    {/* Quick Start - Full Width */}
                    <div className="glass-card-premium p-4 border-none bg-base-content/[0.02]">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-black text-base-content/60 uppercase tracking-widest">{t('exams.create.quick_start')}</h2>
                            <button onClick={handleStartCreate} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5 se-interactive">
                                {t('exams.create.custom_config')} <ChevronRight size={12} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {getQuickStartTemplates(t).map(template => (
                                <CompactQuickStartCard
                                    key={template.id}
                                    template={template}
                                    onClick={() => handleQuickStart(template)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* History Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h2 className="text-lg font-black text-base-content/80 flex items-center gap-2 shrink-0">
                                <History className="w-5 h-5 se-muted" />
                                {t('exams.list.title')}
                            </h2>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 justify-end">
                                <div className="relative group/srch min-w-[240px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/20 group-focus-within/srch:text-primary transition-all" />
                                    <input
                                        id="exam-history-search"
                                        name="history_search"
                                        type="text"
                                        aria-label={t('exams.history.search_placeholder')}
                                        value={filters.search}
                                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                        placeholder={t('exams.history.search_placeholder')}
                                        autoComplete="off"
                                        className="input input-sm h-10 w-full pl-10 bg-base-content/[0.03] border-base-content/5 rounded-xl focus:border-primary/20 focus:bg-primary/[0.01] transition-all"
                                    />
                                </div>
                                <div className="flex p-1 bg-base-content/5 rounded-xl gap-0.5">
                                    {(['all', 'completed', 'in_progress', 'abandoned'] as const).map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setFilters(prev => ({ ...prev, statuses: f === 'all' ? [] : [f] }))}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                                                (f === 'all' ? filters.statuses.length === 0 : (filters.statuses.length === 1 && filters.statuses[0] === f))
                                                    ? "bg-primary text-white shadow-md shadow-primary/20"
                                                    : "text-base-content/40 hover:text-base-content/60"
                                            )}
                                        >
                                            {f === 'all' ? t('common.general.all') : t(`common.status.${f}`)}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                    className={cn(
                                        "btn btn-sm h-10 px-4 rounded-xl gap-2 transition-all se-interactive",
                                        showAdvancedFilters ? "btn-primary shadow-lg shadow-primary/20" : "bg-base-content/5 border-none hover:bg-base-content/10"
                                    )}
                                >
                                    <Filter className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{t('exams.filters.title')}</span>
                                </button>
                            </div>
                        </div>

                        {showAdvancedFilters && (
                            <AdvancedFiltersPanel
                                filters={filters}
                                setFilters={setFilters}
                                subjects={subjects}
                                onClose={() => setShowAdvancedFilters(false)}
                            />
                        )}

                        <div className="space-y-3">
                            <ExamHistoryList
                                exams={filteredExams}
                                onExamsClick={handleExamClick}
                                onToggleFavorite={handleToggleFavorite}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Create Wizard View
    return (
        <div className="p-4 md:p-8 lg:p-10">
            <div className="max-w-7xl mx-auto w-full space-y-8 reveal-smooth">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={handleCancelCreate} className="btn btn-ghost btn-square rounded-xl se-interactive">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-base-content/90 tracking-tight">{t('exams.create.title')}</h1>
                            <p className="text-[10px] se-dim font-medium uppercase tracking-[0.2em]">{t('exams.create.step_info', { current: currentStep, total: totalSteps })}</p>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left: Wizard Form */}
                    <div className="lg:col-span-3 flex flex-col">
                        <div className="glass-card-premium overflow-hidden flex-1 flex flex-col border-none shadow-2xl">
                            <WizardProgress currentStep={currentStep} totalSteps={totalSteps} onStepClick={goToStep} />
                            <div className="p-8 flex-1 min-h-[400px]">
                                {renderWizardStep()}
                            </div>

                            {/* Navigation */}
                            <div className="px-8 py-6 bg-base-content/[0.02] border-t border-base-content/5 flex items-center justify-between">
                                <button
                                    onClick={prevStep}
                                    disabled={currentStep === 1}
                                    className="btn btn-ghost rounded-xl gap-2 disabled:opacity-30 se-interactive font-black uppercase text-[10px] tracking-widest"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    {t('exams.wizard.nav.prev')}
                                </button>

                                {currentStep < totalSteps ? (
                                    <button
                                        onClick={nextStep}
                                        disabled={currentStep === 1 && config.subject_ids.length === 0}
                                        className="btn btn-primary px-8 rounded-xl gap-2 shadow-xl shadow-primary/20 disabled:opacity-50 se-interactive font-black uppercase text-[10px] tracking-widest"
                                    >
                                        {t('exams.wizard.nav.next')}
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleGenerateExam}
                                        disabled={availableCount === 0}
                                        className="btn btn-primary px-10 rounded-xl gap-2 shadow-xl shadow-primary/20 disabled:opacity-50 se-interactive font-black uppercase text-[10px] tracking-widest"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        {t('exams.create.btn_generate')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Preview Panel */}
                    <div className="lg:col-span-2">
                        <div className="sticky top-8">
                            <LiveStatsPanel
                                config={config}
                                subjects={subjects}
                                tags={tags}
                                availableCount={availableCount}
                                currentStep={currentStep}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
