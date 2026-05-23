# Styled QR Generator

One HTML file. Open it. It runs.

The whole app — editor, fullscreen presenter, eight animation engines, MP4/WebM/GIF/PNG/WebP exporters, fonts, favicon — is inlined into a single `index.html`. Drop it on any static host, double-click it from disk, host it offline behind a firewall. Zero network requests at runtime, no accounts, no backend, no telemetry.

**Live:** https://moefingers.github.io/qr/

## At a glance

- **Six data modes**: vCard contact (with .vcf import, UTF-8/Arabic), URL, plain text, WiFi auto-connect, email, SMS
- **Full styling**: six dot shapes, three corner styles, linear + radial gradients, transparent backgrounds, color presets
- **Logo embedding** with sub-module-accurate distance-field dodging that works on any SVG or raster image
- **Eight animation types**: sweep, pulse, wave, radial loop, breathe, spiral, color cycle, off — each with bounce direction and ease curves
- **High-fidelity export**: hardware-accelerated MP4/WebM via WebCodecs, Floyd–Steinberg-dithered GIF, PNG/WebP static frames, .vcf download, clipboard copy
- **Drag-to-reorder saves** with star-pin a primary, animated tile previews
- **Fullscreen `#present` route** for showing customers their QR on a phone or tablet, offline
- **Dark / light / system theme**, view-transitioned, FOUC-free
- **localStorage-only persistence**

## Views

One HTML, two views, hash-routed from `src/main.tsx`:

- **Editor** (default) — build a QR, style it, save presets, export.
- **`#present`** — fullscreen presenter. Reads saved presets and the live editor draft from localStorage and renders one QR fullscreen for scanning. Selection precedence: `?id=<saveId>` query → primary-pinned save → first save → live draft. Tap anywhere to hide/show the chrome. The "Present" button in the editor header opens `#present`; the "Editor" link in the presenter clears the hash.

## Features

**QR data types** — vCard contacts (with .vcf import detecting UTF-8, windows-1256 for Arabic, and iso-8859-1 fallback; quoted-printable + base64 decoding; RFC 2425 line unfolding), URL, plain text, WiFi auto-connect, email (`mailto:` with subject + body), and SMS (`smsto:` with prefilled message).

**Styling** — six dot shapes (square, circle, rounded, diamond, star, heart), three corner styles, foreground / background / corner colors, linear and radial gradients with per-angle control, transparent backgrounds, eight color presets, and saveable style profiles.

**Byte budget** — live byte counter under the preview shows `X / 2,953 bytes` for the current QR. The counter shifts to a warning color once the data approaches the limit at which scan reliability degrades.

**Logo** — upload any image or SVG. The dodge mask uses a 2-pass exact Euclidean Distance Transform (Felzenszwalb 1D parabola envelope) at 4× module oversampling, with three knobs: aggressiveness (clearance distance), softness (fade-out width), and per-module coverage threshold (filters thin strokes that would otherwise drag huge clearance zones). SVG color sync with QR gradient via a colorizer that handles stroke-only icons and root-level `fill="none"` correctly.

**Animation** — eight types driven by CSS `@property` + animated repeating gradients (`pulse`/`colorCycle` use uniform-color keyframes via sampled `colorAtPhase`; `spiral` uses an animated conic-gradient angle). Three direction modes (forward, reverse, bounce) and five timing curves (linear, ease, ease-in, ease-out, ease-in-out) with per-type defaults applied when you pick a type. A seamless-loop checker warns when `sweep` / `radialLoop` stop configurations won't wrap cleanly across the cycle boundary.

**Saves** — drag tiles to reorder via pointer events, with a floating ghost tile that follows the cursor and a view-transition FLIP committing the new order. Star a tile to mark a primary (used by the `#present` route). Opt-in animated previews. Save tiles render the live QR data so the preview matches what users will actually scan.

**Export** —
- MP4 and WebM via WebCodecs `VideoEncoder` (H.264/VP9, 60fps, hardware-accelerated when available) running in a Web Worker
- GIF with Floyd–Steinberg dithering, also in a Web Worker
- PNG and WebP static frames sampled from an animated QR at user-controllable phase
- `.vcf` download for contact-mode QRs
- Clipboard copy of the raw QR data

**Fullscreen modal** — click the QR preview to expand it to 90vmin × 90vmin over a backdrop. The animated preview's CSS mask scales to fill the modal so animations stay smooth at high resolutions.

**Theme** — light / dark / system, persisted to localStorage (`qr-mode`). Pre-paint FOUC bootstrap via a blocking inline `theme-init.js` block in `<head>` that reads localStorage before first paint and applies `class="dark"` on `<html>` accordingly. Mode toggle wraps in `document.startViewTransition` for a smooth crossfade.

**Persistence** — all form data, style settings, saved profiles, primary pin, and theme preference stored in localStorage. No IndexedDB, no service worker, no fetch.

## Stack

React 19, TypeScript 6, Vite 8, qrcode-generator, gifenc, mp4-muxer, webm-muxer. Design system is CSS custom properties + `@layer` + CSS Modules + native nesting (no Tailwind, no UI framework, no design-system runtime). Workers use `?worker&inline` so they ship as Blob URLs inside the single HTML.

## Development

```
pnpm install
pnpm dev
```

`pnpm dev` runs the standard Vite HMR server. Workers are compiled on demand and live-reload when their sources change. The `?worker&inline` suffix only affects the production build — in dev they load as separate URL modules for faster iteration.

## Build

`pnpm build` emits exactly one file: `dist/index.html` (~922 kB raw / ~492 kB gzipped). Build-time helpers:

- `vite-plugin-singlefile` inlines every JS chunk and CSS module
- `?worker&inline` in `qr-export-gif.ts` and `qr-export-video.ts` packages the workers as base64-encoded Blob URLs
- `build/inline-html-deps.ts` inlines `theme-init.js`, the favicon (as a data: URI), and the Google Fonts CSS + every woff2 file (fetched at build time so the result has no remote dependency)

The resulting `index.html` makes zero network requests at runtime. Verified by opening it via `file://` and checking that DevTools' Network tab shows only `data:` URIs.

## Deployment

Built and deployed automatically to GitHub Pages via Actions on push to `shepherd`. Pre-commit hook runs TypeScript and ESLint via husky.
