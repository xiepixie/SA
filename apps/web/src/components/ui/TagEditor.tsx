import React, { useState, useRef, useId } from 'react';
import { Hash, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../app/utils/cn';

export interface TagEditorProps {
    /** Current array of tag strings */
    value?: string[];
    /** Callback when tags change */
    onChange: (tags: string[]) => void;
    /** Input placeholder when empty */
    placeholderEmpty?: string;
    /** Input placeholder when has tags */
    placeholderAdd?: string;
    /** Maximum number of tags allowed (optional) */
    maxTags?: number;
    /** Custom className for container */
    className?: string;
    /** Disable editing */
    disabled?: boolean;
    /** Accessibility ID */
    id?: string;
    /** Accessibility name */
    name?: string;
    /** Accessible label for the tag list */
    ariaLabel?: string;
}

/**
 * TagEditor - Premium inline tag editor with keyboard support
 * 
 * Features:
 * - Add tags via Enter key
 * - Remove last tag via Backspace when input is empty
 * - Auto-trim and lowercase
 * - Duplicate prevention
 * - Blur-to-add behavior
 * 
 * @example
 * <TagEditor
 *   value={['react', 'typescript']}
 *   onChange={setTags}
 * />
 */
export const TagEditor: React.FC<TagEditorProps> = ({
    value = [],
    onChange,
    placeholderEmpty,
    placeholderAdd,
    maxTags,
    className = '',
    disabled = false,
    id,
    name,
    ariaLabel
}) => {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [focusedTagIndex, setFocusedTagIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceId = useId();

    const defaultPlaceholderEmpty = t('import.preview.tags_ph_empty', 'Add tags...');
    const defaultPlaceholderAdd = t('import.preview.tags_ph_add', 'Add...');

    const addTag = (tag: string) => {
        const fresh = tag.trim().toLowerCase();
        if (fresh && !value.includes(fresh)) {
            if (maxTags && value.length >= maxTags) return;
            onChange([...value, fresh]);
        }
        setInput('');
    };

    const removeTag = (tag: string, focusInput = true) => {
        const idx = value.indexOf(tag);
        onChange(value.filter(t => t !== tag));

        // Focus management after removal
        if (focusInput && inputRef.current) {
            inputRef.current.focus();
        } else if (idx > 0) {
            setFocusedTagIndex(idx - 1);
        }
    };

    const handleTagKeyDown = (e: React.KeyboardEvent, tag: string, index: number) => {
        switch (e.key) {
            case 'Backspace':
            case 'Delete':
                e.preventDefault();
                removeTag(tag, false);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (index > 0) {
                    setFocusedTagIndex(index - 1);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (index < value.length - 1) {
                    setFocusedTagIndex(index + 1);
                } else {
                    setFocusedTagIndex(-1);
                    inputRef.current?.focus();
                }
                break;
            case 'Home':
                e.preventDefault();
                if (value.length > 0) {
                    setFocusedTagIndex(0);
                }
                break;
            case 'End':
                e.preventDefault();
                setFocusedTagIndex(-1);
                inputRef.current?.focus();
                break;
        }
    };

    // Focus the tag when focusedTagIndex changes
    React.useEffect(() => {
        if (focusedTagIndex >= 0 && focusedTagIndex < value.length) {
            const tagEl = containerRef.current?.querySelector(`[data-tag-index="${focusedTagIndex}"]`) as HTMLElement;
            tagEl?.focus();
        }
    }, [focusedTagIndex, value.length]);

    return (
        <div
            ref={containerRef}
            role="group"
            aria-label={ariaLabel || t('tags.editor_label', 'Tag editor')}
            className={cn(
                "flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-base-content/10 bg-base-100/[0.4] backdrop-blur-md focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all min-h-[52px]",
                disabled && "opacity-50 pointer-events-none",
                className
            )}
        >
            <div
                role="list"
                aria-label={t('tags.list_label', 'Added tags')}
                className="contents"
            >
                {value.map((tag, index) => (
                    <span
                        key={tag}
                        role="listitem"
                        tabIndex={disabled ? -1 : 0}
                        data-tag-index={index}
                        onKeyDown={(e) => handleTagKeyDown(e, tag, index)}
                        onFocus={() => setFocusedTagIndex(index)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary text-primary-content text-[10px] font-semibold uppercase tracking-wider motion-safe:animate-in motion-safe:zoom-in motion-safe:duration-300 shadow-md shadow-primary/10 group overflow-hidden cursor-default",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                        )}
                        aria-label={t('tags.tag_with_name', { name: tag, defaultValue: `Tag: ${tag}` })}
                    >
                        <Hash size={10} className="shrink-0 opacity-60" aria-hidden="true" />
                        <span className="truncate max-w-[100px]">{tag}</span>
                        {!disabled && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeTag(tag);
                                }}
                                className="min-w-[24px] min-h-[24px] w-6 h-6 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/30 active:bg-white/40 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                type="button"
                                tabIndex={-1}
                                aria-label={t('tags.remove_tag', { name: tag, defaultValue: `Remove tag ${tag}` })}
                            >
                                <X size={12} aria-hidden="true" />
                            </button>
                        )}
                    </span>
                ))}
            </div>
            {!disabled && (
                <input
                    ref={inputRef}
                    id={id || `tag-input-${instanceId}`}
                    name={name}
                    type="text"
                    className="bg-transparent text-sm min-w-[80px] flex-1 outline-none placeholder:text-base-content/20 font-bold px-2 focus:outline-none"
                    placeholder={value.length === 0 ? (placeholderEmpty || defaultPlaceholderEmpty) : (placeholderAdd || defaultPlaceholderAdd)}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag(input);
                        }
                        if (e.key === 'Backspace' && !input && value.length > 0) {
                            e.preventDefault();
                            // Focus last tag instead of removing
                            setFocusedTagIndex(value.length - 1);
                        }
                        if (e.key === 'ArrowLeft' && !input && value.length > 0) {
                            e.preventDefault();
                            setFocusedTagIndex(value.length - 1);
                        }
                    }}
                    onBlur={() => input && addTag(input)}
                    onFocus={() => setFocusedTagIndex(-1)}
                    autoComplete="off"
                    disabled={disabled}
                    aria-describedby={maxTags ? `${id || instanceId}-hint` : undefined}
                />
            )}
            {maxTags && (
                <span id={`${id || instanceId}-hint`} className="sr-only">
                    {t('tags.max_hint', { max: maxTags, current: value.length })}
                </span>
            )}
        </div>
    );
};

export default TagEditor;
