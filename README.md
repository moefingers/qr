# Styled QR Generator

Single-file offline QR code generator. Everything — code, styles, fonts, favicon, workers — is inlined into one HTML file you can drop on any static host (or open via `file://`) and it runs end-to-end with no network. Six dot shapes, corner styles, color gradients, and logo embedding with sub-module-accurate distance-field dot dodging. CSS animation system (sweep, pulse, wave, radial loop, breathe, spiral, color cycle) with high-fidelity export via WebCodecs to MP4, WebM, GIF (Floyd-Steinberg dithered), PNG, and WebP. Supports vCard contacts with .vcf import (UTF-8/Arabic), URLs, plain text, WiFi auto-connect, email, and SMS. Style saves with drag-to-reorder + star-pin a primary, presets, all persisted to localStorage. No server, no accounts, no telemetry.

**Live:** https://moefingers.github.io/qr/

## Views

One HTML, two views, hash-routed from `src/main.tsx`:

- **Editor** (default) — build a QR, style it, save presets, export.
- **`#present`** — fullscreen presenter. Reads saved presets and the live draft from localStorage and renders a single QR fullscreen for scanning. Selection precedence: `?id=<saveId>` query → primary-pinned save → first save → live draft. Tap anywhere to hide/show the chrome. The "Present" button in the editor header opens `#present`; the "Editor" link in the presenter clears the hash.

## Features

**QR types** — vCard contacts (with .vcf import, UTF-8/Arabic encoding detection), URL, plain text, WiFi auto-connect, email, and SMS.

**Styling** — six dot shapes (square, circle, rounded, diamond, star, heart), three corner styles, foreground/background colors, linear and radial gradients, transparent backgrounds, color presets, saveable style profiles.

**Logo** — upload any image or SVG with distance-field dodging: 2-pass exact Euclidean Distance Transform (Felzenszwalb) at 4× module oversampling, with configurable aggressiveness, soft fade, and per-module coverage threshold. SVG color sync with QR gradient.

**Animation** — eight types (sweep, pulse, wave, radial loop, breathe, spiral, color cycle, off) driven by CSS `@property` + animated gradients, with bounce direction, ease-curve dropdown, per-stop color + position animation, and a seamless-loop warning for `sweep`/`radialLoop` configurations that won't wrap cleanly.

**Saves** — drag tiles to reorder (pointer-events + view-transition FLIP), star a tile to mark a primary, opt-in animated previews. Save tiles render the live QR data so the preview matches what users will actually scan.

**Export** — MP4 and WebM via WebCodecs VideoEncoder (H.264/VP9, 60fps, hardware-accelerated), GIF with Floyd-Steinberg dithering, PNG and WebP static frames from animated QRs, .vcf contact download, copy data to clipboard.

**Theme** — light / dark / system mode, persisted to localStorage (`qr-mode`). Pre-paint FOUC bootstrap via blocking `theme-init.js`. Mode toggle wrapped in `document.startViewTransition` for a smooth crossfade.

**Persistence** — all form data, style settings, saved profiles, primary pin, and theme preference stored in localStorage.

## Stack

React 19, TypeScript 6, Vite 8, qrcode-generator, gifenc, mp4-muxer, webm-muxer. Design system is CSS custom properties + `@layer` + CSS Modules + native nesting — no Tailwind, no UI framework.

## Development

```
pnpm install
pnpm dev
```

## Build

`pnpm build` emits exactly one file: `dist/index.html`. Build-time helpers:

- `vite-plugin-singlefile` inlines every JS chunk and CSS module
- `?worker&inline` in `qr-export-gif.ts` and `qr-export-video.ts` packages the workers as base64-encoded Blob URLs
- `build/inline-html-deps.ts` inlines `theme-init.js`, the favicon (as a data: URI), and the Google Fonts CSS + every woff2 file (fetched at build time)

The resulting `index.html` makes zero network requests at runtime.

## Deployment

Built and deployed automatically to GitHub Pages via Actions on push to `shepherd`. Pre-commit hook runs TypeScript and ESLint via husky.
