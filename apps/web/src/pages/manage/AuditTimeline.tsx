import { History, RotateCcw, AlertCircle, Info, ArrowUpRight, Ban, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';

interface AuditLog {
    id: string;
    action: string;
    target: string;
    user: string;
    time: string;
    undoable: boolean;
}

interface AuditTimelineProps {
    logs: AuditLog[];
    onUndo?: (log: AuditLog) => void;
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ logs, onUndo }) => {
    const { t } = useTranslation();

    const getActionMeta = (action: string) => {
        const a = action.toUpperCase();
        if (a.includes('DELETE')) return { icon: Ban, color: 'text-rose-500', bg: 'bg-rose-500/[0.08]', border: 'border-rose-500/20', label: t('manage.audit_tab.actions.delete') };
        if (a.includes('CREATE')) return { icon: Plus, color: 'text-emerald-500', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20', label: t('manage.audit_tab.actions.create') };
        if (a.includes('UPDATE')) return { icon: RotateCcw, color: 'text-sky-500', bg: 'bg-sky-500/[0.08]', border: 'border-sky-500/20', label: t('manage.audit_tab.actions.update') };
        if (a.includes('MERGE')) return { icon: ArrowUpRight, color: 'text-amber-500', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20', label: t('manage.audit_tab.actions.merge') };
        return { icon: Info, color: 'text-primary', bg: 'bg-primary/[0.08]', border: 'border-primary/20', label: t('manage.audit_tab.actions.default') };
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            {/* Context Warning */}
            <div className="flex items-start gap-4 p-5 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-500/80">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest">{t('manage.audit_tab.warning_title') || 'Data Sovereignty Notice'}</p>
                    <p className="text-[11px] font-bold leading-relaxed opacity-80">
                        {t('manage.audit_tab.warning') || 'Audit logs are immutable. Deletions are soft by default but persistent in history. Use Revert cautiously.'}
                    </p>
                </div>
            </div>

            <div className="audit-timeline">
                {logs.length === 0 ? (
                    <div className="p-16 text-center manage-card border-dashed">
                        <History className="w-10 h-10 text-base-content/10 mx-auto mb-4" />
                        <p className="text-sm font-black text-base-content/20 uppercase tracking-widest">{t('manage.audit_tab.empty')}</p>
                    </div>
                ) : (
                    <div className="space-y-0">
                        {logs.map((log) => {
                            const meta = getActionMeta(log.action);
                            const Icon = meta.icon as any;
                            const date = new Date(log.time);
                            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

                            return (
                                <div key={log.id} className="audit-item group">
                                    <div
                                        className="audit-dot group-hover:scale-125 transition-transform"
                                        style={{ borderColor: `var(--color-${meta.color.split('-')[1]})` }}
                                    />

                                    <div className="manage-card flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6 hover:bg-base-content/[0.03] border-base-content/[0.04] translate-x-2 group-hover:translate-x-3 transition-transform">
                                        <div className="flex items-center gap-5">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border shadow-sm", meta.bg, meta.color, meta.border)}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-current/10", meta.bg, meta.color)}>{meta.label}</span>
                                                    <span className="text-[10px] font-bold text-base-content/25 uppercase tabular-nums tracking-tighter">{log.action}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-base-100/50 border-base-content/10 transition-colors w-fit">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-base-content/20" />
                                                    <span className="text-[11px] font-black uppercase tracking-wider text-base-content/60">
                                                        {log.target}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 border-base-content/5 pt-3 md:pt-0">
                                            <div className="text-right flex flex-col items-end gap-1.5">
                                                <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-base-content/5 bg-base-content/[0.02]">
                                                    <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                                                        <span className="text-[8px] font-black text-primary uppercase">{log.user.charAt(0)}</span>
                                                    </div>
                                                    <span className="text-[9px] font-black text-base-content/60 uppercase tracking-widest">{log.user.split('@')[0]}</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-base-content/20 uppercase tabular-nums">
                                                    {dateStr} • {timeStr}
                                                </span>
                                            </div>

                                            {log.undoable && onUndo && (
                                                <button
                                                    onClick={() => onUndo(log)}
                                                    className="btn btn-ghost btn-sm h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary/5 hover:bg-primary hover:text-primary-content border border-primary/10 transition-all active:scale-95"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5 mr-2" />
                                                    {t('manage.audit_tab.btn_revert')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
