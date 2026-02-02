import React from 'react';
import { cn } from '../../app/utils/cn';

interface SectionHeaderProps {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    value?: string;
    className?: string;
    actions?: React.ReactNode;
    onClick?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, subtitle, value, className, actions, onClick }) => {
    return (
        <div
            className={cn("flex items-center justify-between px-1", className)}
            onClick={onClick}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="text-primary shrink-0 opacity-40">
                    {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 12 }) : icon}
                </div>
                <div className="flex items-baseline gap-2 min-w-0">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 truncate">
                        {title}
                    </h3>
                    {value && (
                        <span className="text-[9px] font-bold text-primary/60 uppercase tracking-widest truncate">
                            {value}
                        </span>
                    )}
                    {subtitle && !value && (
                        <span className="text-[8px] font-bold opacity-20 uppercase tracking-widest leading-tight truncate">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
};

interface FieldGroupProps {
    label: string;
    id: string;
    error?: string | null;
    children: React.ReactNode;
    className?: string;
    labelClassName?: string;
    optional?: boolean;
}

export const FieldGroup: React.FC<FieldGroupProps> = ({
    label,
    id,
    error,
    children,
    className,
    labelClassName,
    optional
}) => {
    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center justify-between px-1">
                <label
                    htmlFor={id}
                    className={cn("text-[9px] font-black uppercase tracking-[0.15em] opacity-20 ml-1", labelClassName)}
                >
                    {label}
                    {optional && <span className="ml-1 opacity-50">(Optional)</span>}
                </label>
            </div>
            <div className={cn(
                "rounded-xl transition-all",
                error && "ring-2 ring-error/30 ring-offset-2 ring-offset-transparent"
            )}>
                {children}
            </div>
            {error && (
                <p className="text-[10px] text-error font-bold mt-1 ml-1 animate-in fade-in slide-in-from-top-1">
                    {error}
                </p>
            )}
        </div>
    );
};
