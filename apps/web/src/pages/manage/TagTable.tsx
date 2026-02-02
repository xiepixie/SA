import { Hash, Edit3, Trash2, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityBadge } from '../../components/ui/EntityBadge';

// Import shared type from central API layer
import { type Tag } from '../../app/api/views';
export type { Tag } from '../../app/api/views';

interface TagTableProps {
    tags: Tag[];
    onEdit: (tag: Tag) => void;
    onDelete: (tag: Tag) => void;
}

export const TagTable: React.FC<TagTableProps> = ({ tags, onEdit, onDelete }) => {
    const { t } = useTranslation();


    return (
        <div className="manage-card p-0 overflow-hidden border-none shadow-xl bg-base-100/40 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
            <div className="overflow-x-auto">
                <table className="table table-md w-full">
                    <thead className="bg-base-content/5">
                        <tr className="border-b-base-content/10">
                            <th className="px-6 py-4 text-[10px] font-black text-base-content/40 uppercase tracking-[0.2em]">{t('manage.tags.col_name')}</th>
                            <th className="px-6 py-4 text-[10px] font-black text-base-content/40 uppercase tracking-[0.2em]">{t('common.actions.type')}</th>
                            <th className="px-6 py-4 text-[10px] font-black text-base-content/40 uppercase tracking-[0.2em]">{t('manage.tags.col_count')}</th>
                            <th className="px-6 py-4 text-[10px] font-black text-base-content/40 uppercase tracking-[0.2em] text-right">{t('common.actions.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-base-content/5">
                        {tags.map((tag) => (
                            <tr key={tag.id} className="manage-table-row group">
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-4">
                                        <EntityBadge
                                            name={tag.name}
                                            color={tag.color}
                                            size="md"
                                            showHash
                                        />
                                        <span className="text-[9px] font-black text-base-content/15 uppercase tracking-[0.2em] ml-1">
                                            ID: {tag.id.slice(0, 8)}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-2 text-base-content/40">
                                        <div className="w-6 h-6 flex items-center justify-center rounded-md border border-base-content/5 bg-base-content/[0.03]">
                                            <FolderOpen className="w-3 h-3" />
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em]">{t('manage.tabs.subjects')}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1.5 min-w-[140px]">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] font-black text-base-content/40 uppercase tracking-tight">
                                                {tag.nodeCount || 0} {t('manage.subjects.questions')}
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-base-content/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary/50 transition-all duration-500"
                                                style={{ width: `${Math.min((tag.nodeCount || 0) * 10, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                        <button
                                            onClick={() => onEdit(tag)}
                                            className="btn btn-ghost btn-sm h-9 w-9 p-0 rounded-xl bg-base-100/50 hover:bg-primary hover:text-primary-content shadow-sm transition-all"
                                            title={t('common.actions.edit')}
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => onDelete(tag)}
                                            className="btn btn-ghost btn-sm h-9 w-9 p-0 rounded-xl bg-base-100/50 hover:bg-error hover:text-error-content shadow-sm transition-all"
                                            title={t('common.actions.delete')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {tags.length === 0 && (
                <div className="p-20 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-base-content/5 flex items-center justify-center mx-auto text-base-content/20">
                        <Hash className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-black text-base-content/20 uppercase tracking-widest">{t('manage.tags.empty')}</p>
                </div>
            )}
        </div>
    );
};
