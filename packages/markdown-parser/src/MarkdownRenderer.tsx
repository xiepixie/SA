import React, { useLayoutEffect, useEffect, useState, useRef, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import morphdom from 'morphdom';
import katex from 'katex';
import DOMPurify from 'dompurify';
import init, { parse_content } from '../pkg/markdown_parser';
import wasmUrl from '../pkg/markdown_parser_bg.wasm?url';
import type { ParseResult } from '../index';

export { parse_content };

// ✅ P0 FIX: Module-level singleton for WASM initialization
// Prevents race conditions when multiple components initialize concurrently
let wasmInitPromise: Promise<void> | null = null;
let wasmInitialized = false;

function initWasm(): Promise<void> {
    if (wasmInitialized) {
        return Promise.resolve();
    }
    if (wasmInitPromise) {
        return wasmInitPromise;
    }
    performance.mark('wasm-init-start');
    wasmInitPromise = init({ module_or_path: wasmUrl })
        .then(() => {
            wasmInitialized = true;
            performance.mark('wasm-init-end');
            performance.measure('markdown-wasm-init', 'wasm-init-start', 'wasm-init-end');
        })
        .catch((err) => {
            wasmInitPromise = null; // Allow retry on failure
            throw err;
        });
    return wasmInitPromise;
}

// ============================================================
// 🚀 PREFETCH SYSTEM - Pre-render content before user interaction
// ============================================================

interface PrefetchCacheEntry {
    processedHtml: string;
    hash: string;
    timestamp: number;
    mathElements: number; // Count of math elements for priority
}

// LRU-style prefetch cache (max 20 entries, 5min TTL)
const prefetchCache = new Map<string, PrefetchCacheEntry>();
const PREFETCH_CACHE_MAX = 20;
const PREFETCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ✅ KEY FIX: We use the content string ITSELF as the cache key.
// Previous versions used a 32-bit FNV hash which suffered from frequent collisions 
// in large question banks, causing titles and content to swap visually.
// JS engines handle large string keys highly efficiently.
function generateKeyPrefix(content: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/**
 * 🚀 PREFETCH API: Pre-parse and cache content for instant rendering
 *
 * Usage:
 * - Call on hover: prefetchContent(question.content)
 * - Call for adjacent items: prefetchContent(nextQuestion.content)
 *
 * @returns Promise that resolves when prefetch is complete
 */
export async function prefetchContent(content: string): Promise<void> {
    if (!content || content.length > 100_000) return; // Skip empty or huge content

    const cacheKey = content;
    const cached = prefetchCache.get(cacheKey);

    // Skip if already cached and fresh
    if (cached && Date.now() - cached.timestamp < PREFETCH_CACHE_TTL) {
        return;
    }

    // Ensure WASM is ready
    await initWasm();

    // Parse in idle time to avoid blocking
    return new Promise((resolve) => {
        ric(() => {
            try {
                const perfKey = generateKeyPrefix(content);
                performance.mark(`prefetch-start-${perfKey}`);
                const result = parse_content(content);

                // Count math elements for metrics
                const mathCount = (result.html.match(/language-math/g) || []).length;

                // LRU update: remove existing to re-insert at end
                if (prefetchCache.has(cacheKey)) {
                    prefetchCache.delete(cacheKey);
                }

                // Store in cache
                prefetchCache.set(cacheKey, {
                    processedHtml: result.html,
                    hash: result.hash,
                    timestamp: Date.now(),
                    mathElements: mathCount
                });

                // Evict old entries if over limit
                if (prefetchCache.size > PREFETCH_CACHE_MAX) {
                    const oldestKey = prefetchCache.keys().next().value;
                    if (oldestKey) prefetchCache.delete(oldestKey);
                }

                performance.mark(`prefetch-end-${perfKey}`);
                performance.measure(`prefetch-content`, `prefetch-start-${perfKey}`, `prefetch-end-${perfKey}`);

                resolve();
            } catch (err) {
                console.warn('[Prefetch] Parse error:', err);
                resolve(); // Don't reject, just skip
            }
        }, { timeout: 1000 });
    });
}

/**
 * 🚀 BATCH PREFETCH: Pre-render multiple contents in priority order
 * Useful for prefetching visible question cards or navigation targets
 */
export function prefetchBatch(contents: string[], options?: { highPriority?: boolean }): void {
    if (!contents.length) return;

    const schedule = options?.highPriority ? setTimeout : (fn: () => void) => ric(fn, { timeout: 2000 });

    contents.forEach((content, idx) => {
        schedule(() => prefetchContent(content), idx * 50); // Stagger to avoid blocking
    });
}

/**
 * Get prefetch cache status for debugging
 */
export function getPrefetchStats(): { size: number; hits: string[] } {
    return {
        size: prefetchCache.size,
        hits: Array.from(prefetchCache.keys())
    };
}

// ✅ P0-1: SSR-safe requestIdleCallback polyfill
const hasWindow = typeof window !== 'undefined';

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };
type IdleCallback = (deadline: IdleDeadline) => void;
type IdleOptions = { timeout?: number };

const ric: (cb: IdleCallback, opts?: IdleOptions) => number =
    hasWindow && 'requestIdleCallback' in window
        ? (cb, opts) => (window as any).requestIdleCallback(cb, opts)
        : (cb, opts) => globalThis.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), opts?.timeout ?? 1) as unknown as number;

const cic: (id: number) => void =
    hasWindow && 'cancelIdleCallback' in window
        ? (id) => (window as any).cancelIdleCallback(id)
        : (id) => globalThis.clearTimeout(id);

// LRU Cache helper
class LRUCache<K, V> {
    private cache = new Map<K, V>();
    private maxSize: number;
    constructor(maxSize: number) { this.maxSize = maxSize; }
    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    set(key: K, value: V): void {
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

// ✅ P0-2: Store code in memory Map instead of DOM attributes (performance + security)
const codeStore = new LRUCache<string, string>(500);

// ✅ P0-3: Escape for HTML attributes (includes quotes)
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface MarkdownRendererProps {
    content: string;
    className?: string;
    density?: 'comfortable' | 'compact';
    onWikiLinkClick?: (target: string) => void;
    /** Resolve asset filename to a URL for images ![[image.jpg]] */
    resolveAsset?: (filename: string) => string | Promise<string>;
    /** Resolve note name to its parsed HTML content ![[Note#Section]] */
    resolveNote?: (noteName: string) => string | Promise<string>;
    /** Whether to show the "TEX" badge on math elements. Defaults to true. */
    showTexBadge?: boolean;
    /** Optional translation function. Defaults to identity. */
    t?: (key: string, options?: any) => string;
}

// LRU cache for LaTeX HTML
const texHtmlCache = new LRUCache<string, string>(2000);

// ✅ P1: Global Pre-rendering Hub (Singleton) - OPTIMIZED
// This ensures that switching between components or questions doesn't reset the rendering state
class MathRenderHub {
    private observer: IntersectionObserver;
    private queue: Set<HTMLElement> = new Set();
    private isSweepRunning = false;
    private sweepHandle: number | null = null;
    private refCount = 0;

    constructor() {
        if (typeof window === 'undefined') {
            this.observer = {} as any;
            return;
        }

        this.observer = new IntersectionObserver((entries) => {
            const toRender: HTMLElement[] = [];
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target as HTMLElement;
                    this.observer.unobserve(el);
                    // If not yet rendered, add to immediate batch
                    if (!el.dataset.renderedKey) toRender.push(el);
                }
            });
            if (toRender.length > 0) this.renderBatch(toRender);
        }, {
            root: null,
            rootMargin: '1200px', // More aggressive pre-loading for global hub
            threshold: 0.01
        });
    }

    // ✅ P0 优化：评估元素复杂度（用于优先级排序）
    private estimateComplexity(el: HTMLElement): number {
        const tex = el.dataset.tex || el.textContent || '';
        let score = tex.length;
        // 环境块更复杂
        if (tex.includes('\\begin{')) score += 50;
        // 分数、矩阵更复杂
        if (tex.includes('\\frac') || tex.includes('\\matrix')) score += 30;
        // 积分、求和更复杂
        if (tex.includes('\\int') || tex.includes('\\sum')) score += 20;
        return score;
    }


    private renderBatch(items: HTMLElement[]) {
        // ✅ FIX: Removed layout-forcing getViewportDistance call. 
        // Intersecting elements are already visible/near-visible.
        const sorted = items.filter(el => document.contains(el));

        sorted.forEach(el => {
            if (!el.dataset.renderedKey) renderMathElement(el);
            this.queue.delete(el);
        });
    }

    public register(el: HTMLElement) {
        if (el.dataset.renderedKey) return;
        this.observer.observe(el);
        this.queue.add(el);
        this.refCount++;
        this.startIdleSweep();
    }

    public unregister(el: HTMLElement) {
        this.observer.unobserve(el);
        const wasInQueue = this.queue.delete(el);
        if (wasInQueue) this.refCount--;
    }

    private startIdleSweep() {
        if (this.isSweepRunning || this.queue.size === 0) return;
        this.isSweepRunning = true;
        this.sweepHandle = ric((deadline) => this.sweep(deadline), { timeout: 2000 });
    }

    private sweep(deadline: IdleDeadline) {
        // ✅ P0 优化：动态批处理大小，根据剩余时间调整
        const items = Array.from(this.queue);
        if (items.length === 0) {
            this.isSweepRunning = false;
            return;
        }

        // ✅ Optimized: Complexity-only sorting (text-based, NO reflow)
        const scored = items
            .filter((el): el is HTMLElement => document.contains(el) && !el.dataset.renderedKey)
            .map(el => ({
                el,
                priority: this.estimateComplexity(el)
            }))
            .sort((a, b) => a.priority - b.priority);

        let processed = 0;
        const minBatchSize = 2;
        const maxBatchSize = 8;

        while (processed < scored.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
            const { el } = scored[processed];
            if (el && !el.dataset.renderedKey) {
                renderMathElement(el);
            }
            this.queue.delete(el);
            processed++;

            // 动态调整：如果时间充裕，继续处理更多
            if (processed >= maxBatchSize) break;
            if (processed >= minBatchSize && deadline.timeRemaining() < 5) break;
        }

        this.isSweepRunning = false;
        if (this.queue.size > 0) {
            this.startIdleSweep();
        }
    }

    public cleanUp() {
        // No-op for global hub to avoid disabling processing for other instances.
        // The hub manages its own idle sweep lifecycle based on queue size.
    }
}

const mathHub = new MathRenderHub();

// ✅ P0 CONTRACT: Support both markdown-rs output and legacy format
// markdown-rs: <code class="language-math math-inline">...</code>
// legacy:      <span class="math-inline" data-tex="...">...</span>
const MATH_SELECTOR = 'code.language-math, .math-inline, .math-block, code.math-display, span.math-inline';

function notify(messageOrKey: string, level: 'success' | 'error' = 'success', i18nParams?: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent('app-notify', {
        detail: {
            message: messageOrKey, // Fallback for legacy consumers
            i18nKey: messageOrKey, // App.tsx will try to translate this
            i18nParams,
            level
        }
    }));
}

/**
 * P0安全修复：Clipboard复制降级策略
 * 支持HTTPS、非HTTPS、旧浏览器等各种环境
 */
async function copyToClipboard(text: string): Promise<boolean> {
    // Feature detection
    if (!navigator.clipboard?.writeText) {
        // 降级方案：使用传统的textarea + execCommand
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch {
            return false;
        }
    }

    // 现代Clipboard API
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // 可能是权限问题或浏览器拒绝
        console.warn('Clipboard write failed:', error);
        // 再尝试降级方案
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch {
            return false;
        }
    }
}

/**
 * P0 Security: Filter dangerous LaTeX commands before rendering
 */
/**
 * P0 Security: Filter dangerous LaTeX commands before rendering
 */
export function sanitizeLatex(tex: string): string {
    // KaTeX v0.16.21+ patched \htmlData vulnerability
    // As additional defense-in-depth, reject inputs containing known dangerous commands
    const dangerousCommands = [
        '\\htmlData',
        '\\HTML',
        '\\htmlClass',
        '\\htmlId',
        '\\htmlStyle'
    ];

    let clean = tex.trim();

    // ✅ P0 FIX: Robustly strip delimiters if they were captured
    // Handle both single and double delimiters, and recursive wrapping (e.g., $$ $$)
    while ((clean.startsWith('$$') && clean.endsWith('$$')) || (clean.startsWith('$') && clean.endsWith('$'))) {
        if (clean.startsWith('$$') && clean.endsWith('$$') && clean.length >= 4) {
            clean = clean.substring(2, clean.length - 2).trim();
        } else if (clean.startsWith('$') && clean.endsWith('$') && clean.length >= 2) {
            clean = clean.substring(1, clean.length - 1).trim();
        } else {
            break;
        }
    }

    // Safety: prevent nested delimiters that KaTeX can't handle inside a rendered block
    // We only replace if they are at the very start/end to avoid breaking $ inside \text{}

    for (const cmd of dangerousCommands) {
        // Use word boundary check to avoid false positives (e.g. \htmlStyletext)
        // Regex: \cmd(?![a-zA-Z]) ensures we match the full command
        const regex = new RegExp(cmd.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g');
        if (regex.test(clean)) {
            console.warn(`[Security] Blocked potentially dangerous LaTeX command: ${cmd}`);
            // Use \text{} to render the warning safely inside math mode, and add a space
            clean = clean.replace(regex, `\\text{[BLOCKED: ${cmd}]} `);
        }
    }
    return clean;
}

/**
 * ✅ P0 CONTRACT FIX: Support markdown-rs actual output format
 * 
 * markdown-rs outputs math as:
 * - Inline: <code class="language-math math-inline">a_n</code>
 * - Block:  <code class="language-math math-display">...</code>
 * 
 * TeX source is in textContent, NOT data-tex (unlike our old format)
 * Display mode: check for 'math-display' OR 'math-block' class
 */
function renderMathElement(el: HTMLElement): void {
    const rawTex = el.dataset.tex ?? el.textContent ?? '';
    const trimmedRaw = rawTex.trim();

    // ✅ P0: Smart display mode detection
    // 1. Check classes (set by parser)
    // 2. Check for $$ delimiters (raw capture)
    // 3. Check for specific block environments that SHOULD be blocks
    const hasDisplayDelimiters = trimmedRaw.startsWith('$$') && trimmedRaw.endsWith('$$');
    const hasBlockEnv = /\\begin\{(?:aligned|align|gather|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|equation|split)\}/.test(trimmedRaw);

    const displayMode = el.classList.contains('math-display') ||
        el.classList.contains('math-block') ||
        hasDisplayDelimiters ||
        hasBlockEnv;

    const tex = sanitizeLatex(rawTex);

    // ✅ Store cleaned tex back immediately to normalize all interaction sources
    el.dataset.tex = tex;

    // ✅ Normalize classes for consistent CSS targeting
    el.classList.add('not-prose');

    if (displayMode) {
        el.classList.add('math-block');
        el.classList.remove('math-inline');
    } else {
        el.classList.add('math-inline');
        el.classList.remove('math-block');
    }

    const cacheKey = (displayMode ? 'D|' : 'I|') + tex;
    el.classList.remove('show-source');

    // Safety check: if no tex content, don't try to render
    if (!tex.trim()) return;

    if (el.dataset.renderedKey === cacheKey) return;

    const perfId = `katex-${cacheKey.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '')}`;
    performance.mark(`${perfId}-start`);

    try {
        let html = texHtmlCache.get(cacheKey);
        if (!html) {
            // 🚨 P0 安全：KaTeX渲染不可信LaTeX源的安全配置
            // KaTeX v0.16.27 (≥ 0.16.21 required per advisory)
            html = katex.renderToString(tex, {
                displayMode,
                throwOnError: false,
                output: 'html',
                // 安全选项：禁用信任模式和危险功能
                trust: false,  // 禁止 \href、\url、\includegraphics 等
                // ✅ 修复：允许 Unicode (如中文分号) 在数学模式中出现，避免用户误输入导致报错
                strict: (errorCode: string) =>
                    errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                // 明确禁用 \htmlData 等危险命令（KaTeX 0.16.21+修复）
                macros: {},  // 不允许自定义宏
            });
            texHtmlCache.set(cacheKey, html);
            performance.mark(`${perfId}-rendered`);
        } else {
            performance.mark(`${perfId}-cache-hit`);
        }
        el.innerHTML = html;
        el.dataset.renderedKey = cacheKey;
        el.classList.add('is-rendered');
        el.classList.remove('math-error');
        if (el.querySelector('.katex-error')) el.classList.add('math-error');

        performance.mark(`${perfId}-end`);
        performance.measure(`katex-render`, `${perfId}-start`, `${perfId}-end`);
    } catch {
        el.textContent = tex;
        el.classList.add('math-error');
        el.dataset.renderedKey = cacheKey;
    }

    // ✅ Store tex in data-tex for popover/interaction (normalize format)
    if (!el.dataset.tex) {
        el.dataset.tex = tex;
    }
}

/**
 * ✅ P0 FIX: Smart LaTeX syntax highlighting with proper tokenization
 *
 * Problems solved:
 * 1. Double escaping: escapeHtml first, then regex matching broke entities
 * 2. Selection issues: Tokenizer approach preserves selection flow
 * 3. HTML entity handling: Decode first if input already has entities
 */
const LATEX_GREEK = new Set(['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma', '\\tau', '\\upsilon', '\\phi', '\\chi', '\\psi', '\\omega', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega', '\\varepsilon', '\\varphi', '\\varpi', '\\varrho', '\\varsigma', '\\vartheta']);
const LATEX_FUNCTIONS = new Set(['\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp', '\\lim', '\\max', '\\min', '\\sup', '\\inf', '\\det', '\\deg', '\\dim', '\\ker', '\\arg', '\\arccos', '\\arcsin', '\\arctan', '\\sinh', '\\cosh', '\\tanh', '\\cot', '\\sec', '\\csc', '\\arcsinh', '\\arccosh', '\\arctanh']);
const LATEX_SYMBOLS = new Set(['\\sum', '\\int', '\\prod', '\\partial', '\\nabla', '\\infty', '\\forall', '\\exists', '\\in', '\\notin', '\\subset', '\\supset', '\\cup', '\\cap', '\\to', '\\rightarrow', '\\Rightarrow', '\\gets', '\\leftarrow', '\\Leftarrow', '\\leftrightarrow', '\\Leftrightarrow', '\\approx', '\\neq', '\\le', '\\ge', '\\times', '\\cdot', '\\pm', '\\mp', '\\hbar', '\\imath', '\\jmath', '\\ell', '\\wp', '\\Re', '\\Im', '\\aleph', '\\beth', '\\daleth', '\\gimel', '\\complement', '\\ell', '\\eth', '\\hbar', '\\hslash', '\\mho', '\\partial', '\\sqsubset', '\\sqsupset', '\\vartriangle', '\\triangledown', '\\triangleleft', '\\triangleright', '\\Box', '\\Diamond', '\\flat', '\\natural', '\\sharp', '\\clubsuit', '\\diamondsuit', '\\heartsuit', '\\spadesuit', '\\surd', '\\top', '\\bottom', '\\neg', '\\lnot', '\\land', '\\lor', '\\ni', '\\owns', '\\propto', '\\sim', '\\perp', '\\cdot', '\\circ', '\\ast', '\\times', '\\div', '\\pm', '\\mp', '\\oplus', '\\ominus', '\\otimes', '\\oslash', '\\odot', '\\wedge', '\\vee', '\\cap', '\\cup', '\\sqcap', '\\sqcup', '\\uplus', '\\amalg', '\\setminus', '\\bullet', '\\star', '\\dagger', '\\ddagger', '\\wr']);

function highlightLatex(tex: string): string {
    // Step 1: Decode HTML entities and normalize
    let source = tex
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    // Step 2: Tokenize - extract syntax elements into placeholders
    const tokens: Array<{ placeholder: string; html: string }> = [];
    let tokenId = 0;

    const createToken = (match: string, className: string): string => {
        const placeholder = `\x00T${tokenId++}\x00`;
        tokens.push({ placeholder, html: `<span class="${className}">${escapeHtml(match)}</span>` });
        return placeholder;
    };

    // Order matters: most specific patterns first
    // 1. Line breaks
    source = source.replace(/\\\\/g, m => createToken(m, 'tex-newline'));

    // 2. Control Sequences (Commands) - handle greek letters, functions, and symbols specifically
    source = source.replace(/\\[a-zA-Z]+/g, m => {
        if (LATEX_GREEK.has(m)) return createToken(m, 'tex-greek');
        if (LATEX_FUNCTIONS.has(m)) return createToken(m, 'tex-function');
        if (LATEX_SYMBOLS.has(m)) return createToken(m, 'tex-symbol');
        if (m === '\\begin' || m === '\\end') return createToken(m, 'tex-env-cmd');
        return createToken(m, 'tex-command');
    });

    // 3. Environment Arguments: {matrix}, {aligned} etc.
    // Try to match arguments of \begin or \end specifically for better coloring
    source = source.replace(/(\{)([a-zA-Z\*]+)(\})/g, (_match, p1, p2, p3) => {
        return createToken(p1, 'tex-brace') + createToken(p2, 'tex-env-name') + createToken(p3, 'tex-brace');
    });

    // 4. Special escaped chars like \{ \} \$ \& \%
    source = source.replace(/\\[{}$#%&_^~]/g, m => createToken(m, 'tex-escape'));

    // 5. Brackets & Parentheses
    source = source.replace(/[\{\}\[\]\(\)]/g, m => createToken(m, 'tex-brace'));

    // 6. Operators, Equal signs & Aligners
    source = source.replace(/[&_^=+\-*\/<>]|\\pm|\\mp|\\to|\\approx/g, m => createToken(m, 'tex-operator'));

    // Step 3: Escape remaining plain text
    source = escapeHtml(source);

    // Step 4: Replace placeholders with highlighted HTML
    for (const { placeholder, html } of tokens) {
        source = source.replace(placeholder, html);
    }

    return source;
}

/**
 * ✅ P1 ENHANCED: Smart LaTeX source beautification
 *
 * Features:
 * 1. Decode HTML entities (from dataset.tex)
 * 2. Smart line breaking at \\ (LaTeX newlines) for single-line formulas
 * 3. Auto-indentation for \begin{...} / \end{...} environments
 * 4. Comprehensive environment support (aligned, cases, matrix, etc.)
 * 5. Preserve original formatting if already multi-line
 */
function formatLatexSource(tex: string): string[] {
    // Step 1: Decode HTML entities and normalize
    let source = tex
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // Step 2: Smart Prettifying
    // 1. Break before/after environments
    source = source.replace(/(\\begin\{[^\}]+\})/g, '\n$1\n');
    source = source.replace(/(\\end\{[^\}]+\})/g, '\n$1\n');

    // 2. Break after LaTeX line breaks \\
    source = source.replace(/\\\\/g, '\\\\\n');

    // 3. Normalize alignment operators (&) - No longer split here to keep matrix rows together
    source = source.replace(/\s*&\s*/g, ' & ');

    // 4. Force breaks for very long formulas that have no structure
    if (!source.includes('\n') && source.length > 50) {
        let depth = 0;
        let result = '';
        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (char === '{') depth++;
            else if (char === '}') depth--;

            // Break at principal operators (=, \to) at top level
            if (depth === 0 && i > 25) {
                if (char === '=' && source[i - 1] !== '\\' && source[i - 1] !== '<' && source[i - 1] !== '>') {
                    result += '\n  = ';
                    continue;
                }
            }
            result += char;
        }
        source = result;
    }

    let rawLines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Step 3: Auto-indent based on \begin{} and \end{} nesting
    const nestingEnvs = new Set([
        'aligned', 'align', 'align*', 'alignat', 'alignat*', 'flalign', 'flalign*',
        'eqnarray', 'eqnarray*', 'cases', 'dcases', 'rcases', 'dcases*', 'rcases*',
        'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix',
        'array', 'tabular', 'tabular*', 'equation', 'equation*', 'gather', 'gather*',
        'multline', 'multline*', 'split', 'subequations', 'empheq',
    ]);

    const result: string[] = [];
    let depth = 0;
    const INDENT = '  ';

    for (const line of rawLines) {
        // Decrease indent BEFORE the line if it starts with \end
        const endMatch = line.match(/^\\end\{([\w\*]+)\}/);
        if (endMatch && nestingEnvs.has(endMatch[1])) {
            depth = Math.max(0, depth - 1);
        }

        // Add indented line
        result.push(INDENT.repeat(depth) + line);

        // Increase indent AFTER the line if it starts with \begin
        const beginMatch = line.match(/^\\begin\{([\w\*]+)\}/);
        if (beginMatch && nestingEnvs.has(beginMatch[1])) {
            if (!line.includes('\\end{' + beginMatch[1] + '}')) {
                depth++;
            }
        }
    }

    return result.length > 0 ? result : [''];
}

function toggleMathSource(el: HTMLElement, t: (key: string, options?: any) => string = (k, o) => o?.defaultValue || k): void {
    const tex = el.dataset.tex || '';
    const isShowingSource = el.classList.contains('show-source');

    // Formulas with \begin{...} environments, multiple \\, or very long text should use block display
    const hasBlockContent = /\\begin\{/.test(tex) || (tex.match(/\\\\/g) || []).length >= 2 || tex.length > 80;
    const isBlock = el.classList.contains('math-block') || el.classList.contains('math-display') || hasBlockContent;

    if (isShowingSource) {
        // Restore to rendered formula
        delete el.dataset.renderedKey;
        el.classList.remove('show-source');
        renderMathElement(el);
    } else {
        // Toggle to source view with premium container style
        el.classList.add('show-source');
        el.classList.remove('is-rendered');

        // ✅ FIX: Use smart formatting for multi-line display
        const formattedLines = formatLatexSource(tex);
        const blockId = `math-src-${Date.now().toString(36)}`;

        // ✅ UNIFIED: Wrap in .code-fence-container to reuse all code block styling
        const content = isBlock
            ? `<div class="code-fence-container latex-source" data-lang="latex" data-key="${blockId}">
                <div class="code-fence-header" data-key="${blockId}-h">
                    <div class="code-header-left">
                        <div class="code-dots">
                            <div class="code-dot code-dot-red"></div>
                            <div class="code-dot code-dot-amber"></div>
                            <div class="code-dot code-dot-green"></div>
                        </div>
                        <span class="code-lang-chip">LaTeX</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="code-close-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all text-xs font-bold" aria-label="${t('markdown.action.back_to_render', { defaultValue: '返回渲染' })}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"></path></svg>
                            <span>${t('markdown.action.back', { defaultValue: '返回' })}</span>
                        </button>
                        <button class="code-copy-btn" aria-label="${t('markdown.action.copy_latex', { defaultValue: '复制 LaTeX' })}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>
                            <span>${t('markdown.action.copy', { defaultValue: '复制' })}</span>
                        </button>
                    </div>
                </div>
                <div class="code-fence mockup-code" data-key="${blockId}-c">${formattedLines.map((line, i) => {
                const lineId = `${blockId}-L${i + 1}`;
                return `<pre id="${lineId}" data-key="${lineId}" tabindex="-1" data-prefix="${i + 1}" data-line="${i + 1}"><code>${highlightLatex(line)}</code></pre>`;
            }).join('')}</div>
                <div class="latex-ref-panel hidden">
                    <div class="ref-panel-header">
                        <span class="ref-panel-title">${t('markdown.panel.latex_ref', { defaultValue: 'LaTeX 参考' })}</span>
                        <button class="ref-panel-close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="ref-panel-content"></div>
                </div>
            </div>`
            : `<code class="math-source-content">${highlightLatex(tex)}<button class="inline-copy-btn ml-2 opacity-30 hover:opacity-100 transition-opacity" title="${t('markdown.action.copy', { defaultValue: '复制' })}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg></button></code>`;

        el.innerHTML = content;

        // ✅ UX: Setup buttons
        const container = el.querySelector('.code-fence-container') as HTMLElement;
        const copyBtn = el.querySelector('.code-copy-btn');
        const inlineCopyBtn = el.querySelector('.inline-copy-btn');
        const closeBtn = el.querySelector('.code-close-btn');
        const refBtn = el.querySelector('.code-ref-btn');
        const refPanel = el.querySelector('.latex-ref-panel') as HTMLElement;
        const refClose = el.querySelector('.ref-panel-close');
        const refContent = el.querySelector('.ref-panel-content');

        const doCopy = (targetEl?: HTMLElement) => {
            copyToClipboard(tex).then(success => {
                if (success) {
                    notify('markdown:markdown.notifications.latex_source_copied');
                    (targetEl || el).classList.add('is-copied');
                    setTimeout(() => (targetEl || el).classList.remove('is-copied'), 400);
                }
            });
        };

        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                doCopy(container);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMathSource(el);
            });
        }

        if (inlineCopyBtn) {
            inlineCopyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                doCopy(el);
            });
        }

        if (isBlock && refPanel && refContent) {
            // Reference panel logic for LaTeX source view. 
            // Note: refBtn logic removed as it is not present in the current UI template.
            refClose?.addEventListener('click', (e) => {
                e.stopPropagation();
                refPanel.classList.add('hidden');
            });
        }

        const codeArea = el.querySelector('.code-fence.mockup-code') as HTMLElement;
        if (codeArea) {
            setupCodeBlockScrollDetection(codeArea);
        }
    }
}

function getLatexDescription(cmd: string): string {
    const DESCRIPTIONS: Record<string, string> = {
        '\\alpha': 'Alpha (希腊字母)',
        '\\beta': 'Beta (希腊字母)',
        '\\gamma': 'Gamma (希腊字母)',
        '\\delta': 'Delta (希腊字母)',
        '\\theta': 'Theta (希腊字母)',
        '\\lambda': 'Lambda (希腊字母)',
        '\\pi': 'Pi (圆周率)',
        '\\sigma': 'Sigma (标准差/求和)',
        '\\omega': 'Omega (频率)',
        '\\sum': '累加求和',
        '\\int': '积分符号',
        '\\prod': '累乘符号',
        '\\partial': '偏导数符号',
        '\\nabla': '梯度算子',
        '\\infty': '无穷大',
        '\\frac': '分式',
        '\\dfrac': '显示模式分式',
        '\\sqrt': '根号',
        '\\hbar': '约化普朗克常数',
        '\\hat': '向量/算符帽子',
        '\\bar': '平均值符号',
        '\\vec': '向量符号',
        '\\begin': '环境开始',
        '\\end': '环境结束',
        '\\matrix': '基础矩阵',
        '\\pmatrix': '圆括号矩阵',
        '\\bmatrix': '方括号矩阵',
    };
    return DESCRIPTIONS[cmd] || '';
}

/**
 * ✅ P0: Extract a specific section from HTML based on header hierarchy
 * Matches Obsidian/Wiki transclusion logic: captures from header until next header of same or higher level.
 */
function extractSection(html: string, fragmentPath: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const fragments = fragmentPath.split('#').map(norm);

    let startNode: Element | null = null;
    let currentLevel = 0;

    // 1. Precise Recursive Scope Slicing
    for (const f of fragments) {
        let candidates: Element[] = [];

        if (!startNode) {
            // Initial search: anywhere in the document
            candidates = Array.from(temp.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        } else {
            // Sub-search: only search within the scope of startNode
            // Captured headers must be sub-headings (level > currentLevel)
            // and appear before any heading of level <= currentLevel
            let curr = startNode.nextElementSibling;
            while (curr) {
                if (/^H[1-6]$/.test(curr.tagName)) {
                    const level = parseInt(curr.tagName[1]);
                    if (level <= currentLevel) break; // Exit scope
                    candidates.push(curr);
                }
                curr = curr.nextElementSibling;
            }
        }

        const found = candidates.find(h => norm(h.textContent || '') === f);
        if (!found) return ''; // Link broke or heading renamed

        startNode = found;
        currentLevel = parseInt(found.tagName[1]);
    }

    if (!startNode) return '';

    // 2. Section Slicing: Capture content including the start node
    const fragment_nodes: Node[] = [startNode.cloneNode(true)];
    let cur = startNode.nextSibling;
    while (cur) {
        if (cur.nodeType === 1) { // Element
            const el = cur as HTMLElement;
            if (/^H[1-6]$/.test(el.tagName)) {
                if (parseInt(el.tagName[1]) <= currentLevel) break;
            }
        }
        fragment_nodes.push(cur.cloneNode(true));
        cur = cur.nextSibling;
    }

    const wrap = document.createElement('div');
    wrap.className = 'wiki-embed-section-content';
    fragment_nodes.forEach(node => wrap.appendChild(node));
    return wrap.innerHTML;
}

// Global resolve cache to prevent redundant fetches within the same render cycle
const noteContentCache = new Map<string, string | Promise<string>>();

// toggleCodeSource - reserved for future code block source toggle feature
// function toggleCodeSource(el: HTMLElement): void { ... }

// escapeHtml is defined at module scope above (P0-3 fix)

/**
 * 基础语法高亮 - 使用正则表达式为常见语言添加颜色
 * 支持: Python, JavaScript, TypeScript, Java, C/C++, Rust, Go等
 */
const highlightCache = new Map<string, RegExp>();

function highlightCode(code: string, language: string): string {
    const lang = language.toLowerCase();
    let highlighted = escapeHtml(code);
    const patterns: Array<{ regex: RegExp; className: string }> = [];

    // 1. Compile or get cached patterns
    const getRegex = (key: string, source: string, flags = 'g') => {
        const cacheKey = `${lang}|${key}`;
        if (!highlightCache.has(cacheKey)) highlightCache.set(cacheKey, new RegExp(source, flags));
        return highlightCache.get(cacheKey)!;
    };

    if (['python', 'ruby', 'bash', 'shell'].includes(lang)) {
        patterns.push({ regex: getRegex('comment', /(#.*$)/.source, 'gm'), className: 'token comment' });
    } else if (['javascript', 'typescript', 'java', 'c', 'cpp', 'rust', 'go', 'csharp'].includes(lang)) {
        patterns.push({ regex: getRegex('comment-sl', /(\/\/.*$)/.source, 'gm'), className: 'token comment' });
        patterns.push({ regex: getRegex('comment-ml', /(\/\*[\s\S]*?\*\/)/.source, 'g'), className: 'token comment' });
    }
    patterns.push({ regex: getRegex('string', /(&quot;[^&quot;]*&quot;|'[^']*'|&#39;[^#]*&#39;)/.source, 'g'), className: 'token string' });
    patterns.push({ regex: getRegex('number', /\b(\d+\.?\d*)\b/.source, 'g'), className: 'token number' });

    const keywords: Record<string, string[]> = {
        python: ['def', 'class', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'in', 'return', 'yield', 'lambda', 'with', 'try', 'except', 'finally', 'raise', 'True', 'False', 'None', 'and', 'or', 'not', 'is', 'async', 'await'],
        javascript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'new', 'this', 'super', 'static', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof'],
        typescript: ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'async', 'await', 'new', 'this', 'super', 'static', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'interface', 'type', 'enum', 'public', 'private', 'protected', 'readonly'],
        rust: ['fn', 'let', 'mut', 'const', 'static', 'if', 'else', 'match', 'for', 'while', 'loop', 'return', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'async', 'await', 'where'],
    };

    const langKeywords = keywords[lang] || keywords.javascript;
    patterns.push({ regex: getRegex('keyword', `\\b(${langKeywords.join('|')})\\b`, 'g'), className: 'token keyword' });
    patterns.push({ regex: getRegex('function', /\b(\w+)(?=\()/.source, 'g'), className: 'token function' });

    // 2. Optimized Tokenization Flow
    const parts: Array<{ text: string; isToken: boolean }> = [{ text: highlighted, isToken: false }];
    for (const { regex, className } of patterns) {
        const newParts: Array<{ text: string; isToken: boolean }> = [];
        for (const part of parts) {
            if (part.isToken) { newParts.push(part); continue; }
            let lastIdx = 0; let m; regex.lastIndex = 0;
            while ((m = regex.exec(part.text)) !== null) {
                if (m.index > lastIdx) newParts.push({ text: part.text.substring(lastIdx, m.index), isToken: false });
                newParts.push({ text: `<span class="${className}">${m[0]}</span>`, isToken: true });
                lastIdx = m.index + m[0].length;
            }
            if (lastIdx < part.text.length) newParts.push({ text: part.text.substring(lastIdx), isToken: false });
        }
        parts.length = 0; parts.push(...newParts);
    }
    return parts.map(p => p.text).join('');
}

/**
 * ✅ 代码块滚动状态检测
 * 当代码块滚动到底部时添加 .scrolled-bottom 类，隐藏渐变遮罩
 */
const scrollListenerMap = new WeakMap<HTMLElement, () => void>();

function setupCodeBlockScrollDetection(el: HTMLElement): void {
    // 避免重复添加监听器
    if (scrollListenerMap.has(el)) return;

    const checkScrollPosition = () => {
        const isScrolledToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
        const isScrollable = el.scrollHeight > el.clientHeight + 10;

        if (isScrollable && isScrolledToBottom) {
            el.classList.add('scrolled-bottom');
        } else {
            el.classList.remove('scrolled-bottom');
        }
    };

    // 初始检查
    checkScrollPosition();

    // 添加滚动监听
    el.addEventListener('scroll', checkScrollPosition, { passive: true });
    scrollListenerMap.set(el, checkScrollPosition);
}



export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
    content,
    className = '',
    density = 'comfortable',
    onWikiLinkClick,
    resolveAsset,
    resolveNote,
    showTexBadge = true,
    t = (k: string, o?: any) => o?.defaultValue || k
}) => {
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [wasmReady, setWasmReady] = useState(false);
    const lastHashRef = useRef<string>('');
    // Note: mathIdleHandleRef reserved for future math batching cancellation
    const idleHandleRef = useRef<number | null>(null); // ✅ For cancelling pending updates

    // ✅ P1-2: Refs for interaction management
    const longPressTimerRef = useRef<number | null>(null);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const lastActiveLineRef = useRef<HTMLElement | null>(null);
    const lastSelectedLineRef = useRef<HTMLElement | null>(null);
    const embedQueueRef = useRef<Set<HTMLElement>>(new Set());
    const embedObserverRef = useRef<IntersectionObserver | null>(null);
    const previewTimerRef = useRef<number | null>(null);
    const [preview, setPreview] = useState<{
        target: string;
        page: string;
        fragment: string;
        x: number;
        y: number;
        content: string | null;
        visible: boolean;
    } | null>(null);


    useEffect(() => {
        initWasm()
            .then(() => setWasmReady(true))
            .catch(err => {
                console.error('WASM initialization failed:', err);
                setError('Parser initialization error');
            });
    }, []);

    const handleMouseEnter = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const wikiLink = target.closest('.wiki-link');

        if (wikiLink instanceof HTMLElement) {
            const { target: linkTarget, page, fragment } = wikiLink.dataset;
            if (!linkTarget || !page) return;

            // Clear any pending dismissal
            if (previewTimerRef.current) {
                window.clearTimeout(previewTimerRef.current);
                previewTimerRef.current = null;
            }

            // Simple debounce for showing (150ms)
            previewTimerRef.current = window.setTimeout(async () => {
                const rect = wikiLink.getBoundingClientRect();

                // ✅ UX: Viewport-aware positioning
                const menuWidth = 320;
                let x = rect.left + window.scrollX;
                // If it overflows right side of window
                if (x + menuWidth > window.innerWidth + window.scrollX - 20) {
                    x = window.innerWidth + window.scrollX - menuWidth - 20;
                }

                // Set initial loading state
                setPreview({
                    target: linkTarget,
                    page,
                    fragment: fragment || '',
                    x: Math.max(10, x),
                    y: rect.bottom + window.scrollY + 8,
                    content: null,
                    visible: true
                });

                // Fetch content
                if (resolveNote) {
                    try {
                        let html = noteContentCache.get(page);
                        if (html instanceof Promise) html = await html;
                        if (!html) {
                            const p = resolveNote(page);
                            noteContentCache.set(page, p);
                            html = await p;
                            noteContentCache.set(page, html);
                        }

                        if (fragment) {
                            html = extractSection(html, fragment);
                        }

                        setPreview(prev => prev?.page === page ? { ...prev, content: html || 'No content found' } : prev);
                    } catch (err) {
                        setPreview(prev => prev?.page === page ? { ...prev, content: 'Failed to load preview' } : prev);
                    }
                }
            }, 150);
        }
    }, [resolveNote]);

    const handleMouseLeave = useCallback(() => {
        if (previewTimerRef.current) {
            window.clearTimeout(previewTimerRef.current);
            previewTimerRef.current = null;
        }

        // Delay dismissal slightly to allow moving mouse TO the preview (optional, but smoother)
        previewTimerRef.current = window.setTimeout(() => {
            setPreview(null);
        }, 100);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;

        // 0. Handle wiki links [[...]]
        const wikiLink = target.closest('.wiki-link');
        if (wikiLink instanceof HTMLAnchorElement) {
            e.preventDefault();
            const linkTarget = wikiLink.dataset.target;
            if (linkTarget && onWikiLinkClick) {
                onWikiLinkClick(linkTarget);
            }
            return;
        }

        // 1. Handle anchor links (both the hover icon and generic internal links)
        const anchor = target.closest('a');
        if (anchor && anchor instanceof HTMLAnchorElement) {
            const href = anchor.getAttribute('href');
            if (href?.startsWith('#') && href.length > 1) {
                e.preventDefault();
                const id = decodeURIComponent(href.slice(1));

                // Prioritize local lookup in case of multiple renderers
                const targetElement = containerRef.current?.querySelector(`[id="${CSS.escape(id)}"]`) || document.getElementById(id);

                if (targetElement) {
                    // Find the closest scrollable parent (handles nested scroll containers like in test pages)
                    const getScrollParent = (element: HTMLElement): HTMLElement | null => {
                        let parent: HTMLElement | null = element.parentElement;
                        while (parent) {
                            const style = window.getComputedStyle(parent);
                            const overflowY = style.overflowY;
                            if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
                                return parent;
                            }
                            parent = parent.parentElement;
                        }
                        return null;
                    };

                    const scrollContainer = getScrollParent(targetElement as HTMLElement);

                    if (scrollContainer) {
                        // Calculate position relative to the scrollable container
                        const containerRect = scrollContainer.getBoundingClientRect();
                        const targetRect = targetElement.getBoundingClientRect();
                        const scrollOffset = targetRect.top - containerRect.top + scrollContainer.scrollTop - 80; // 80px header offset

                        scrollContainer.scrollTo({
                            top: Math.max(0, scrollOffset),
                            behavior: 'smooth'
                        });
                    } else {
                        // Fallback to standard scrollIntoView for window-level scrolling
                        targetElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }

                    // Update URL hash (address bar) without causing a page jump
                    window.history.pushState(null, '', '#' + id);

                    // UX: Auto-copy is disabled by default to avoid annoyance, 
                    // users can right-click the link if they want the URL.
                } else {
                    // Fallback: update URL anyway
                    window.history.replaceState(null, '', '#' + id);
                }
                return;
            }
        }

        // 2. Handle code copy button  
        const copyBtn = target.closest('.code-copy-btn');
        if (copyBtn) {
            const container = copyBtn.closest('.code-fence-container') as HTMLElement;

            // ✅ P1: 优先级逻辑 —— 优先复制选中的行
            const selectedLines = container?.querySelectorAll('pre.is-selected, pre[aria-selected="true"]');

            if (selectedLines && selectedLines.length > 0) {
                // 仅复制选中的行
                const lines = Array.from(selectedLines).map(el => {
                    const codeEl = el.querySelector('code');
                    return codeEl?.textContent || '';
                });
                copyToClipboard(lines.join('\n')).then(ok => {
                    notify(ok ? 'markdown:markdown.notifications.code_lines_copied' : 'markdown:markdown.notifications.copy_failed', ok ? 'success' : 'error', ok ? { count: lines.length } : undefined);
                    if (ok) {
                        // 触发复制成功闪烁
                        container.classList.add('is-copied');
                        selectedLines.forEach(line => line.classList.add('is-copied'));
                        setTimeout(() => {
                            container.classList.remove('is-copied');
                            selectedLines.forEach(line => line.classList.remove('is-copied'));
                        }, 400);
                    }
                });
            } else {
                // ✅ P0-2: Read full code from Map, not DOM attribute
                const codeKey = container.dataset.codeKey;
                const fullCode = codeKey ? codeStore.get(codeKey) || '' : '';
                if (fullCode) {
                    copyToClipboard(fullCode).then(success => {
                        notify(success ? 'markdown:markdown.notifications.code_copied' : 'markdown:markdown.notifications.copy_failed', success ? 'success' : 'error');
                        if (success) {
                            container.classList.add('is-copied');
                            const codeElements = container.querySelectorAll('.mockup-code pre');
                            codeElements.forEach(line => line.classList.add('is-copied'));
                            setTimeout(() => {
                                container.classList.remove('is-copied');
                                codeElements.forEach(line => line.classList.remove('is-copied'));
                            }, 400);
                        }
                    });
                }
            }
            return;
        }

        // 3. Handle IDE Line Interaction (Active / Selection / Range)
        const codeLine = target.closest('.mockup-code pre');
        if (codeLine instanceof HTMLElement) {
            const container = codeLine.closest('.code-fence-container') as HTMLElement;

            // ✅ P0 Fix: Convert CSS rem to pixels for accurate gutter detection
            const style = getComputedStyle(container);
            const gutterRem = parseFloat(style.getPropertyValue('--code-gutter')) || 3.5;
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const gutterPx = gutterRem * rootFontSize;

            const rect = codeLine.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const isGutterClick = clickX < gutterPx;

            // ✅ IDE State 1: Active (always happen on any click)
            if (lastActiveLineRef.current && lastActiveLineRef.current !== codeLine) {
                lastActiveLineRef.current.classList.remove('is-active');
            }
            codeLine.classList.add('is-active');
            lastActiveLineRef.current = codeLine;
            codeLine.focus();

            // ✅ IDE State 2: Range Selection (Shift + Click)
            if (e.shiftKey && lastSelectedLineRef.current && lastSelectedLineRef.current.parentElement === codeLine.parentElement) {
                const allLines = Array.from(codeLine.parentElement!.querySelectorAll('pre'));
                const startIdx = allLines.indexOf(lastSelectedLineRef.current as HTMLPreElement);
                const endIdx = allLines.indexOf(codeLine as HTMLPreElement);
                const [low, high] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];

                allLines.forEach((line, idx) => {
                    if (idx >= low && idx <= high) {
                        line.classList.add('is-selected');
                        line.setAttribute('aria-selected', 'true');
                    }
                });
                // Update copy button counter
                const count = container.querySelectorAll('pre.is-selected').length;
                const copySpan = container.querySelector('.code-copy-btn span');
                if (copySpan) copySpan.textContent = `复制 ${count} 行`;
                return;
            }

            // ✅ IDE State 3: Toggle Selection (Gutter Click) - supports multi-select
            if (isGutterClick) {
                const isSelected = codeLine.classList.toggle('is-selected');
                codeLine.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                // Always update lastSelectedLineRef on gutter click for range selection anchor
                lastSelectedLineRef.current = codeLine;

                const count = container.querySelectorAll('pre.is-selected').length;
                const copySpan = container.querySelector('.code-copy-btn span');
                if (copySpan) copySpan.textContent = count > 0 ? t('markdown.action.copy_lines', { defaultValue: `复制 ${count} 行`, count }) : t('markdown.action.copy', { defaultValue: '复制' });
                return;
            }

            // ✅ IDE State 4: Click on code content (non-gutter)
            // Clear selection unless Ctrl/Cmd held
            if (!e.ctrlKey && !e.metaKey) {
                container.querySelectorAll('pre.is-selected').forEach(el => {
                    el.classList.remove('is-selected');
                    el.removeAttribute('aria-selected');
                });
                const copySpan = container.querySelector('.code-copy-btn span');
                if (copySpan) copySpan.textContent = t('markdown.action.copy', { defaultValue: '复制' });
            }

            // Update anchor for potential future Shift+Click
            lastSelectedLineRef.current = codeLine;
        }

        const interactive = target.closest(MATH_SELECTOR);
        if (interactive instanceof HTMLElement && interactive.dataset.tex) {
            // ✅ UX: All click interactions on rendered math are disabled to prevent accidental copy/UI popups.
            // Power users can use double-click to view source and copy.
            return;
        }

    }, []);

    const handleContextMenu = useCallback((_e: React.MouseEvent) => {
        // ✅ UX: Disable custom context menu for formula to keep interaction simple and less discoverable/annoying.
        // We rely on double-click instead.
    }, []);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;

        const mathEl = target.closest(MATH_SELECTOR);
        if (mathEl instanceof HTMLElement && mathEl.dataset.tex) {
            toggleMathSource(mathEl);
            return;
        }
    }, []);


    // ✅ P1-4: Split parsing (useEffect) from DOM patching (useLayoutEffect) for performance
    // Step 1: Parse content in useEffect (non-blocking)
    const [parsedResult, setParsedResult] = useState<{ processedHtml: string; hash: string } | null>(null);

    useEffect(() => {
        if (!wasmReady || !content) return;

        // 🚀 Performance: Check prefetch cache first
        const cacheKey = content;
        const cached = prefetchCache.get(cacheKey);
        if (cached) {
            prefetchCache.delete(cacheKey);
            prefetchCache.set(cacheKey, cached);
        }

        let result: ParseResult;
        const perfId = `render-${generateKeyPrefix(content).slice(0, 8)}`;
        performance.mark(`${perfId}-start`);

        try {
            if (cached && Date.now() - cached.timestamp < PREFETCH_CACHE_TTL) {
                // ✅ CACHE HIT: Use pre-parsed content
                result = {
                    html: cached.processedHtml,
                    hash: cached.hash,
                    has_math: cached.processedHtml.includes('language-math'),
                    has_code: cached.processedHtml.includes('<pre><code'),
                    has_table: cached.processedHtml.includes('<table'),
                    has_wiki_links: cached.processedHtml.includes('wiki-link'),
                    has_wiki_embeds: cached.processedHtml.includes('wiki-embed')
                };
                performance.mark(`${perfId}-cache-hit`);
            } else {
                // CACHE MISS: Parse now
                result = parse_content(content);
                performance.mark(`${perfId}-parsed`);
            }
            setError(null);
        } catch (err) {
            console.error(err);
            setError(String(err));
            return;
        }

        if (result.hash === lastHashRef.current) return;
        lastHashRef.current = result.hash;

        let processedHtml = result.html;
        // ✅ P0-2: Table wrapper key uses hash prefix for cross-document uniqueness
        if (result.has_table) {
            let tableIdx = 0;
            processedHtml = processedHtml.replace(/<table/g, () => `<div class="md-table-wrap" data-key="tw-${result.hash.substring(0, 10)}-${++tableIdx}"><table`).replace(/<\/table>/g, '</table></div>');
        }

        // ⚓ Markdown Anchor IDs processing (syntax: ### Heading {#id})
        // Robust regex for finding manual anchor IDs like {#my-id}
        processedHtml = processedHtml.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (fullMatch, level, attrs, content) => {
            // Permissive match for {#id} pattern (handles typical parser escapes for { } and #)
            const idPattern = /(?:\{|&#123;)(?:\#|&#35;|\x23)([a-zA-Z0-9\-_.]+)(?:\}|&#125;)/;
            const idMatch = content.match(idPattern);

            if (idMatch) {
                const anchorId = idMatch[1];
                const cleanContent = content.replace(new RegExp(idPattern.source, 'g'), '').trim();
                const cleanAttrs = attrs.replace(/\bid="[^"]*"/, '').trim();

                // Deep link icon: navigates and updates URL hash natively
                const linkIcon = `<a href="#${anchorId}" class="anchor-link-icon" aria-hidden="true" title="跳转至此小节">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </a>`;

                return `<h${level} ${cleanAttrs} id="${anchorId}" class="group relative flex items-center">
                    <span class="flex-1">${cleanContent}</span>
                    ${linkIcon}
                </h${level}>`;
            }
            return fullMatch;
        });

        // 🎨 性能优化：统一代码处理 + 修复 ID 冲突 (P0)
        let blockCounter = 0;
        const processCodeBlock = (langMeta: string, code: string) => {
            blockCounter++;
            const blockId = `cb-${result.hash.substring(0, 10)}-${blockCounter}`;

            // ✅ 支持自定义标题：```python:filename.py 或 ```python title="My Title"
            let lang = langMeta;
            let title = '';
            if (langMeta.includes(':')) {
                const [l, t] = langMeta.split(':');
                lang = l;
                title = t;
            } else if (langMeta.includes(' ')) {
                const match = langMeta.match(/^(\w+)\s+title="([^"]+)"/);
                if (match) {
                    lang = match[1];
                    title = match[2];
                } else {
                    lang = langMeta.split(' ')[0];
                }
            }

            const decodedCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

            // ✅ P0-2: Store code in Map, not DOM attribute (performance + security)
            codeStore.set(blockId, decodedCode);

            // ✅ FIX: Remove trailing empty lines to avoid half-visible extra line
            const codeLines = decodedCode.replace(/\n+$/, '').split('\n');

            const linesHtml = codeLines.map((line, i) => {
                const hl = highlightCode(line, lang);
                const lineId = `${blockId}-L${i + 1}`;
                return `<pre id="${lineId}" data-key="${lineId}" tabindex="-1" data-prefix="${i + 1}" data-line="${i + 1}"><code>${hl}</code></pre>`;
            }).join('');

            const headerText = title || lang.toUpperCase();
            const headerClass = title ? 'code-title' : 'code-lang-chip';

            return `<div class="code-fence-container" data-lang="${escapeHtml(lang)}" data-key="${blockId}" data-code-key="${blockId}">
                <div class="code-fence-header" data-key="${blockId}-h">
                    <div class="code-header-left">
                        <div class="code-dots"><div class="code-dot code-dot-red"></div><div class="code-dot code-dot-amber"></div><div class="code-dot code-dot-green"></div></div>
                        <span class="${headerClass}">${escapeHtml(headerText)}</span>
                    </div>
                    <button class="code-copy-btn" aria-label="${t('markdown.action.copy_code', { defaultValue: '复制代码' })}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>
                        <span>${t('markdown.action.copy', { defaultValue: '复制' })}</span>
                    </button>
                </div>
                <div class="code-fence mockup-code" data-key="${blockId}-c">${linesHtml}</div>
            </div>`;
        };

        if (result.has_code) {
            // ✅ P0 FIX: 排除 language-math 类的代码块，它们应由 KaTeX 渲染而非代码块样式
            processedHtml = processedHtml.replace(/<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g, (_: any, l: any, c: any) => {
                // Skip math blocks - they will be rendered by KaTeX
                if (l === 'math' || l.startsWith('math ') || l.includes('math-') || l === 'latex') {
                    // Return a simplified structure for KaTeX to process
                    // ✅ P0 FIX: Fenced code blocks should ALWAYS be display mode by default
                    // unless specifically marked as inline
                    const isDisplay = l.includes('display') || l.includes('block') || l === 'math' || l === 'latex';
                    const classes = `language-math ${isDisplay ? 'math-block math-display' : 'math-inline'}`;
                    return `<code class="${classes}">${c}</code>`;
                }
                return processCodeBlock(l, c);
            });
            processedHtml = processedHtml.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (m: any, c: any) => m.includes('code-fence-container') ? m : processCodeBlock('text', c));
        }

        // 📝 Obsidian Callouts (Admonitions) Processing
        // Regex pattern: <blockquote>...[!TYPE] TITLE<br/>CONTENT...</blockquote>
        // Supports nested content and various line break formats
        processedHtml = processedHtml.replace(/<blockquote>\s*<p>\s*\[!(\w+)\][ \t]*(.*?)(?:\n|<br \/>|<\/p>)([\s\S]*?)<\/blockquote>/g, (_, type, title, content) => {
            const lowerType = type.toLowerCase();
            const displayTitle = title.trim() || type.charAt(0).toUpperCase() + type.slice(1);

            // ✅ FIX: Keep original type for CSS styling, don't remap
            // CSS handles all known types with specific colors:
            // - Blue: theory, info, note, abstract
            // - Purple: proof, cite  
            // - Green: example, tip, success, todo
            // - Orange: warning, help, question
            // - Red: danger, failure, error, bug
            const calloutType = lowerType;

            // Cleanup content if it was inside a <p> that we partially matched
            let finalContent = content.trim();
            if (!finalContent.startsWith('<p>') && !finalContent.endsWith('</p>')) {
                // If it's a single block of text left over from our paragraph break
                if (!finalContent.includes('<p>')) {
                    finalContent = `<p>${finalContent}</p>`;
                }
            }

            // ✅ FIX: Don't escape displayTitle - it comes from parsed markdown
            // and may contain <code class="language-math"> for inline math
            // DOMPurify will sanitize the final output anyway
            return `<div class="md-callout" data-type="${escapeHtml(calloutType)}" data-obsidian-type="${escapeHtml(lowerType)}">
                <div class="md-callout-title">${displayTitle}</div>
                <div class="md-callout-content">${finalContent}</div>
            </div>`;
        });

        // ✅ P0-3: Non-blocking update with proper cancellation
        if (idleHandleRef.current) cic(idleHandleRef.current);
        const update = () => {
            setParsedResult({ processedHtml, hash: result.hash });
            idleHandleRef.current = null;
            performance.mark(`${perfId}-state-updated`);
            performance.measure(`markdown-parse-total`, `${perfId}-start`, `${perfId}-state-updated`);
        };
        if (content.length > 5000) idleHandleRef.current = ric(update, { timeout: 200 });
        else update();

        return () => { if (idleHandleRef.current) cic(idleHandleRef.current); };
    }, [content, wasmReady]);

    useLayoutEffect(() => {
        if (!parsedResult || !containerRef.current) return;

        const perfId = `dom-${parsedResult.hash.slice(0, 8)}`;
        performance.mark(`${perfId}-morph-start`);

        // 🚨 P0-4: Direct fragment injection to reduce parse cycles
        // Security: Filter style attribute to allow only safe CSS properties
        const ALLOWED_STYLE_PROXIES = new Set(['text-align', 'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'padding-left', 'margin-left']);

        DOMPurify.addHook('afterSanitizeAttributes', (node) => {
            if ('style' in node) {
                const style = node.getAttribute('style');
                if (style) {
                    const parts = style.split(';').map(s => s.trim()).filter(Boolean);
                    const filtered = parts.filter(part => {
                        const prop = part.split(':')[0].toLowerCase().trim();
                        // Protect against url() or other advanced CSS vectors
                        return ALLOWED_STYLE_PROXIES.has(prop) && !part.includes('url(');
                    });
                    if (filtered.length > 0) {
                        node.setAttribute('style', filtered.join('; '));
                    } else {
                        node.removeAttribute('style');
                    }
                }
            }
        });

        const fragment = DOMPurify.sanitize(parsedResult.processedHtml, {
            RETURN_DOM_FRAGMENT: true,
            // ✅ Restore ID for deep linking and style for KaTeX/Layout
            // Note: 'style' is still allowed in ADD_ATTR, but our hook will sanitize its content.
            ADD_ATTR: ['id', 'style', 'data-tex', 'data-target', 'data-page', 'data-fragment', 'data-embed', 'data-type', 'data-alias', 'data-key', 'data-lang', 'data-code', 'data-code-key', 'data-prefix', 'data-line', 'aria-selected', 'aria-hidden', 'tabindex'],
            ADD_TAGS: ['svg', 'path'],
            USE_PROFILES: { html: true, mathMl: true, svg: true },
        }) as unknown as DocumentFragment;

        // Clean up hook to avoid affecting other sanitize calls if any
        DOMPurify.removeHook('afterSanitizeAttributes');

        // ✅ Robustness: Wrapper div for morphdom compatibility with fragments
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);

        const mathQueue = new Set<HTMLElement>();
        morphdom(containerRef.current, tempDiv, {
            childrenOnly: true,
            // ✅ P0-3: Safe nodeType check before accessing dataset
            getNodeKey: (node: any) => {
                if (!node || (node as any).nodeType !== 1) return null;
                const el = node as HTMLElement;
                return el.dataset.key || el.id || null;
            },
            onBeforeElUpdated: (from: any, to: any) => {
                if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) return true;
                const fk = from.dataset.key, tk = to.dataset.key;
                // ✅ P0-4: Preserve interactive state on keyed nodes (IDE experience)
                if (fk && fk === tk) {
                    ['is-selected', 'is-active', 'is-copied'].forEach(cls => {
                        if (from.classList.contains(cls)) to.classList.add(cls);
                    });
                    if (from.getAttribute('aria-selected') === 'true') {
                        to.setAttribute('aria-selected', 'true');
                    }
                    // ✅ P1-2: Fast path - skip update if content hash matches
                    // OR if it's already rendered math and the source hasn't changed
                    if (from.dataset.tex === to.dataset.tex && from.dataset.code === to.dataset.code) {
                        // If it was already rendered, preserve the rendered HTML in the 'to' element
                        // This prevents morphdom from clearing the rendered math and showing raw TeX for a split second
                        if (from.dataset.renderedKey) {
                            to.innerHTML = from.innerHTML;
                            to.dataset.renderedKey = from.dataset.renderedKey;
                        }
                        return false;
                    }
                }
                return true; // Let morphdom handle the actual diff
            },
            onNodeAdded: (n: any) => {
                if (n instanceof HTMLElement) {
                    if (n.classList.contains('math-inline') || n.classList.contains('math-block')) mathQueue.add(n);
                    n.querySelectorAll(MATH_SELECTOR).forEach(el => mathQueue.add(el as HTMLElement));

                    // ✅ WikiEmbed Lazy Loading & Rendering
                    if (n.classList.contains('wiki-embed') && !n.dataset.rendered) {
                        embedQueueRef.current.add(n);
                    }
                    n.querySelectorAll('.wiki-embed:not([data-rendered])').forEach(el => {
                        embedQueueRef.current.add(el as HTMLElement);
                    });

                    // ✅ 代码块滚动状态检测：添加滚动监听器
                    if (n.classList.contains('code-fence') && n.classList.contains('mockup-code')) {
                        setupCodeBlockScrollDetection(n);
                    }
                    n.querySelectorAll('.code-fence.mockup-code').forEach(el => {
                        setupCodeBlockScrollDetection(el as HTMLElement);
                    });
                }
                return n;
            },
            onElUpdated: (el: any) => {
                if (el instanceof HTMLElement && (el.classList.contains('math-inline') || el.classList.contains('math-block')) && !el.dataset.renderedKey) mathQueue.add(el);
            },
            onNodeDiscarded: (n: any) => {
                if (n instanceof HTMLElement) {
                    if (n.classList.contains('math-inline') || n.classList.contains('math-block')) mathHub.unregister(n);
                    n.querySelectorAll(MATH_SELECTOR).forEach(el => mathHub.unregister(el as HTMLElement));
                }
            }
        } as any);
        containerRef.current.querySelectorAll(`${MATH_SELECTOR}:not([data-rendered-key])`).forEach(el => mathQueue.add(el as HTMLElement));

        // ✅ P0-3: Accessibility fixes must ALWAYS run, not be skipped by early return
        // Set up a11y attributes BEFORE setting up observer
        if (containerRef.current) {
            containerRef.current.querySelectorAll(MATH_SELECTOR).forEach((el) => {
                const mathEl = el as HTMLElement;
                const isBlock = mathEl.classList.contains('math-block') || mathEl.classList.contains('math-display');
                // ✅ Accessibility: Only make math blocks focusable. 
                // Inline math in large documents creates too much Tab interference.
                if (!mathEl.hasAttribute('tabindex')) {
                    mathEl.setAttribute('tabindex', isBlock ? '0' : '-1');
                }
                // 添加语义化角色
                if (!mathEl.hasAttribute('role')) {
                    mathEl.setAttribute('role', isBlock ? 'button' : 'presentation');
                }
                // 添加可访问性标签
                if (!mathEl.hasAttribute('aria-label')) {
                    const label = t('markdown.aria.math_label', {
                        defaultValue: `数学${isBlock ? '公式块' : '公式'}，双击${isBlock ? '或按回车' : ''}查看源码`,
                        type: isBlock ? t('markdown.aria.type_block', { defaultValue: '公式块' }) : t('markdown.aria.type_inline', { defaultValue: '公式' }),
                        action: isBlock ? t('markdown.aria.action_block', { defaultValue: '或按回车' }) : t('markdown.aria.action_inline', { defaultValue: '' })
                    });
                    mathEl.setAttribute('aria-label', label);
                }
            });
        }

        if (mathQueue.size > 0) {
            mathQueue.forEach(el => mathHub.register(el));
            performance.mark(`${perfId}-math-queued`);
        }

        // ✅ P0: WikiEmbed Task Scheduling
        if (embedQueueRef.current.size > 0) {
            embedQueueRef.current.forEach(el => {
                embedObserverRef.current?.observe(el);
            });
            embedQueueRef.current.clear();
        }

        performance.mark(`${perfId}-morph-end`);
        performance.measure(`markdown-dom-update`, `${perfId}-morph-start`, `${perfId}-morph-end`);

        return () => {
            // Components don't disconnect the hub, just unobserve items they added if they are vanishing
            // (But unobserve is handled by IntersectionObserver automatically if items are removed from DOM)
            // We just ensure sweep handle is managed
            mathHub.cleanUp();
        };
    }, [parsedResult]);

    // ✅ P1-2: Touch interaction support for mobile devices
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const target = e.target as HTMLElement;
        const mathEl = target.closest(MATH_SELECTOR);

        if (mathEl instanceof HTMLElement && mathEl.dataset.tex) {
            const touch = e.touches[0];
            touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

            // Start long-press timer (350ms is standard for mobile long-press)
            longPressTimerRef.current = window.setTimeout(() => {
                // Verify touch hasn't moved significantly (drag vs press)
                toggleMathSource(mathEl, t);
                // Haptic feedback if available
                if ('vibrate' in navigator) {
                    navigator.vibrate(10);
                }
            }, 350);
        }
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        // Cancel long-press if user is scrolling/dragging
        if (longPressTimerRef.current && touchStartPosRef.current) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
            const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

            // 10px threshold for movement
            if (deltaX > 10 || deltaY > 10) {
                window.clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        // Clear long-press timer if touch ends before trigger
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        touchStartPosRef.current = null;
    }, []);

    // ✅ P0: WikiEmbed Observer Lifecycle
    useEffect(() => {
        if (!wasmReady) return;

        embedObserverRef.current = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target as HTMLElement;
                    embedObserverRef.current?.unobserve(el);
                    // Trigger actual embed rendering (implemented below)
                    renderWikiEmbed(el);
                }
            });
        }, { rootMargin: '400px' });

        return () => {
            embedObserverRef.current?.disconnect();
        };
    }, [wasmReady]);

    // Cleanup touch timers on unmount
    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                window.clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // ✅ P0修复：支持Enter和Space键（ARIA button pattern）
        if (e.key === 'Enter' || e.key === ' ') {
            const target = e.target as HTMLElement;
            const mathEl = target.closest(MATH_SELECTOR);
            if (mathEl instanceof HTMLElement && mathEl.dataset.tex) {
                e.preventDefault();  // 防止Space滚动页面
                toggleMathSource(mathEl, t);
            }
        }
    }, []);

    // ✅ P0: Implementation of WikiEmbed rendering
    async function renderWikiEmbed(el: HTMLElement) {
        const { type, target, page, fragment, alias } = el.dataset;
        if (!page) return;

        el.classList.add('is-loading');

        try {
            if (type === 'image') {
                if (!resolveAsset) throw new Error('Asset resolver not provided');
                const src = await resolveAsset(page);
                el.innerHTML = '';
                const img = document.createElement('img');
                img.src = src;
                const displayLabel = alias || page;
                img.alt = displayLabel;
                img.loading = 'lazy';
                el.appendChild(img);

                if (displayLabel) {
                    const cap = document.createElement('div');
                    cap.className = 'wiki-embed-caption';
                    cap.textContent = displayLabel;
                    el.appendChild(cap);
                }
            } else {
                // Note / Transclusion
                if (!resolveNote) throw new Error('Note resolver not provided');

                // Check cache first
                let noteHtml = noteContentCache.get(page);
                if (noteHtml instanceof Promise) noteHtml = await noteHtml;
                if (!noteHtml) {
                    const promise = resolveNote(page);
                    noteContentCache.set(page, promise);
                    noteHtml = await promise;
                    noteContentCache.set(page, noteHtml);
                }

                if (fragment) {
                    noteHtml = extractSection(noteHtml, fragment);
                    if (!noteHtml) {
                        throw new Error(`Section not found: ${fragment}`);
                    }
                }

                // Inject content with a stylized header link
                const headerHtml = `
                    <div class="wiki-embed-header">
                        <span class="wiki-embed-breadcrumb">${page}${fragment ? ' > ' + fragment.replace(/#/g, ' > ') : ''}</span>
                        <a href="${page}${fragment ? '#' + fragment : ''}" class="wiki-link wiki-embed-link-icon" data-target="${page}${fragment ? '#' + fragment : ''}" title="打开原始笔记">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x11="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>
                    </div>
                `;

                el.innerHTML = headerHtml + `<div class="wiki-embed-content">${noteHtml}</div>`;

                // Recursive Enhancement: Process math, code etc inside embedded content
                el.querySelectorAll(MATH_SELECTOR).forEach(m => mathHub.register(m as HTMLElement));
                el.querySelectorAll('.code-fence.mockup-code').forEach(c => setupCodeBlockScrollDetection(c as HTMLElement));
                // Handle nested embeds
                el.querySelectorAll('.wiki-embed:not([data-rendered])').forEach(e => renderWikiEmbed(e as HTMLElement));
            }

            el.dataset.rendered = '1';
        } catch (err) {
            console.warn('[WikiEmbed] Render failed:', err);
            el.innerHTML = `
                <div class="wiki-embed-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <span>${err instanceof Error ? err.message : 'Embed failed'}</span>
                </div>
            `;
        } finally {
            el.classList.remove('is-loading');
        }
    }

    if (!wasmReady) return <div className="flex items-center gap-2 p-4 text-base-content/50"><span className="loading loading-spinner loading-sm" /></div>;
    if (error) return <div className="alert alert-error m-4 rounded-xl shadow-lg border-none">{error}</div>;

    // Support both legacy prose-none and new data-density attribute
    const isProseNone = className.includes('prose-none');
    const baseClasses = isProseNone
        ? "markdown-body max-w-none prose-none"
        : "markdown-body prose prose-sm max-w-none prose-p:text-inherit prose-p:leading-relaxed prose-p:mb-4 prose-strong:text-inherit prose-strong:font-black prose-pre:bg-transparent prose-pre:p-0";

    return (
        <>
            <div
                ref={containerRef}
                className={`${baseClasses} ${className}`}
                data-density={density === 'compact' ? 'compact' : undefined}
                data-hide-tex-badge={showTexBadge ? undefined : ''}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onDoubleClick={handleDoubleClick}
                onKeyDown={handleKeyDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseOver={handleMouseEnter}
                onMouseOut={handleMouseLeave}
            />

            {/* ✅ WikiLink Preview Popover */}
            {preview && preview.visible && (
                <div
                    className="wiki-link-preview sea glass-panel shadow-premium-lg"
                    style={{
                        position: 'absolute',
                        left: preview.x,
                        top: preview.y,
                        width: '320px',
                        maxHeight: '240px',
                        overflow: 'hidden',
                        zIndex: 1000,
                        padding: '1rem',
                        pointerEvents: 'none', // Allow clicking "through" if needed, or 'auto' to interact
                        borderRadius: '16px',
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        animation: 'preview-fade-in 0.2s ease-out'
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 border-bottom border-base-content/10 pb-2 mb-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span className="font-bold truncate text-primary">{preview.page}{preview.fragment ? ` #${preview.fragment}` : ''}</span>
                        </div>
                        {preview.content === null ? (
                            <div className="flex items-center justify-center p-4">
                                <span className="loading loading-spinner loading-xs text-primary/50" />
                            </div>
                        ) : (
                            <div
                                className="prose prose-xs text-base-content/80 line-clamp-6 mask-fade-bottom"
                                dangerouslySetInnerHTML={{ __html: preview.content }}
                            />
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes preview-fade-in {
                    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .mask-fade-bottom {
                    mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
                }
            `}} />
        </>
    );
});

export const LatexRenderer = MarkdownRenderer;
export default MarkdownRenderer;

// 🚀 Prefetch utilities are exported inline at their function definitions above

/**
 * 📊 PERFORMANCE MONITOR: Get rendering performance metrics
 * Call this from DevTools console: window.__getMarkdownPerf?.()
 *
 * Returns aggregated timing data for:
 * - WASM initialization
 * - Markdown parsing
 * - DOM updates (morphdom)
 * - KaTeX rendering
 */
export function getPerformanceMetrics(): {
    wasm: PerformanceEntryList;
    parse: PerformanceEntryList;
    dom: PerformanceEntryList;
    katex: PerformanceEntryList;
    prefetch: PerformanceEntryList;
    summary: { avg: number; max: number; count: number } | null;
} {
    const wasm = performance.getEntriesByName('markdown-wasm-init');
    const parse = performance.getEntriesByType('measure').filter(e => e.name === 'markdown-parse-total');
    const dom = performance.getEntriesByType('measure').filter(e => e.name === 'markdown-dom-update');
    const katex = performance.getEntriesByType('measure').filter(e => e.name === 'katex-render');
    const prefetch = performance.getEntriesByType('measure').filter(e => e.name === 'prefetch-content');

    // Calculate summary
    const allTimes = [...parse, ...dom].map(e => e.duration);
    const summary = allTimes.length > 0 ? {
        avg: allTimes.reduce((a, b) => a + b, 0) / allTimes.length,
        max: Math.max(...allTimes),
        count: allTimes.length
    } : null;

    return { wasm, parse, dom, katex, prefetch, summary };
}

// Expose to window for DevTools access
if (typeof window !== 'undefined') {
    (window as any).__getMarkdownPerf = getPerformanceMetrics;
    (window as any).__getPrefetchStats = getPrefetchStats;
}
