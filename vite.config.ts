import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';
import { inlineHtmlDeps } from './build/inline-html-deps';

// One HTML, one app, everything inlined.
//
// The whole project is a single self-contained index.html. There are
// no chunks, no worker files, no font files, no favicon files, no
// theme-init file emitted alongside it — every dependency is embedded
// at build time:
//
//   - JS modules + CSS: inlined by vite-plugin-singlefile
//   - Web workers (gif, video): inlined via Vite's `?worker&inline`
//     suffix, runtime constructs them from a Blob URL
//   - theme-init.js (pre-paint mode bootstrap): inlined as <script>
//     by build/inline-html-deps.ts
//   - favicon.svg: inlined as data: URI
//   - Google Fonts CSS + every woff2: fetched at build time and
//     embedded as data: URIs
//
// Editor and presenter live in the same bundle; main.tsx branches
// between them based on the URL hash (`#present` -> presenter).
//
// `inlineDynamicImports: true` collapses any dynamic import() into the
// entry chunk so there's no separate chunk file to load.
//
// Relative `base` keeps the file portable: drag dist/index.html
// anywhere, double-click, and the app runs offline with no server.
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({ useRecommendedBuildConfig: false, removeViteModuleLoader: true }),
    inlineHtmlDeps({ assetsDir: resolve(__dirname, 'build/assets') }),
  ],
  base: './',
  build: {
    cssCodeSplit: true,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
