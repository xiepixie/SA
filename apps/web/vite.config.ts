import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

/**
 * Extract the actual package name from a module ID.
 * Handles both regular packages (e.g., 'react') and scoped packages (e.g., '@supabase/supabase-js').
 * 
 * This avoids the "includes" substring bug where 'node_modules/react-i18next' 
 * would incorrectly match 'node_modules/react'.
 */
function getPackageName(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  const parts = id.split('node_modules/').pop()?.split('/');
  if (!parts) return undefined;

  // Scoped package: @org/pkg -> @org/pkg
  // Regular package: pkg -> pkg
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),        // Required for @v2/markdown-parser (Rust WASM)
    topLevelAwait() // Required for WASM initialization
  ],
  assetsInclude: ['**/*.wasm'],

  build: {
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks: (id) => {
          const pkg = getPackageName(id);
          if (!pkg) return;

          // React core - stable, cache aggressively
          if (['react', 'react-dom', 'scheduler'].includes(pkg)) {
            return 'react-core';
          }

          // React ecosystem (router) - separate from core for independent updates
          if (['react-router', 'react-router-dom'].includes(pkg)) {
            return 'router';
          }

          // Supabase SDK - Auth & Realtime
          if (pkg.startsWith('@supabase/')) {
            return 'supabase';
          }

          // State management & Data fetching
          if (['zustand', '@tanstack/react-query'].includes(pkg)) {
            return 'state';
          }

          // i18n infrastructure
          if (['i18next', 'react-i18next', 'i18next-http-backend', 'i18next-browser-languagedetector'].includes(pkg)) {
            return 'i18n';
          }

          // KaTeX - Heavy math rendering, lazy load with markdown pages
          if (pkg === 'katex') {
            return 'katex';
          }

          // CSV parsing - only needed for import page
          if (pkg === 'papaparse') {
            return 'csv-parser';
          }

          // Let Rollup handle remaining small packages automatically
          // (lucide-react, clsx, tailwind-merge, class-variance-authority, etc.)
          // This reduces HTTP requests vs splitting every tiny lib
        },

        chunkFileNames: (chunkInfo) => {
          const vendorChunks = ['react-core', 'router', 'supabase', 'state', 'i18n', 'katex', 'csv-parser'];
          if (chunkInfo.name && vendorChunks.includes(chunkInfo.name)) {
            return `assets/${chunkInfo.name}-[hash].js`;
          }
          return 'assets/[name]-[hash].js';
        },

        assetFileNames: (assetInfo) => {
          if (assetInfo.name && /\.(woff2?|ttf|otf|eot)$/.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },

    cssCodeSplit: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false
  },

  // --- CRITICAL: Dev Server Configuration ---
  server: {
    // Allow serving files from the workspace root (needed for WASM in other packages)
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
      ]
    },
    // Forward /api requests to the backend server (port 3001)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },

  // Only specify deps that Vite's auto-discovery genuinely misses
  // Most deps are auto-discovered - only add here if you see repeated optimization warnings
  optimizeDeps: {
    // Include papaparse to pre-bundle it (UMD -> ESM conversion prevents 'this is undefined' error)
    include: ['papaparse'],
    // Exclude heavy deps or those with WASM to avoid path resolution issues during dev
    exclude: ['katex', '@v2/markdown-parser']
  }
})
