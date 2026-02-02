/**
 * PropertyPanel - Edit panel for import item properties
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Edit3, Layers, FileText, Trash2, Search,
    Image as ImageIcon, Code2, Sparkles, Layout, Zap
} from 'lucide-react';
import { cn } from '../../../../app/utils/cn';
import { GlassSelect } from '../../../../components/ui/GlassSelect';
import { TagEditor } from '../../../../components/ui/TagEditor';
import { ChoicesEditor } from '../../../../components/questions/ChoicesEditor';
import { SectionHeader, FieldGroup } from '../../../../components/questions/InspectorField';
import type { ProcessedImportItem, WorkbenchMode, JsonFieldErrors } from '../../state/importTypes';
import { getItemId } from '../../state/importTypes';
import type { ValidationIssue } from '../../../../lib/importUtils';

export interface PropertyPanelProps {
    // Data
    activeItem: ProcessedImportItem;

    // UI State
    workbenchMode: WorkbenchMode;
    jsonErrors: JsonFieldErrors;

    // Actions (ID-based)
    onUpdateItem: (id: string, updates: any) => void;
    onUpdateItemField: (id: string, field: string, value: unknown) => void;
    onDeleteItem: (id: string) => void;
    onSetJsonError: (field: keyof JsonFieldErrors, error: string | null) => void;
    validationErrors: ValidationIssue[];
    focusTrigger?: string | null;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
    activeItem,
    workbenchMode,
    jsonErrors,
    onUpdateItem,
    onUpdateItemField,
    onDeleteItem,
    onSetJsonError,
    validationErrors,
    focusTrigger,
}) => {
    const itemId = getItemId(activeItem);
    const { t } = useTranslation();
    const [editorMode, setEditorMode] = React.useState<'guided' | 'source'>('guided');
    const [propertyTab, setPropertyTab] = React.useState<'fundamental' | 'logic' | 'media'>('fundamental');

    // Field focusing logic
    const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});

    React.useEffect(() => {
        if (focusTrigger && fieldRefs.current[focusTrigger]) {
            fieldRefs.current[focusTrigger]?.focus();
            fieldRefs.current[focusTrigger]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [focusTrigger]);

    const getFieldError = (field: string) => validationErrors.find(v => v.field === field);

    const { question } = activeItem;

    // === JSON Local State Management ===
    const [jsonStrings, setJsonStrings] = React.useState({
        correct_answer: '',
        hints: '',
        metadata: ''
    });

    React.useEffect(() => {
        setJsonStrings({
            correct_answer: JSON.stringify(question.correct_answer || {}, null, 2),
            hints: JSON.stringify(question.hints || {}, null, 2),
            metadata: JSON.stringify(question.metadata || {}, null, 2)
        });
    }, [itemId]);

    React.useEffect(() => {
        if (editorMode === 'guided') {
            setJsonStrings({
                correct_answer: JSON.stringify(question.correct_answer || {}, null, 2),
                hints: JSON.stringify(question.hints || {}, null, 2),
                metadata: JSON.stringify(question.metadata || {}, null, 2)
            });
        }
    }, [question.correct_answer, question.hints, question.metadata, editorMode]);

    const handleJsonChange = (field: 'correct_answer' | 'hints' | 'metadata', value: string) => {
        setJsonStrings(prev => ({ ...prev, [field]: value }));
        try {
            const parsed = JSON.parse(value);
            onUpdateItem(itemId, { [field]: parsed });
            onSetJsonError(field, null);
        } catch (e) {
            onSetJsonError(field, t('import.preview.json_error', 'Invalid JSON syntax'));
        }
    };

    return (
        <div className={cn(
            "flex flex-col bg-base-100/20 backdrop-blur-3xl shadow-inner relative z-0 transition-all duration-700 ease-spring border-r border-base-content/5",
            workbenchMode === 'edit' ? "w-full" : (workbenchMode === 'preview' ? "w-0 overflow-hidden opacity-0 invisible" : "w-[45%]")
        )}>
            {/* Header: Minimalist & Pure */}
            <div className="shrink-0 h-16 px-6 border-b border-base-content/5 flex items-center justify-between bg-base-100/40 backdrop-blur-3xl z-20">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-[9px] font-black opacity-30 uppercase tracking-[0.2em]">
                            <Edit3 size={11} />
                            {t('import.preview.property_inspector', 'Item Properties')}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-base-content/40">
                            <span className="text-[10px] font-black tabular-nums uppercase tracking-widest">
                                {t('import.preview.label_row')} #{activeItem.__row}
                            </span>
                            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-success/5 border border-success/10" title={t('common.auto_save')}>
                                <div className="w-1 h-1 rounded-full bg-success/60 animate-pulse"></div>
                                <span className="text-[8px] font-black uppercase tracking-widest text-success/40 hidden md:inline-block">
                                    {t('common.auto_save')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onDeleteItem(itemId)}
                        className="group flex items-center gap-2 px-3 py-2 rounded-xl text-error/30 hover:text-error hover:bg-error/10 transition-all active:scale-95"
                        title={t('import.preview.btn_delete')}
                    >
                        <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">{t('import.preview.btn_delete')}</span>
                    </button>
                </div>
            </div>

            {/* Sub-Header: Tabs */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-base-content/5 bg-base-100/10">
                <div className="flex items-center bg-base-content/5 p-1 rounded-xl gap-1">
                    {(['fundamental', 'logic', 'media'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setPropertyTab(tab)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                propertyTab === tab ? "bg-base-100 text-primary shadow-sm" : "text-base-content/40 hover:text-base-content/60"
                            )}
                        >
                            {tab === 'fundamental' && <Layers size={12} />}
                            {tab === 'logic' && <Sparkles size={12} />}
                            {tab === 'media' && <ImageIcon size={12} />}
                            <span>{t(`import.preview.tab_${tab}`, tab)}</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center bg-base-content/5 p-1 rounded-xl gap-1">
                    <button
                        onClick={() => setEditorMode('guided')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                            editorMode === 'guided'
                                ? "bg-base-100 text-primary shadow-sm"
                                : "text-base-content/40 hover:text-base-content/60"
                        )}
                    >
                        <Layout size={12} />
                        <span className="hidden sm:inline-block">{t('import.preview.editor_mode_guided', 'Visual')}</span>
                    </button>
                    <button
                        onClick={() => setEditorMode('source')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                            editorMode === 'source'
                                ? "bg-base-100 text-primary shadow-sm"
                                : "text-base-content/40 hover:text-base-content/60"
                        )}
                        title={t('import.preview.editor_mode_source', 'Source')}
                    >
                        <Code2 size={12} />
                        <span className="hidden sm:inline-block">{t('import.preview.editor_mode_source', 'Source')}</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {propertyTab === 'fundamental' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {/* Classification Group */}
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader
                                icon={<Layers size={16} />}
                                title={t('import.preview.section_classification', 'Classification')}
                            />
                            <div className="grid grid-cols-2 gap-6">
                                <FieldGroup label={t('import.preview.field_type')} id="import-item-type">
                                    <GlassSelect
                                        value={question.question_type as string}
                                        onChange={val => onUpdateItem(itemId, { question_type: val })}
                                        options={[
                                            { value: 'choice', label: t('common.type.choice') },
                                            { value: 'fill_blank', label: t('common.type.fill_blank') },
                                            { value: 'short_answer', label: t('common.type.short_answer') },
                                        ]}
                                        className="h-11 rounded-2xl bg-white/40 border-base-content/5"
                                    />
                                </FieldGroup>
                                <FieldGroup label={t('import.preview.field_difficulty')} id="import-item-difficulty">
                                    <GlassSelect
                                        value={question.difficulty as string}
                                        onChange={val => onUpdateItem(itemId, { difficulty: val })}
                                        options={[
                                            { value: 'easy', label: t('common.difficulty.easy') },
                                            { value: 'medium', label: t('common.difficulty.medium') },
                                            { value: 'hard', label: t('common.difficulty.hard') },
                                        ]}
                                        className="h-11 rounded-2xl bg-white/40 border-base-content/5"
                                    />
                                </FieldGroup>
                            </div>
                            <FieldGroup label={t('import.preview.field_subject')} id="import-item-subject">
                                <div className="relative group/input">
                                    <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/20 transition-colors group-focus-within/input:text-primary" />
                                    <DebouncedInput
                                        id="import-item-subject"
                                        name="subject_name"
                                        value={activeItem.subject_name || ''}
                                        onChange={val => onUpdateItemField(itemId, 'subject_name', val)}
                                        placeholder={t('import.preview.ph_subject')}
                                        className="w-full h-11 bg-white/40 border border-base-content/5 rounded-2xl pl-10 pr-4 text-[11px] font-bold outline-none focus:bg-white focus:border-primary/20 transition-all font-mono"
                                    />
                                </div>
                            </FieldGroup>
                        </div>

                        {/* Content Group */}
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader
                                icon={<FileText size={16} />}
                                title={t('renderer.sections.content', 'Content')}
                            />
                            <FieldGroup label={t('import.preview.ph_title')} id="import-item-title" error={getFieldError('title')?.message}>
                                <DebouncedInput
                                    id="import-item-title"
                                    name="item_title"
                                    value={(question.title as string) || ''}
                                    onChange={val => onUpdateItem(itemId, { title: val })}
                                    placeholder={t('import.preview.ph_title')}
                                    className="w-full h-12 bg-white/60 border border-base-content/10 rounded-2xl px-5 text-base font-bold outline-none focus:bg-base-100 focus:border-primary/20 transition-all shadow-premium-sm"
                                />
                            </FieldGroup>
                            <FieldGroup label={t('import.preview.ph_content')} id="import-item-content" error={getFieldError('content')?.message}>
                                <DebouncedTextarea
                                    id="import-item-content"
                                    name="content"
                                    value={(question.content as string) || ''}
                                    onChange={val => onUpdateItem(itemId, { content: val })}
                                    placeholder={t('import.preview.ph_content')}
                                    className="w-full h-64 bg-white/40 border border-base-content/5 rounded-[2rem] p-6 text-sm font-medium leading-relaxed outline-none focus:bg-white focus:border-primary/20 transition-all custom-scrollbar shadow-inner"
                                />
                            </FieldGroup>
                        </div>

                        {/* Tags Group */}
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader icon={<Search size={16} />} title={t('common.tags', 'Tags')} />
                            <TagEditor
                                id="import-item-tags"
                                name="tag_names"
                                value={(activeItem.tag_names as string[]) || []}
                                onChange={tags => onUpdateItemField(itemId, 'tag_names', tags)}
                            />
                        </div>
                    </div>
                )}

                {propertyTab === 'logic' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {editorMode === 'guided' ? (
                            <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                                <SectionHeader icon={<Sparkles size={16} />} title={t('import.preview.guided_editor', 'Visual Editor')} />
                                <div ref={el => { fieldRefs.current.correct_answer = el; fieldRefs.current.hints = el; }}>
                                    <ChoicesEditor
                                        instanceId={`import-${itemId}`}
                                        questionType={question.question_type as any}
                                        hints={question.hints as any}
                                        correctAnswer={question.correct_answer as any}
                                        explanation={question.explanation as string}
                                        onHintsChange={hints => onUpdateItem(itemId, { hints })}
                                        onCorrectAnswerChange={ans => onUpdateItem(itemId, { correct_answer: ans })}
                                        onExplanationChange={exp => onUpdateItem(itemId, { explanation: exp })}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <FieldGroup label={t('import.preview.field_answer')} id="import-item-answer" error={jsonErrors.correct_answer}>
                                    <textarea
                                        id="import-item-answer"
                                        value={jsonStrings.correct_answer}
                                        onChange={e => handleJsonChange('correct_answer', e.target.value)}
                                        className="w-full h-48 bg-base-300 dark:bg-neutral text-success rounded-2xl p-4 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 transition-all custom-scrollbar"
                                    />
                                </FieldGroup>
                                <FieldGroup label={t('import.preview.field_hints')} id="import-item-hints" error={jsonErrors.hints}>
                                    <textarea
                                        id="import-item-hints"
                                        value={jsonStrings.hints}
                                        onChange={e => handleJsonChange('hints', e.target.value)}
                                        className="w-full h-48 bg-base-300 dark:bg-neutral text-info rounded-2xl p-4 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 transition-all custom-scrollbar"
                                    />
                                </FieldGroup>
                            </div>
                        )}

                        {/* Explanation Group (Source Mode or Extended) */}
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader icon={<Zap size={16} />} title={t('renderer.sections.explanation', 'Detailed Solver')} />
                            <DebouncedTextarea
                                id="import-item-explanation"
                                name="explanation"
                                value={(question.explanation as string) || ''}
                                onChange={val => onUpdateItem(itemId, { explanation: val })}
                                placeholder={t('import.preview.ph_explanation')}
                                className="w-full h-40 bg-white/40 border border-base-content/5 rounded-2xl p-4 text-sm font-medium leading-relaxed outline-none focus:bg-white focus:border-primary/20 transition-all custom-scrollbar shadow-inner"
                            />
                        </div>
                    </div>
                )}

                {propertyTab === 'media' && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader icon={<ImageIcon size={16} />} title={t('import.preview.section_images', 'Static Assets')} />
                            <div className="space-y-6">
                                <FieldGroup label={t('import.preview.field_image_url')} id="import-item-image">
                                    <DebouncedInput
                                        id="import-item-image"
                                        value={(question.image_url as string) || ''}
                                        onChange={val => onUpdateItem(itemId, { image_url: val })}
                                        placeholder="https://..."
                                        className="w-full h-11 bg-white/40 border border-base-content/5 rounded-2xl px-4 text-[11px] font-bold outline-none focus:bg-white focus:border-primary/20 transition-all font-mono"
                                    />
                                </FieldGroup>
                                <FieldGroup label={t('import.preview.field_explanation_image_url')} id="import-item-exp-image">
                                    <DebouncedInput
                                        id="import-item-exp-image"
                                        value={(question.explanation_image_url as string) || ''}
                                        onChange={val => onUpdateItem(itemId, { explanation_image_url: val })}
                                        placeholder="https://..."
                                        className="w-full h-11 bg-white/40 border border-base-content/5 rounded-2xl px-4 text-[11px] font-bold outline-none focus:bg-white focus:border-primary/20 transition-all font-mono"
                                    />
                                </FieldGroup>
                            </div>
                        </div>

                        {/* Metadata Toggle */}
                        <div className="space-y-6 bg-base-content/[0.01] p-6 rounded-[2.5rem] border border-base-content/5">
                            <SectionHeader icon={<Layout size={16} />} title={t('import.preview.field_metadata', 'Advanced JSON Metadata')} />
                            <textarea
                                id="import-item-metadata"
                                value={jsonStrings.metadata}
                                onChange={e => handleJsonChange('metadata', e.target.value)}
                                className="w-full h-40 bg-base-300 dark:bg-neutral text-base-content/60 rounded-2xl p-4 text-[11px] font-mono leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 transition-all custom-scrollbar shadow-inner"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Specialized Internal Components for Performance ---

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    onChange: (value: string) => void;
    debounceMs?: number;
}

const DebouncedInput: React.FC<DebouncedInputProps> = ({ value: initialValue, onChange, debounceMs = 300, ...props }) => {
    const [localValue, setLocalValue] = React.useState(initialValue);
    React.useEffect(() => { setLocalValue(initialValue); }, [initialValue]);
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            if (localValue !== initialValue) onChange(localValue as string);
        }, debounceMs);
        return () => clearTimeout(timeout);
    }, [localValue, initialValue, onChange, debounceMs]);
    return <input {...props} value={localValue} onChange={e => setLocalValue(e.target.value)} />;
};

interface DebouncedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
    onChange: (value: string) => void;
    debounceMs?: number;
}

const DebouncedTextarea: React.FC<DebouncedTextareaProps> = ({ value: initialValue, onChange, debounceMs = 300, ...props }) => {
    const [localValue, setLocalValue] = React.useState(initialValue);
    React.useEffect(() => { setLocalValue(initialValue); }, [initialValue]);
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            if (localValue !== initialValue) onChange(localValue as string);
        }, debounceMs);
        return () => clearTimeout(timeout);
    }, [localValue, initialValue, onChange, debounceMs]);
    return <textarea {...props} value={localValue} onChange={e => setLocalValue(e.target.value)} />;
};
