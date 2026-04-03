import React from 'react';
import { useNoteReferences } from '../../../queries/notes';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { FileText, Link as LinkIcon, ExternalLink, Calendar, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../app/utils/cn';

interface BacklinksListProps {
    questionId?: string;
    noteId?: string;
    variant?: 'panel' | 'document';
}

export const BacklinksList: React.FC<BacklinksListProps> = ({ questionId, noteId, variant = 'panel' }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data, isLoading } = useNoteReferences({
        targetQuestionId: questionId,
        targetNoteId: noteId
    });
    const references = data?.items || [];

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-30">
                <span className="loading loading-spinner loading-md"></span>
                <span className="text-[10px] font-bold uppercase tracking-widest">{t('notes.backlinks.fetching', 'Fetching Connections')}</span>
            </div>
        );
    }

    if (references.length === 0) {
        if (variant === 'document') return null;

        return (
            <div className="text-center py-16 px-6 opacity-40 flex flex-col items-center gap-4 bg-base-content/[0.02] rounded-2xl border border-dashed border-base-content/10">
                <div className="w-12 h-12 rounded-full bg-base-content/5 flex items-center justify-center">
                    <LinkIcon size={20} className="opacity-40" />
                </div>
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-base-content/60">{t('notes.backlinks.empty_title', 'No Connections Yet')}</p>
                    <p className="text-[10px] leading-relaxed max-w-[180px] mx-auto opacity-60">
                        {t('notes.backlinks.empty_desc', 'Mention this question in a notebook to see linked thoughts here.')}
                    </p>
                </div>
            </div>
        );
    }

    if (variant === 'document') {
        return (
            <div className="pt-10 border-t border-base-content/10">
                <h3 className="text-xl font-bold mb-8 text-base-content/80 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <LinkIcon size={16} className="text-primary" />
                    </div>
                    {t('notes.backlinks.linked_in', { count: references.length })}
                </h3>
                <div className="pl-4 ml-4 border-l-2 border-base-content/5 space-y-8">
                    {references.map((ref: any) => (
                        <div
                            key={ref.id}
                            onClick={() => {
                                const sourceId = ref.source_note_id;
                                if (sourceId) navigate(`/notebook?noteId=${sourceId}`);
                            }}
                            className="cursor-pointer group relative"
                        >
                            <div className="absolute -left-[23px] top-1 w-2 h-2 rounded-full bg-base-content/20 group-hover:bg-primary transition-colors group-hover:scale-150 duration-300" />
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-sm font-bold text-base-content/80 group-hover:text-primary transition-colors">
                                    {ref.notes?.title || t('notes.backlinks.untitled', 'Untitled Note')}
                                </span>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-base-content/5 text-[10px] uppercase font-bold tracking-widest text-base-content/40 opacity-0 transition-all duration-300 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0">
                                    <ExternalLink size={10} />
                                    <span>跳转</span>
                                </div>
                                <span className="text-xs font-mono text-base-content/30 ml-auto group-hover:text-base-content/50 transition-colors">
                                    {formatDistanceToNow(new Date(ref.created_at), { addSuffix: true })}
                                </span>
                            </div>

                            {ref.target_part ? (
                                <p className="text-base text-base-content/60 leading-relaxed pl-5 border-l-[3px] border-primary/20 bg-primary/[0.015] py-3 pr-4 rounded-r-xl group-hover:bg-primary/[0.04] group-hover:border-primary/40 group-hover:text-base-content/80 transition-all duration-300">
                                    “... {ref.target_part} ...”
                                </p>
                            ) : (
                                <p className="text-sm text-base-content/40 italic pl-5 py-2">
                                    {t('notes.backlinks.no_context', '仅直接引用，无上下文。')}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30">
                    {t('notes.backlinks.linked_in', { count: references.length })}
                </span>
            </div>

            <div className="grid gap-3">
                {references.map((ref: any) => (
                    <div
                        key={ref.id}
                        onClick={() => {
                            const sourceId = ref.source_note_id;
                            if (sourceId) {
                                // Navigate to the notebook page with this note
                                navigate(`/notebook?noteId=${sourceId}`);
                            }
                        }}
                        className={cn(
                            "group se-interactive bg-base-200/30 backdrop-blur-sm border border-base-content/5 p-4 rounded-2xl",
                            "hover:bg-primary/5 hover:border-primary/20 hover:scale-[1.02] transition-all duration-300",
                            "cursor-pointer shadow-sm hover:shadow-md"
                        )}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="mt-0.5 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <FileText size={16} className="text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-base-content/80 truncate mb-0.5 group-hover:text-primary transition-colors">
                                        {ref.notes?.title || t('notes.backlinks.untitled', 'Untitled Note')}
                                    </h4>
                                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider opacity-30">
                                        <Hash size={10} />
                                        <span>{ref.notes?.type === 'GLOBAL' ? t('notes.backlinks.type_notebook', 'Notebook') : t('notes.backlinks.type_observation', 'Observation')}</span>
                                    </div>
                                </div>
                            </div>
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-40 transition-opacity mt-1 shrink-0" />
                        </div>

                        {ref.target_part && (
                            <div className="mb-3 p-2.5 rounded-xl bg-base-content/[0.03] border border-base-content/5">
                                <span className="text-[10px] font-mono text-primary/60 block mb-1 uppercase tracking-tight font-black opacity-50">
                                    {t('notes.backlinks.context_snippet', 'Contextual Evidence')}
                                </span>
                                <p className="text-[11px] leading-relaxed text-base-content/60 line-clamp-2 italic">
                                    “{ref.target_part}”
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-end px-1 border-t border-base-content/5 pt-3">
                            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] opacity-20 group-hover:opacity-40 transition-opacity">
                                <Calendar size={10} />
                                <span>{formatDistanceToNow(new Date(ref.created_at), { addSuffix: true })}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
