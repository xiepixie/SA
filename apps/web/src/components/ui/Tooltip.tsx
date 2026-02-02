import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
    content: string;
    children: ReactElement;
    position?: TooltipPosition;
    delay?: number;
    className?: string;
    disabled?: boolean;
    ariaLabel?: boolean;
}

const OFFSET = 8;
const VIEWPORT_MARGIN = 12;

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    position = 'top',
    delay = 200,
    className = '',
    disabled = false,
    ariaLabel = false,
}) => {
    const id = useId();
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [resolvedPosition, setResolvedPosition] = useState(position);

    const triggerRef = useRef<HTMLElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const rafRef = useRef<number>(0);

    const showTooltip = (type: 'hover' | 'focus') => {
        if (timerRef.current) clearTimeout(timerRef.current);

        // Bug C: Focus 0-delay, hover uses user-defined delay
        const actualDelay = type === 'focus' ? 0 : delay;

        timerRef.current = window.setTimeout(() => {
            setIsVisible(true);
        }, actualDelay);
    };

    const hideTooltip = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
        setIsVisible(false);
    };

    const updatePosition = () => {
        if (!triggerRef.current || !tooltipRef.current) return;

        // Bug A: Using viewport coordinates directly for fixed positioning
        const trigger = triggerRef.current.getBoundingClientRect();
        const tooltip = tooltipRef.current.getBoundingClientRect();

        let top = 0;
        let left = 0;
        let currentPos = position;

        // 3.1 Flip logic (Check if default position overflows)
        if (position === 'right' && trigger.right + OFFSET + tooltip.width > window.innerWidth - VIEWPORT_MARGIN) {
            currentPos = 'left';
        } else if (position === 'left' && trigger.left - OFFSET - tooltip.width < VIEWPORT_MARGIN) {
            currentPos = 'right';
        } else if (position === 'top' && trigger.top - OFFSET - tooltip.height < VIEWPORT_MARGIN) {
            currentPos = 'bottom';
        } else if (position === 'bottom' && trigger.bottom + OFFSET + tooltip.height > window.innerHeight - VIEWPORT_MARGIN) {
            currentPos = 'top';
        }

        setResolvedPosition(currentPos);

        // Core positioning based on resolved direction
        switch (currentPos) {
            case 'top':
                top = trigger.top - tooltip.height - OFFSET;
                left = trigger.left + (trigger.width - tooltip.width) / 2;
                break;
            case 'bottom':
                top = trigger.bottom + OFFSET;
                left = trigger.left + (trigger.width - tooltip.width) / 2;
                break;
            case 'left':
                top = trigger.top + (trigger.height - tooltip.height) / 2;
                left = trigger.left - tooltip.width - OFFSET;
                break;
            case 'right':
                top = trigger.top + (trigger.height - tooltip.height) / 2;
                left = trigger.right + OFFSET;
                break;
        }

        // 3.1 Clamp logic: Ensure tooltip stays within viewport bounds
        top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - tooltip.height - VIEWPORT_MARGIN));
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - tooltip.width - VIEWPORT_MARGIN));

        setCoords({ top, left });
    };

    // 3.2 RaF throttled position updates
    const handleUpdate = () => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            updatePosition();
            rafRef.current = 0;
        });
    };

    useLayoutEffect(() => {
        if (isVisible) {
            updatePosition();
            window.addEventListener('scroll', handleUpdate, { passive: true });
            window.addEventListener('resize', handleUpdate);
            return () => {
                window.removeEventListener('scroll', handleUpdate);
                window.removeEventListener('resize', handleUpdate);
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
            };
        }
    }, [isVisible, position, content]);

    // Handle Escape to dismiss
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isVisible && e.key === 'Escape') {
                e.preventDefault();
                hideTooltip();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    if (disabled) return children;

    const child = React.Children.only(children) as ReactElement<any>;

    // Clone element to attach events and refs
    return (
        <>
            {React.cloneElement(child, {
                ref: (node: any) => {
                    (triggerRef as any).current = node;
                    const { ref } = child as any;
                    if (typeof ref === 'function') ref(node);
                    else if (ref) ref.current = node;
                },
                onMouseEnter: (e: React.MouseEvent) => {
                    showTooltip('hover');
                    child.props.onMouseEnter?.(e);
                },
                onMouseLeave: (e: React.MouseEvent) => {
                    hideTooltip();
                    child.props.onMouseLeave?.(e);
                },
                onFocus: (e: React.FocusEvent) => {
                    showTooltip('focus');
                    child.props.onFocus?.(e);
                },
                onBlur: (e: React.FocusEvent) => {
                    hideTooltip();
                    child.props.onBlur?.(e);
                },
                ...(ariaLabel ? { 'aria-label': child.props['aria-label'] || content } : {}),
                // Bug B: Using unique id for accessibility association
                'aria-describedby': isVisible ? `tooltip-${id}` : undefined,
            })}

            {isVisible && createPortal(
                <div
                    ref={tooltipRef}
                    role="tooltip"
                    id={`tooltip-${id}`}
                    className={`tooltip-portal-content type-${resolvedPosition} ${className} visible`}
                    style={{
                        top: coords.top,
                        left: coords.left,
                    }}
                >
                    {content}
                </div>,
                document.body
            )}
        </>
    );
};
