/**
 * Smart Error Archiver - Dynamic Color System V2.0
 * 
 * This module provides a centralized color management system for:
 * - Question types (choice, fill_blank, short_answer)
 * - Subjects (user-customizable via ManagePage)
 * - Tags (user-customizable via ManagePage)
 * 
 * V2.0 Updates:
 * - Uses CSS variables for theme compatibility
 * - Higher contrast ratios for readability
 * - Optimized for both light and dark themes
 */

// --- Question Type Colors (Theme-aware, semantic meaning) ---
// Using oklch and CSS variables for optimal theme compatibility
export const QUESTION_TYPE_COLORS = {
    choice: {
        // Blue - Structured, logical (Choice Questions)
        text: 'text-sky-700 dark:text-sky-300',
        bg: 'bg-sky-500/[0.08] dark:bg-sky-500/15',
        border: 'border-sky-500/25 dark:border-sky-400/30',
        dot: 'bg-sky-500 dark:bg-sky-400',
        icon: 'text-sky-600 dark:text-sky-400',
        hsl: '199 89% 48%',
    },
    fill_blank: {
        // Emerald/Teal - Completion, filling gaps (Fill-in-the-blank)
        text: 'text-emerald-700 dark:text-emerald-300',
        bg: 'bg-emerald-500/[0.08] dark:bg-emerald-500/15',
        border: 'border-emerald-500/25 dark:border-emerald-400/30',
        dot: 'bg-emerald-500 dark:bg-emerald-400',
        icon: 'text-emerald-600 dark:text-emerald-400',
        hsl: '160 84% 39%',
    },
    short_answer: {
        // Rose/Pink - Expressive, open-ended (Short Answer)
        text: 'text-rose-700 dark:text-rose-300',
        bg: 'bg-rose-500/[0.08] dark:bg-rose-500/15',
        border: 'border-rose-500/25 dark:border-rose-400/30',
        dot: 'bg-rose-500 dark:bg-rose-400',
        icon: 'text-rose-600 dark:text-rose-400',
        hsl: '350 89% 60%',
    }
} as const;

// --- Default Subject/Tag Color Palette ---
// Carefully curated for both light and dark themes
// --- Default Subject/Tag Color Palette (12-Tone Premium System) ---
export const COLOR_PALETTE = [
    { id: 'primary', name: 'Primary', classes: { text: 'text-primary/70 dark:text-primary-content/80', bg: 'bg-primary/10 dark:bg-primary/[0.15]', border: 'border-primary/20 dark:border-primary/30', dot: 'bg-primary' }, hsl: 'var(--p)' },
    { id: 'indigo', name: 'Indigo', classes: { text: 'text-indigo-600 dark:text-indigo-300', bg: 'bg-indigo-500/[0.08] dark:bg-indigo-500/15', border: 'border-indigo-500/20 dark:border-indigo-400/30', dot: 'bg-indigo-500' }, hsl: '239 84% 67%' },
    { id: 'violet', name: 'Violet', classes: { text: 'text-violet-600 dark:text-violet-300', bg: 'bg-violet-500/[0.08] dark:bg-violet-500/15', border: 'border-violet-500/20 dark:border-violet-400/30', dot: 'bg-violet-500' }, hsl: '258 90% 66%' },
    { id: 'teal', name: 'Teal', classes: { text: 'text-teal-600 dark:text-teal-300', bg: 'bg-teal-500/[0.08] dark:bg-teal-500/15', border: 'border-teal-500/20 dark:border-teal-400/30', dot: 'bg-teal-500' }, hsl: '172 66% 50%' },
    { id: 'success', name: 'Success', classes: { text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-500/[0.08] dark:bg-emerald-500/15', border: 'border-emerald-500/20 dark:border-emerald-400/30', dot: 'bg-emerald-500' }, hsl: '142 71% 45%' },
    { id: 'info', name: 'Info', classes: { text: 'text-sky-600 dark:text-sky-300', bg: 'bg-sky-500/[0.08] dark:bg-sky-500/15', border: 'border-sky-500/20 dark:border-sky-400/30', dot: 'bg-sky-500' }, hsl: '199 89% 48%' },
    { id: 'warning', name: 'Warning', classes: { text: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-500/[0.08] dark:bg-amber-500/15', border: 'border-amber-500/20 dark:border-amber-400/30', dot: 'bg-amber-500' }, hsl: '38 92% 50%' },
    { id: 'orange', name: 'Orange', classes: { text: 'text-orange-600 dark:text-orange-300', bg: 'bg-orange-500/[0.08] dark:bg-orange-500/15', border: 'border-orange-500/20 dark:border-orange-400/30', dot: 'bg-orange-500' }, hsl: '24 94% 53%' },
    { id: 'error', name: 'Error', classes: { text: 'text-rose-600 dark:text-rose-300', bg: 'bg-rose-500/[0.08] dark:bg-rose-500/15', border: 'border-rose-500/20 dark:border-rose-400/30', dot: 'bg-rose-500' }, hsl: '349 89% 60%' },
    { id: 'fuchsia', name: 'Fuchsia', classes: { text: 'text-fuchsia-600 dark:text-fuchsia-300', bg: 'bg-fuchsia-500/[0.08] dark:bg-fuchsia-500/15', border: 'border-fuchsia-500/20 dark:border-fuchsia-400/30', dot: 'bg-fuchsia-500' }, hsl: '316 70% 50%' },
    { id: 'neutral', name: 'Neutral', classes: { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/[0.08] dark:bg-slate-500/15', border: 'border-slate-500/20 dark:border-slate-400/30', dot: 'bg-slate-500' }, hsl: '215 16% 47%' },
    { id: 'yellow', name: 'Yellow', classes: { text: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-600/[0.08] dark:bg-yellow-600/15', border: 'border-yellow-600/20 dark:border-yellow-400/30', dot: 'bg-yellow-600' }, hsl: '45 93% 47%' },
] as const;

// Legacy hex to token map (to prevent breakage during migration)
const HEX_TO_TOKEN: Record<string, string> = {
    '#3b82f6': 'primary',
    '#6366f1': 'indigo',
    '#8b5cf6': 'violet',
    '#14b8a6': 'teal',
    '#22c55e': 'success',
    '#06b6d4': 'info',
    '#f59e0b': 'warning',
    '#f97316': 'orange',
    '#ef4444': 'error',
    '#ec4899': 'fuchsia',
    '#64748b': 'neutral',
    '#eab308': 'yellow'
};

// --- Utility: Convert hex to HSL ---
function hexToHsl(hex: string): { h: number, s: number, l: number } {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// --- Utility: Convert color token or hex to theme-compatible styles ---
export function getColorClasses(color: string | null | undefined): {
    text: string;
    bg: string;
    border: string;
    dot: string;
    style?: React.CSSProperties; // For custom hex colors
} {
    if (!color) return COLOR_PALETTE[0].classes;

    const lower = color.toLowerCase();

    // 1. Try token match (primary, indigo, etc.)
    const tokenMatch = COLOR_PALETTE.find(c => c.id === lower);
    if (tokenMatch) return tokenMatch.classes;

    // 2. Try hex match with pre-defined tokens
    const tokenFromHex = HEX_TO_TOKEN[lower];
    if (tokenFromHex) {
        return COLOR_PALETTE.find(c => c.id === tokenFromHex)?.classes || COLOR_PALETTE[0].classes;
    }

    // 3. Dynamic HSL for custom hex colors (Strict DB Binding)
    if (lower.startsWith('#')) {
        const { h, s, l } = hexToHsl(lower);
        // We return empty Tailwind classes but provide the style object for CSS variables
        return {
            text: '',
            bg: '',
            border: '',
            dot: '',
            style: {
                '--brand-h': h,
                '--brand-s': `${s}%`,
                '--brand-l': `${l}%`,
                // These will be used by EntityBadge
            } as React.CSSProperties
        };
    }

    // 4. Final Fallback
    return COLOR_PALETTE[0].classes;
}

// --- Get Question Type Visuals ---
export function getQuestionTypeVisuals(type: 'choice' | 'fill_blank' | 'short_answer') {
    return QUESTION_TYPE_COLORS[type] || QUESTION_TYPE_COLORS.choice;
}

// --- Get Subject/Tag Visuals from stored color ---
export function getEntityVisuals(color: string | null | undefined, fallbackName?: string) {
    const n = fallbackName?.toLowerCase() || '';

    // Special case for "General" or empty subject
    if (n === 'general' || n === 'default' || n === 'unknown' || !n) {
        return {
            text: 'text-base-content/60 dark:text-base-content/50',
            bg: 'bg-base-content/[0.04] dark:bg-base-content/[0.08]',
            border: 'border-base-content/10 dark:border-base-content/15',
            dot: 'bg-base-content/30',
            isGeneral: true,
        };
    }

    const visuals = getColorClasses(color);
    return { ...visuals, isGeneral: false };
}

// --- Generate a random color from palette ---
export function getRandomPaletteColor() {
    return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// --- Get color by ID ---
export function getColorById(id: string) {
    return COLOR_PALETTE.find(c => c.id === id);
}
