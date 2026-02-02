import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../app/state/useAppStore';
import { QuestionRenderer } from '../components/review/QuestionRenderer';
import { MarkdownRenderer } from '../components/LatexRenderer';
import {
    Edit3,
    Share2,
    GitFork,
    MoreVertical,
    Tag,
    ChevronLeft,
    History,
    Zap,
    Scale,
    Activity,
    Brain,
    Database,
    Clock,
    CheckCircle2,
    XCircle
} from 'lucide-react';

export const QuestionDetailPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { t } = useTranslation();
    const [activeLayer, setActiveLayer] = useState<'asset' | 'state'>('asset');

    // Data Hook
    const questions = useAppStore(s => s.entities.questions);
    const assets = useAppStore(s => s.entities.assets);

    const question = useMemo(() => {
        if (!id) return null;
        return questions[id] || null;
    }, [id, questions]);

    const subject = useMemo(() => {
        if (!question?.subject_id) return null;
        return assets[question.subject_id] || null;
    }, [question?.subject_id, assets]);

    const [userAnswer, setUserAnswer] = useState<any>(null);
    const [isRevealed, setIsRevealed] = useState(false);

    // Initial state sync
    React.useEffect(() => {
        if (question?.question_type === 'fill_blank') {
            setUserAnswer([]);
        } else {
            setUserAnswer(null);
        }
        setIsRevealed(false);
    }, [id, question?.question_type]);

    if (!question) {
        return (
            <div className="flex flex-col items-center justify-center p-20 opacity-40">
                <Brain className="w-20 h-20 mb-6 animate-pulse" />
                <h2 className="text-xl font-black uppercase tracking-widest">{t('detail.error.not_found')}</h2>
                <button onClick={() => navigate('/questions')} className="mt-4 btn btn-primary px-10 rounded-xl">
                    {t('detail.error.btn_back')}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-full p-4 md:p-12">
            <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 reveal-smooth">
                {/* Context Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="group flex items-center gap-2 text-base-content/40 hover:text-primary transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t('detail.header.exit')}</span>
                    </button>
                    <div className="flex gap-2">
                        <button className="btn btn-ghost btn-xs rounded-lg border border-base-content/5 text-[9px] font-black uppercase tracking-widest px-3">
                            <Share2 className="w-3 h-3 mr-2" /> {t('detail.header.btn_share')}
                        </button>
                        <button className="btn btn-ghost btn-xs rounded-lg border border-base-content/5 text-[9px] font-black uppercase tracking-widest px-3">
                            <MoreVertical className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Main Stage */}
                <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-8">
                    {/* Left Side: The "Asset" or "Work" Area */}
                    <div className="space-y-6">
                        <div className="glass-card p-10 min-h-[500px] space-y-8 relative overflow-hidden">
                            {/* Layer Watermark */}
                            <div className="absolute top-8 right-10 text-[10px] font-black text-base-content/10 uppercase tracking-[1em] select-none rotate-90 origin-right">
                                {activeLayer === 'asset'
                                    ? t('detail.main.asset_watermark')
                                    : t('detail.main.state_watermark')
                                }
                            </div>

                            {/* Question Content */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="badge badge-primary badge-sm font-black text-[9px] uppercase tracking-tighter">
                                            {subject?.name || 'GEN.'}
                                        </span>
                                        <span className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest se-mono">
                                            ID: {id?.slice(0, 12)}
                                        </span>
                                    </div>
                                    <h1 className="text-3xl font-black text-base-content/90 leading-tight tracking-tight">
                                        <MarkdownRenderer content={question.title} className="inline" />
                                    </h1>
                                </div>

                                <div className="prose prose-sm max-w-none text-base-content/70 font-medium leading-relaxed">
                                    <MarkdownRenderer content={question.content} />
                                </div>
                            </div>

                            {/* Interactive Area */}
                            <div className="pt-8 border-t border-base-content/5 space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[10px] font-black opacity-40 uppercase tracking-widest text-primary">
                                        <Zap size={14} className="animate-pulse" /> {t('detail.main.interactive_preview')}
                                    </div>
                                    <button
                                        onClick={() => setIsRevealed(!isRevealed)}
                                        className={`btn btn-xs rounded-lg transition-all ${isRevealed ? 'btn-primary' : 'btn-ghost bg-primary/10 text-primary hover:bg-primary/20'}`}
                                    >
                                        {isRevealed ? 'Reset' : 'Reveal Answer'}
                                    </button>
                                </div>

                                <div className="glass-inline p-8 border-white/5 bg-base-content/[0.01] rounded-3xl min-h-[120px] shadow-sm">
                                    <QuestionRenderer
                                        question={question}
                                        userAnswer={userAnswer}
                                        setUserAnswer={setUserAnswer}
                                        isRevealed={isRevealed}
                                        onReveal={() => setIsRevealed(true)}
                                    />
                                </div>
                            </div>

                            {/* Analysis & Tags */}
                            <div className="pt-8 border-t border-base-content/5 space-y-6">
                                <div className="flex flex-wrap gap-2">
                                    {(question.tags || []).map((tag: string) => (
                                        <span key={tag} className="px-3 py-1.5 rounded-xl bg-base-300 text-base-content/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 se-lift">
                                            <Tag className="w-3 h-3" /> {tag}
                                        </span>
                                    ))}
                                    <button className="px-3 py-1.5 rounded-xl border border-dashed border-base-content/20 text-base-content/20 hover:border-primary/50 hover:text-primary transition-all text-[10px] font-black uppercase tracking-widest">
                                        + Add Tag
                                    </button>
                                </div>
                            </div>

                            {/* Action Bar */}
                            <div className="flex gap-4 pt-4">
                                <button className="btn btn-primary btn-lg rounded-2xl px-10 shadow-xl shadow-primary/20">
                                    <Edit3 className="w-5 h-5 mr-3" /> {t('detail.actions.edit')}
                                </button>
                                <button className="btn btn-ghost btn-lg rounded-2xl px-8 hover:bg-base-content/5 border border-transparent hover:border-base-content/5">
                                    <GitFork className="w-5 h-5 mr-3" /> {t('detail.actions.fork')}
                                </button>
                            </div>
                        </div>

                        {/* Quick Analytics Mini Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MiniStat label={t('detail.metrics.success')} value="64%" icon={Activity} />
                            <MiniStat label={t('detail.metrics.forks')} value="1.2k" icon={GitFork} />
                            <MiniStat label={t('detail.metrics.time')} value="4.2m" icon={Clock} />
                            <MiniStat label={t('detail.metrics.integrity')} value="98%" icon={ShieldCheckIcon} />
                        </div>
                    </div>

                    {/* Right Side: Navigation & User State */}
                    <div className="space-y-6">
                        {/* Layer Switcher */}
                        <div className="flex p-1.5 bg-base-300 rounded-[2rem] border border-base-content/5 relative overflow-hidden group">
                            <button
                                onClick={() => setActiveLayer('asset')}
                                className={`flex-1 h-14 rounded-[1.8rem] flex items-center justify-center gap-3 transition-all duration-500 z-10 ${activeLayer === 'asset' ? 'bg-base-100 text-primary shadow-xl font-black' : 'text-base-content/30 font-bold hover:text-base-content/60'}`}
                            >
                                <Database className="w-4 h-4" />
                                <span className="text-[10px] uppercase tracking-widest">{t('detail.main.tab_asset')}</span>
                            </button>
                            <button
                                onClick={() => setActiveLayer('state')}
                                className={`flex-1 h-14 rounded-[1.8rem] flex items-center justify-center gap-3 transition-all duration-500 z-10 ${activeLayer === 'state' ? 'bg-base-100 text-primary shadow-xl font-black' : 'text-base-content/30 font-bold hover:text-base-content/60'}`}
                            >
                                <Brain className="w-4 h-4" />
                                <span className="text-[10px] uppercase tracking-widest">{t('detail.main.tab_state')}</span>
                            </button>
                        </div>

                        {/* Content Projection */}
                        <div className="glass-card flex-1 p-8 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                            {activeLayer === 'asset' ? (
                                <div className="space-y-8">
                                    <SectionHeader title={t('detail.lineage.title')} />
                                    <div className="space-y-6">
                                        <LineageItem label={t('detail.lineage.created_by')} value="Nexus_Core" time="2023-11-12" />
                                        <LineageItem label={t('detail.lineage.last_update')} value="OpenMemory" time="2h ago" />
                                        <LineageItem label={t('detail.lineage.revision')} value="v4.2.0-stable" time="Patch 8" />
                                    </div>
                                    <div className="p-6 bg-info/5 rounded-2xl border border-info/10 space-y-3">
                                        <div className="flex items-center gap-2 text-info">
                                            <Scale className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{t('detail.lineage.legal_status')}</span>
                                        </div>
                                        <p className="text-xs font-medium text-base-content/60 leading-relaxed">
                                            {t('detail.lineage.license')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-10">
                                    <SectionHeader title={t('detail.fsrs.title')} />

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-base-content/30 uppercase tracking-widest">{t('detail.fsrs.due_date')}</p>
                                            <p className="text-xl font-black text-primary tracking-tight">In 4 Cycles</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-base-content/30 uppercase tracking-widest">{t('detail.fsrs.stability_index')}</p>
                                            <p className="text-xl font-black text-base-content/90 tracking-tight">14.2 Days</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1 text-base-content/30">
                                            <span>{t('detail.fsrs.retention')}</span>
                                            <span className="text-success">94%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-base-content/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-success w-[94%] shadow-[0_0_10px_rgba(var(--color-success)/0.5)]" />
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-base-content/5 space-y-6">
                                        <h4 className="text-[10px] font-black text-base-content/30 uppercase tracking-[0.2em]">{t('detail.history.title')}</h4>
                                        <div className="space-y-4">
                                            <HistoryEvent icon={CheckCircle2} label="Rating: Good" time="2 days ago" color="text-success" />
                                            <HistoryEvent icon={CheckCircle2} label="Rating: Easy" time="15 days ago" color="text-success" />
                                            <HistoryEvent icon={XCircle} label="Rating: Again" time="21 days ago" color="text-error" />
                                        </div>
                                    </div>

                                    <button className="btn btn-ghost w-full rounded-2xl border-base-content/5 text-[10px] font-black uppercase tracking-widest py-6">
                                        <History className="w-4 h-4 mr-3 opacity-30" />
                                        {t('detail.history.btn_audit')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Quick Access Card */}
                        <div className="glass-card p-6 bg-primary/10 border-primary/20 flex items-center justify-between group cursor-pointer hover:bg-primary/20 transition-all">
                            <div className="flex items-center gap-4">
                                <Zap className="w-6 h-6 text-primary animate-pulse" />
                                <div className="space-y-0.5">
                                    <p className="text-sm font-black text-base-content tracking-tight">{t('detail.focus.title')}</p>
                                    <p className="text-[9px] font-bold text-primary/60 uppercase">{t('detail.focus.desc')}</p>
                                </div>
                            </div>
                            <Edit3 className="w-4 h-4 text-primary/40 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function MiniStat({ label, value, icon: Icon }: { label: string, value: string, icon: any }) {
    return (
        <div className="glass-card p-4 flex flex-col items-center justify-center gap-2 text-center group hover:bg-base-200/50 transition-all">
            <Icon className="w-4 h-4 text-base-content/20 group-hover:text-primary transition-colors" />
            <div className="space-y-0.5">
                <p className="text-sm font-black text-base-content/90 tracking-tight">{value}</p>
                <p className="text-[8px] font-black text-base-content/30 uppercase tracking-[0.1em]">{label}</p>
            </div>
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <h5 className="text-[10px] font-black text-base-content/40 uppercase tracking-[0.3em] pb-2 border-b border-base-content/5">{title}</h5>
    );
}

function LineageItem({ label, value, time }: { label: string, value: string, time: string }) {
    return (
        <div className="flex justify-between items-center group">
            <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-base-content/20 uppercase tracking-widest">{label}</p>
                <p className="text-sm font-black text-base-content/80 group-hover:text-primary transition-colors">{value}</p>
            </div>
            <p className="text-[9px] font-bold text-base-content/30 uppercase">{time}</p>
        </div>
    );
}

function HistoryEvent({ icon: Icon, label, time, color }: { icon: any, label: string, time: string, color: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs font-bold text-base-content/70">{label}</span>
            </div>
            <span className="text-[10px] font-bold text-base-content/20 uppercase">{time}</span>
        </div>
    );
}

const ShieldCheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);
