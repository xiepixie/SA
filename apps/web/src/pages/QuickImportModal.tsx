import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { v2Api } from '../app/api/views';
import { supabase } from '../lib/supabase';
import { X, CheckCircle, AlertTriangle, FileText, Loader2 } from 'lucide-react';

interface QuickImportModalProps {
    onClose: () => void;
    onNavigateToFullImport?: () => void;
}

// 简单校验
function validateQuestions(questions: any[], t?: (k: string, options?: any) => string): { valid: any[]; errors: string[] } {
    const valid: any[] = [];
    const errors: string[] = [];

    questions.forEach((q, i) => {
        if (!q.title?.trim()) {
            const error = t ? t('import:quick_import.error_row', { row: i + 1, error: t('import:quick_import.error_missing_title', 'Missing title') }) : `Row ${i + 1}: Missing title`;
            errors.push(error);
        } else {
            valid.push({
                title: q.title,
                content: q.content || null,
                question_type: q.question_type || 'choice',
                difficulty: q.difficulty || 'medium',
                explanation: q.explanation || null,
                correct_answer: q.correct_answer || {},
                correct_answer_text: q.correct_answer_text || null,
                hints: q.hints || {},
                subject_name: q.subject_name || null,
                tag_names: q.tag_names || [],
                image_url: q.image_url || null,
                explanation_image_url: q.explanation_image_url || null,
                correct_answer_image_url: q.correct_answer_image_url || null,
            });
        }
    });

    return { valid, errors };
}

/**
 * 快捷导入弹窗 - 轻量级版本
 * 一步完成：粘贴 → 校验并导入
 */
export const QuickImportModal: React.FC<QuickImportModalProps> = ({ onClose, onNavigateToFullImport }) => {
    const { t } = useTranslation(['import', 'common']);
    const [jsonInput, setJsonInput] = useState('');
    const [status, setStatus] = useState<'idle' | 'validating' | 'importing' | 'done' | 'error'>('idle');
    const [result, setResult] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });

    const handleImport = async () => {
        if (!jsonInput.trim()) return;

        setStatus('validating');
        setResult({ success: 0, errors: [] });

        try {
            // 1. 解析 JSON
            const parsed = JSON.parse(jsonInput);
            const questions = Array.isArray(parsed) ? parsed : [parsed];

            // 2. 校验 (Pass t for translated errors)
            const { valid, errors } = validateQuestions(questions, t);

            if (valid.length === 0) {
                setResult({ success: 0, errors: errors.length > 0 ? errors : [t('import:quick_import.error_no_data', 'No valid data found')] });
                setStatus('error');
                return;
            }

            // 3. 获取用户
            setStatus('importing');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setResult({ success: 0, errors: [t('import:quick_import.error_auth', 'Authentication check failed')] });
                setStatus('error');
                return;
            }

            // 4. Transform for Import Pipeline
            const items = valid.map((q, i) => ({
                __row: i,
                question: {
                    title: q.title,
                    content: q.content,
                    question_type: q.question_type,
                    difficulty: q.difficulty,
                    explanation: q.explanation,
                    correct_answer: q.correct_answer,
                    correct_answer_text: q.correct_answer_text,
                    hints: q.hints,
                    image_url: q.image_url,
                    explanation_image_url: q.explanation_image_url,
                    correct_answer_image_url: q.correct_answer_image_url
                },
                subject_name: q.subject_name,
                tag_names: q.tag_names
            }));

            // 5. 导入通过管道
            const response = await v2Api.importQuestions({
                userId: user.id,
                items,
                config: {
                    create_cards: true,
                    cards_due_spread: 'immediate'
                }
            });

            if (response.failed > 0 && response.success === 0) {
                setResult({
                    success: 0,
                    errors: [...errors, ...(response.rowErrors?.map((re: any) => t('import:quick_import.error_row', { row: re.row + 1, error: re.error })) || [t('common:common.status.error', 'Import failed')])]
                });
                setStatus('error');
                return;
            }

            setResult({
                success: response.success,
                errors: [...errors, ...(response.rowErrors?.map((re: any) => t('import:quick_import.error_row', { row: re.row + 1, error: re.error })) || [])]
            });
            setStatus('done');

            // 触发全局刷新同步
            window.dispatchEvent(new CustomEvent('push_effect', {
                detail: {
                    type: 'toast',
                    level: 'success',
                    message: t('import:quick_import.success', { count: response.success })
                }
            }));

        } catch (err: any) {
            setResult({ success: 0, errors: [err.message || t('import:quick_import.error_json', 'JSON Parse Failed')] });
            setStatus('error');
        }
    };

    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal glass-card animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-head">
                    <div>
                        <h3 className="modal-title">
                            {t('quick_import.title')}
                        </h3>
                        <p className="modal-subtitle uppercase tracking-widest text-[10px] font-black opacity-40">
                            {t('quick_import.subtitle')}
                        </p>
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-square rounded-lg opacity-40 hover:opacity-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black opacity-30 tracking-widest uppercase">{t('quick_import.input_label')}</span>
                            <span className="text-[10px] font-mono opacity-30">{t('quick_import.input_format')}</span>
                        </div>
                        <textarea
                            id="quick-import-json"
                            name="json_input"
                            aria-label={t('quick_import.input_label')}
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            placeholder='[{"title": "Question Title", "question_type": "choice", ...}]'
                            disabled={status === 'validating' || status === 'importing'}
                            className="textarea w-full h-64 bg-base-content/[0.03] font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-primary/50 border-base-content/10 rounded-2xl transition-all p-4 custom-scrollbar"
                        />
                    </div>

                    {/* Result Feedback */}
                    {status === 'done' && (
                        <div className="se-badge new w-full py-4 justify-center gap-3 rounded-2xl animate-in slide-in-from-top-2">
                            <CheckCircle className="w-5 h-5 shrink-0" />
                            <div className="flex flex-col">
                                <span className="font-black text-sm">{t('quick_import.success', { count: result.success })}</span>
                                {result.errors.length > 0 && (
                                    <span className="text-[10px] opacity-70">
                                        {t('quick_import.skipped', { count: result.errors.length })}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="se-badge due w-full py-4 justify-start px-6 gap-3 rounded-2xl flex-col items-start animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span className="font-black text-sm uppercase">{t('quick_import.error_title')}</span>
                            </div>
                            <div className="space-y-1 w-full pl-6 border-l border-current/20">
                                {result.errors.slice(0, 3).map((err, i) => (
                                    <div key={i} className="text-xs font-medium line-clamp-1 opacity-80">{err}</div>
                                ))}
                                {result.errors.length > 3 && (
                                    <span className="text-[9px] font-black opacity-40 uppercase">
                                        {t('quick_import.more_errors', { count: result.errors.length - 3 })}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-base-content/5 flex items-center justify-between bg-base-content/[0.02] mt-auto">
                    <button
                        onClick={onNavigateToFullImport}
                        className="btn btn-ghost btn-sm gap-2 text-base-content/40 hover:text-primary transition-colors hover:bg-primary/5 font-black uppercase text-[10px] tracking-widest"
                        title="Advanced Import Mode"
                    >
                        <FileText className="w-4 h-4" />
                        {t('quick_import.full_mode')}
                    </button>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="btn btn-ghost btn-sm font-bold opacity-60">
                            {status === 'done' ? t('quick_import.close') : t('quick_import.cancel')}
                        </button>
                        {status !== 'done' && (
                            <button
                                onClick={handleImport}
                                className="btn btn-primary btn-sm px-6 shadow-xl shadow-primary/20 rounded-xl"
                                disabled={!jsonInput.trim() || status === 'validating' || status === 'importing'}
                            >
                                {(status === 'validating' || status === 'importing') && (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                )}
                                {status === 'validating' ? t('quick_import.verifying') : status === 'importing' ? t('quick_import.importing') : t('quick_import.btn_import')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Help Text */}
                <div className="px-8 pb-6 text-[9px] text-base-content/20 flex gap-6 font-black tracking-tighter uppercase">
                    <span><strong className="text-info/60">REQ:</strong> title</span>
                    <span><strong className="text-base-content/40">OPT:</strong> type, diff, content</span>
                    <span className="ml-auto opacity-40">V3.7 LIQUID PAYLOAD</span>
                </div>
            </div>
        </div>,
        document.body
    );
};
