# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.1] — 2026-05-24

### Added
- "Source" link next to the editor title pointing to the GitHub repository, so anyone running the app — including from an offline-downloaded copy — can find the source. Inline GitHub mark SVG (CC0 path from simple-icons) keeps the single-file build with zero new dependencies.

### Changed
- Release process is now automated. Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which builds the project, verifies the tag matches `package.json`, and creates a GitHub Release with auto-generated notes and `dist/index.html` attached. Use `pnpm release:patch` / `release:minor` / `release:major` to cut a release in one command.

## [2.0.0] — 2026-05-24

### Added
- **Design system rewrite.** Tailwind dropped. Replaced with CSS custom properties + `@layer` + CSS Modules + native nesting, adapted from the zcanon token system. Dark / light / system theme with localStorage persistence and a pre-paint FOUC bootstrap (`theme-init.js`). Toggle wraps in `document.startViewTransition` for crossfade.
- **Eight animation types** — sweep, pulse, wave, radial loop, breathe, spiral, color cycle — each with per-stop color animation, three direction modes (forward / reverse / bounce), and five timing curves. Animated previews driven by CSS `@property` + animated gradients. Seamless-loop checker warns when `sweep`/`radialLoop` stop configurations won't wrap cleanly.
- **Distance-field logo dodging.** 2-pass exact Euclidean Distance Transform (Felzenszwalb 1D parabola envelope) at 4× module oversampling. Three knobs: aggressiveness (clearance distance), softness (fade-out width), per-module coverage threshold (filters thin strokes). Fractional `[0..1]` per-module strength rendered via `globalAlpha` for a soft fade edge.
- **`#present` route** — fullscreen presenter view. Reads from the same localStorage as the editor. Selection precedence: `?id=<saveId>` query → primary-pinned save → first save → live draft. Tap to hide chrome. Same single HTML file — hash-routed from `src/main.tsx`.
- **Saves with drag-to-reorder.** Pointer-event drag with a floating ghost tile. View-transition FLIP commits the reorder. Star a tile to pin a primary (used by `#present`). Save tiles render the live QR data so the preview matches what users will actually scan.
- **Single-file build pipeline.** `pnpm build` emits exactly one `dist/index.html` (~922 KB raw / ~492 KB gzipped). `vite-plugin-singlefile` inlines every JS chunk and CSS module; `?worker&inline` packages the GIF and video Web Workers as base64-encoded Blob URLs; custom `build/inline-html-deps.ts` plugin inlines `theme-init.js`, the favicon (data URI), and the Google Fonts CSS + every `woff2` file (fetched at build time). Verified: opening `dist/index.html` via `file://` produces zero non-`data:` network requests.

### Fixed
- SVG logo upload with `fill="none"` root. Uploaded SVGs that declared `fill="none"` on the root `<svg>` (common for stroke-only icons like lucide) silently failed to render — the logo was invisible while the dodge mask still cleared QR modules behind it. The colorizer was producing duplicate `fill` attributes that the Blob-loaded SVG parser rejected. Now strips any existing root-level fill before injecting the new one.

[Unreleased]: https://github.com/moefingers/qr/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/moefingers/qr/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/moefingers/qr/releases/tag/v2.0.0
