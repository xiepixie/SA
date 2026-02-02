/**
 * Re-export MarkdownRenderer for backward compatibility
 * Import directly from the package source using the correct relative path
 */
export { MarkdownRenderer, LatexRenderer } from '../../../../packages/markdown-parser/src/MarkdownRenderer';
export type { MarkdownRendererProps } from '../../../../packages/markdown-parser/src/MarkdownRenderer';
export { default } from '../../../../packages/markdown-parser/src/MarkdownRenderer';

// 🚀 Prefetch utilities for performance optimization
export { prefetchContent, prefetchBatch, getPrefetchStats } from '../../../../packages/markdown-parser/src/MarkdownRenderer';
