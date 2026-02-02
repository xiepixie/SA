// Main exports for @v2/markdown-parser

// Parser (direct re-export from pkg)
export { default as init, parse_content } from './pkg/markdown_parser';
export interface ParseResult {
    /** Rendered HTML content */
    html: string;
    /** FNV-1a hash for content caching (UI-only, not cryptographic) */
    hash: string;
    /** Whether the document contains math blocks (language-math code blocks) */
    has_math: boolean;
    /** Whether the document contains code blocks (<pre><code>) */
    has_code: boolean;
    /** Whether the document contains tables */
    has_table: boolean;
    /**
     * Whether the document contains **clickable** wiki-links.
     * [[...]] inside code/pre/a blocks are NOT counted (they remain as literal text).
     * This semantic is intentional: frontend only cares about interactive links.
     */
    has_wiki_links: boolean;
}


// React component
export { MarkdownRenderer, LatexRenderer } from './src/MarkdownRenderer';
export type { MarkdownRendererProps } from './src/MarkdownRenderer';

// 🚀 Prefetch utilities for performance optimization
export { prefetchContent, prefetchBatch, getPrefetchStats, sanitizeLatex } from './src/MarkdownRenderer';
