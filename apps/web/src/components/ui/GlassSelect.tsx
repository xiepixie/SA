import React, { useMemo, useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronRight, Check, Search as SearchIcon, X } from 'lucide-react';
import { cn } from '../../app/utils/cn';

export interface GlassSelectOption<T> {
    value: T;
    label: string;
    description?: string;
    icon?: React.ReactNode;
    recommended?: boolean;
}

export interface GlassSelectGroup<T> {
    label: string;
    options: GlassSelectOption<T>[];
}

const Z_INDEX = {
    DROPDOWN: 'z-[100]',
    SEARCH_STICKY: 'z-[10]'
};

const UI_CONFIG = {
    DROPDOWN_MAX_HEIGHT: 350,
    ANIMATION_DURATION: 200
};

interface GlassSelectOptionItemProps<T> {
    option: GlassSelectOption<T>;
    isSelected: boolean;
    isFocused: boolean;
    onSelect: (value: T) => void;
    onFocus: () => void;
    listboxId: string;
    flatIdx: number;
    iconSize: string;
}

const GlassSelectOptionItem = React.memo(<T extends string | number>({
    option,
    isSelected,
    isFocused,
    onSelect,
    onFocus,
    listboxId,
    flatIdx,
    iconSize
}: GlassSelectOptionItemProps<T>) => {
    return (
        <li
            role="option"
            id={`${listboxId}-option-${flatIdx}`}
            aria-selected={isSelected}
            tabIndex={-1}
            onClick={() => onSelect(option.value)}
            onMouseEnter={onFocus}
            className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300 group/item cursor-pointer min-h-[44px]",
                isSelected
                    ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(var(--p),0.2)]"
                    : "hover:bg-base-content/5 hover:translate-x-1",
                isFocused && !isSelected && "bg-base-content/5 outline-none ring-2 ring-primary/30"
            )}
        >
            <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                <div className="flex items-center gap-2 max-w-full">
                    {option.icon && (
                        <span className={`flex-shrink-0 flex items-center justify-center w-4 h-4 ${isSelected ? 'text-primary' : 'opacity-40'}`}>
                            {React.isValidElement(option.icon)
                                ? React.cloneElement(option.icon as React.ReactElement<any>, { size: 14 })
                                : option.icon}
                        </span>
                    )}
                    <span className={`font-bold truncate leading-none ${isSelected ? 'text-primary' : 'text-base-content/80'}`}>
                        {option.label}
                    </span>
                    {option.recommended && (
                        <span className="flex-shrink-0 text-[8px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-md uppercase font-black tracking-tighter">
                            REC
                        </span>
                    )}
                </div>
                {option.description && (
                    <span className="text-[10px] opacity-40 font-medium leading-tight truncate w-full">
                        {option.description}
                    </span>
                )}
            </div>
            {isSelected && (
                <div className="flex-shrink-0 ml-2 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 duration-300">
                    <Check className={iconSize} aria-hidden="true" />
                </div>
            )}
        </li>
    );
}) as <T extends string | number>(props: GlassSelectOptionItemProps<T>) => React.ReactElement;

interface GlassSelectProps<T> {
    id?: string;
    value: T;
    onChange: (value: T) => void;
    options?: GlassSelectOption<T>[];
    groups?: GlassSelectGroup<T>[];
    icon?: React.ReactNode;
    placeholder?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    dropdownWidth?: string;
    dropdownAlign?: 'start' | 'end';
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyText?: string;
    name?: string;
    hideLabel?: boolean;
    /** Accessible label for screen readers */
    ariaLabel?: string;
}

export const GlassSelect = <T extends string | number>({
    id,
    value,
    onChange,
    options = [],
    groups,
    icon,
    placeholder,
    className = 'w-full',
    size = 'md',
    dropdownWidth = 'w-[280px]',
    dropdownAlign = 'start',
    searchable = false,
    searchPlaceholder = 'Search...',
    emptyText = 'No results found',
    name,
    hideLabel = false,
    ariaLabel
}: GlassSelectProps<T>) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [flipDropdown, setFlipDropdown] = useState(false);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const instanceId = useId();

    // Filtered options/groups
    const filteredGroups = useMemo(() => {
        if (!searchTerm) return groups;
        return groups?.map(g => ({
            ...g,
            options: g.options.filter(o =>
                o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                o.description?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        })).filter(g => g.options.length > 0);
    }, [groups, searchTerm]);

    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options;
        return options.filter(o =>
            o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [options, searchTerm]);

    // Flatten all options for keyboard navigation
    const flatOptions = useMemo(() => {
        if (filteredGroups) {
            return filteredGroups.flatMap(g => g.options);
        }
        return filteredOptions;
    }, [filteredGroups, filteredOptions]);

    // Reset focused index when search changes
    useEffect(() => {
        setFocusedIndex(-1);
    }, [searchTerm]);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchable) {
            // Small timeout to ensure DOM is ready and animation started
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen, searchable]);

    // Viewport overflow detection
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < UI_CONFIG.DROPDOWN_MAX_HEIGHT + 50) {
                setFlipDropdown(true);
            } else {
                setFlipDropdown(false);
            }
        }
    }, [isOpen]);

    // Close dropdown on Escape and handle outside clicks
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (isOpen &&
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                listRef.current && !listRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
                // Set initial focus to current value or first item
                const currentIdx = flatOptions.findIndex(o => o.value === value);
                setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(prev => {
                    const next = prev + 1;
                    if (next >= flatOptions.length) return 0; // Wrap around
                    return next;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(prev => {
                    const next = prev - 1;
                    if (next < 0) return flatOptions.length - 1; // Wrap around
                    return next;
                });
                break;
            case 'Home':
                e.preventDefault();
                setFocusedIndex(0);
                break;
            case 'End':
                e.preventDefault();
                setFocusedIndex(flatOptions.length - 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0 && flatOptions[focusedIndex]) {
                    handleSelect(flatOptions[focusedIndex].value);
                } else if (!searchable) {
                    setIsOpen(false);
                }
                break;
            case 'Tab':
                setIsOpen(false);
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                triggerRef.current?.focus();
                break;
        }
    }, [isOpen, focusedIndex, flatOptions, value, searchable]);

    // Determine the active label
    const activeLabel = useMemo(() => {
        if (groups) {
            for (const group of groups) {
                const opt = group.options.find(o => o.value === value);
                if (opt) return opt.label;
            }
        }
        return options.find(o => o.value === value)?.label || placeholder;
    }, [value, options, groups, placeholder]);

    const handleSelect = (val: T) => {
        onChange(val);
        setIsOpen(false);
        setFocusedIndex(-1);
        // Return focus to trigger
        triggerRef.current?.focus();
    };

    const handleTriggerClick = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            // Find current value index
            const currentIdx = flatOptions.findIndex(o => o.value === value);
            setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
        }
    };

    const sizeClasses = {
        sm: 'h-9 px-3 text-[11px] rounded-xl',
        md: 'h-11 px-4 text-sm rounded-2xl',
        lg: 'h-14 px-6 text-base rounded-3xl'
    };

    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    const iconWrapperSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

    const listboxId = id ? `${id}-listbox` : `${instanceId}-listbox`;

    // Track flat index for each option for keyboard focus
    const getOptionFlatIndex = (optionValue: T): number => {
        return flatOptions.findIndex(o => o.value === optionValue);
    };

    const renderOption = (option: GlassSelectOption<T>) => {
        const flatIdx = getOptionFlatIndex(option.value);
        const isFocused = focusedIndex === flatIdx;
        const isSelected = value === option.value;

        return (
            <GlassSelectOptionItem
                key={String(option.value)}
                option={option}
                isSelected={isSelected}
                isFocused={isFocused}
                onSelect={handleSelect}
                onFocus={() => setFocusedIndex(flatIdx)}
                listboxId={listboxId}
                flatIdx={flatIdx}
                iconSize={iconSize}
            />
        );
    };

    return (
        <div className={cn("relative", className)}>
            <button
                ref={triggerRef}
                type="button"
                id={id || instanceId}
                name={name}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
                aria-label={`${ariaLabel || placeholder}: ${activeLabel}`}
                onClick={handleTriggerClick}
                onKeyDown={handleKeyDown}
                className={cn(
                    "flex items-center justify-between w-full bg-base-100/60 backdrop-blur-xl border border-base-content/10 hover:border-primary/40 hover:bg-base-100/80 transition-all shadow-sm group",
                    sizeClasses[size]
                )}
            >
                <div className="flex items-center gap-2.5 truncate pr-1">
                    {icon && (
                        <div className={`${iconWrapperSize} flex items-center justify-center text-primary/60 transition-all duration-500 group-hover:scale-110 group-hover:text-primary flex-shrink-0`}>
                            {React.isValidElement(icon)
                                ? React.cloneElement(icon as React.ReactElement<any>, {
                                    size: size === 'sm' ? 14 : 16,
                                    className: cn((icon as any).props?.className)
                                })
                                : icon}
                        </div>
                    )}
                    {!hideLabel && (
                        <span className="font-bold text-base-content/70 group-hover:text-base-content transition-colors truncate tracking-tight leading-none">
                            {activeLabel}
                        </span>
                    )}
                </div>
                {!hideLabel && (
                    <div className={cn(
                        "flex-shrink-0 transition-transform duration-300 flex items-center",
                        isOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                    )}>
                        <ChevronRight className={`${iconSize} rotate-90 text-base-content/20 group-hover:text-primary transition-colors`} aria-hidden="true" />
                    </div>
                )}
            </button>

            {isOpen && (
                <ul
                    ref={listRef}
                    id={listboxId}
                    role="listbox"
                    aria-label={ariaLabel || activeLabel}
                    tabIndex={-1}
                    className={cn(
                        "absolute p-0 shadow-2xl bg-base-100/98 backdrop-blur-3xl border border-base-content/10 rounded-2xl motion-safe:animate-in motion-safe:fade-in duration-200 overflow-hidden",
                        Z_INDEX.DROPDOWN,
                        dropdownWidth,
                        dropdownAlign === 'end' ? "right-0" : "left-0",
                        flipDropdown ? "bottom-full mb-1.5 motion-safe:slide-in-from-bottom-1" : "top-full mt-1.5 motion-safe:slide-in-from-top-1"
                    )}
                >
                    {searchable && (
                        <div className={cn("p-3 sticky top-0 bg-base-100/95 backdrop-blur-xl border-b border-base-content/5", Z_INDEX.SEARCH_STICKY)}>
                            <div className="relative group/search flex items-center">
                                <div className="absolute left-3.5 inset-y-0 flex items-center justify-center pointer-events-none">
                                    <SearchIcon className={`w-3.5 h-3.5 transition-all duration-500 ${searchTerm ? 'text-primary scale-110 rotate-12' : 'text-base-content/20 group-focus-within/search:text-primary group-focus-within/search:scale-110'}`} aria-hidden="true" />
                                </div>
                                <input
                                    ref={searchInputRef}
                                    id={id ? `${id}-search` : `${instanceId}-search`}
                                    name="search"
                                    type="text"
                                    role="searchbox"
                                    aria-label={searchPlaceholder}
                                    placeholder={searchPlaceholder}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoComplete="off"
                                    className="w-full h-10 bg-base-content/[0.03] hover:bg-base-content/[0.06] focus:bg-base-100/50 rounded-xl pl-10 pr-10 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:font-medium placeholder:opacity-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                                />
                                {searchTerm && (
                                    <div className="absolute right-2.5 inset-y-0 flex items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setSearchTerm(''); searchInputRef.current?.focus(); }}
                                            aria-label="Clear search"
                                            className="p-1 hover:bg-primary/10 rounded-lg text-base-content/30 hover:text-primary transition-all motion-safe:animate-in motion-safe:zoom-in-75 duration-300 group/clear min-w-[40px] min-h-[40px] flex items-center justify-center -mr-1"
                                        >
                                            <X size={16} className="stroke-[3px] group-hover:rotate-90 transition-transform duration-300" aria-hidden="true" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div
                        className="overflow-y-auto space-y-0.5 custom-scrollbar p-1.5"
                        style={{ maxHeight: UI_CONFIG.DROPDOWN_MAX_HEIGHT }}
                    >
                        {filteredGroups ? (
                            filteredGroups.map((group, idx) => (
                                <React.Fragment key={group.label}>
                                    <li
                                        role="presentation"
                                        className={`menu-title px-4 py-2 ${idx > 0 ? 'mt-2 border-t border-base-content/5' : 'mt-1'}`}
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/25">
                                            {group.label}
                                        </span>
                                    </li>
                                    {group.options.map(renderOption)}
                                </React.Fragment>
                            ))
                        ) : (
                            filteredOptions.map(renderOption)
                        )}

                        {((filteredGroups && filteredGroups.every(g => g.options.length === 0)) || (options.length > 0 && filteredOptions.length === 0)) && (
                            <div className="px-4 py-12 text-center flex flex-col items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-300" role="status">
                                <div className="w-12 h-12 bg-base-content/5 rounded-full flex items-center justify-center">
                                    <SearchIcon className="w-5 h-5 opacity-20" aria-hidden="true" />
                                </div>
                                <span className="text-xs opacity-30 italic font-medium px-6 leading-relaxed">
                                    {emptyText}
                                </span>
                            </div>
                        )}
                    </div>
                </ul>
            )}
        </div>
    );
};
