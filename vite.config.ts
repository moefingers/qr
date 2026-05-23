import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two HTML entries:
//   index.html         → editor (root /qr/)
//   present/index.html → fullscreen presenter (/qr/present/)
// Both share the design system and theme-init.js. The relative `base`
// keeps everything portable on GitHub Pages where the site lives at a
// non-root path (/qr/).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        present: resolve(__dirname, 'present/index.html'),
      },
    },
  },
});
