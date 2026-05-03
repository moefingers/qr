# Styled QR Generator

Styled QR code generator with full customization: six dot shapes, corner styles, color gradients, and logo embedding with intelligent alpha-sampled dot dodging. CSS animation system (breathe, radial loop) with high-fidelity export via WebCodecs to MP4, WebM, GIF (Floyd-Steinberg dithered), PNG, and WebP. Supports vCard contacts with .vcf import (UTF-8/Arabic), URLs, plain text, WiFi auto-connect, email, and SMS. Style saves, presets, and all data persisted to localStorage. Runs entirely offline - no server, no accounts.

**Live:** https://moefingers.github.io/qr/

## Features

**QR types** - vCard contacts (with .vcf import, UTF-8/Arabic encoding detection), URL, plain text, WiFi auto-connect, email, and SMS

**Styling** - six dot shapes (square, circle, rounded, diamond, star, heart), three corner styles, foreground/background colors, linear and radial gradients, transparent backgrounds, color presets, saveable style profiles

**Logo** - upload any image or SVG with intelligent alpha-sampled dot dodging (distance-field dilation), configurable size/margin/aggressiveness, SVG color sync with QR gradient

**Animation** - CSS-based breathe and radial loop effects via `@property` and `repeating-radial-gradient`, customizable stops with per-stop color animation, speed, and direction controls

**Export** - MP4 and WebM via WebCodecs VideoEncoder (H.264/VP9, 60fps, hardware-accelerated), GIF with Floyd-Steinberg dithering, PNG and WebP static frames from animated QRs, .vcf contact download, copy data to clipboard

**Persistence** - all form data, style settings, and saved profiles stored in localStorage

## Stack

React 19, TypeScript 6, Vite 8, Tailwind CSS v4, qrcode-generator, gifenc, mp4-muxer, webm-muxer

## Development

```
pnpm install
pnpm dev
```

## Deployment

Built and deployed automatically to GitHub Pages via Actions on push to `shepherd`. Pre-commit hook runs TypeScript and ESLint via husky.
