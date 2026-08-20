# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.2] — 2026-08-19

### Changed
- WiFi encryption option relabeled **WPA/WPA2/WPA3** (was "WPA/WPA2"). The emitted token stays `T:WPA` — the compatible encoding for any passphrase-protected network, including WPA3: scanners hand the passphrase to the OS, which negotiates the strongest protocol the router offers. The `WIFI:` scheme has no widely-supported WPA3/SAE token, so a separate option would only hurt compatibility.

### Fixed
- WiFi SSIDs and passwords consisting entirely of hex characters (e.g. `deadbeef01`) are now double-quoted in the `WIFI:` payload, per the ZXing convention — preventing scanners from interpreting them as raw hex keys instead of literal strings.

## [2.1.1] — 2026-06-25

### Fixed
- Editor header layout on narrow screens. The header previously split into rigid `space-between` columns (title block vs. actions), squeezing the title into a sliver and leaving awkward whitespace beside the action buttons. Reworked it: the actions sit alone in a top bar, the icon shares a row with the title, and the status badge, source link, and subtitle flow full-width below — with the fixed subtitle indent removed. Trimmed the status badge to "Offline · Universal".

## [2.1.0] — 2026-06-08

### Added
- **Independent logo animation track.** The logo now animates on its own axis, orthogonal to the QR color animation. Two independent controls in the Logo tab: a "Let QR animation color the logo" toggle (on by default — existing animated QRs are unchanged), and a logo-motion select — **pulse**, **expand / contract**, or **flip-X** — with its own speed. All four combinations work: color-over on + motion paints the logo with the QR's live animated color *and* moves it (via a per-frame silhouette fill); color-over off keeps the logo's own colors while it moves. A logo can also animate over an otherwise-static QR. Applies everywhere the QR renders — live preview, fullscreen, the `#present` view, save tiles, and every export (MP4 / WebM / GIF / PNG / WebP) — with seamless looping derived from an integer cycle count.

### Fixed
- Multi-color raster (PNG/JPG) and stroke SVG logos no longer have their colors flattened by an active animation unless you opt in. Turning "Let QR animation color the logo" off redraws the logo on its own layer in its true colors.

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

[Unreleased]: https://github.com/moefingers/qr/compare/v2.1.2...HEAD
[2.1.2]: https://github.com/moefingers/qr/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/moefingers/qr/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/moefingers/qr/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/moefingers/qr/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/moefingers/qr/releases/tag/v2.0.0
