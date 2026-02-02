import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for combining tailwind classes with logical merging.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
