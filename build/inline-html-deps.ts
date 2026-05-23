import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Vite plugin: rewrite each emitted index.html so it has no
// build-time-external network deps. Everything that *can* be inlined
// from disk gets inlined; everything that needs network at build-time
// (Google Fonts) gets fetched in the build step and embedded as data
// URIs. Runtime opens the HTML and never hits the network unless the
// user explicitly downloads a generated file.
//
// What this plugin handles (vite-plugin-singlefile handles the JS/CSS
// chunks):
//   - <script src="./theme-init.js"></script>  → inline <script>
//   - <link rel="icon" href="./favicon.svg" />  → data: URI
//   - <link href="https://fonts.googleapis.com/css2?...">  → fetched
//     CSS with woff2 URLs replaced by data: URIs, embedded as <style>
//
// The plugin only runs during `vite build`; `vite dev` keeps the
// originals so HMR + dev-tools still work normally.

const FONT_CSS_URL_RE = /<link\s+href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"[^>]*>/;
const THEME_INIT_RE = /<script\s+src="\.{0,2}\/theme-init\.js"><\/script>/;
const FAVICON_RE = /<link\s+rel="icon"[^>]*href="(\.{0,2}\/favicon\.svg)"[^>]*\/?>/;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // Google Fonts serves different woff2 URLs depending on the
      // user-agent. Modern Chrome UA gets variable woff2 — the smallest
      // payload that supports all the weights at once.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return await res.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  // Buffer is available in Node; using it directly avoids the
  // window.btoa unicode quirk.
  return Buffer.from(bytes).toString('base64');
}

// Convert a Google Fonts CSS payload into one whose woff2 URLs are
// inline data: URIs. Returns the rewritten CSS plus the total inlined
// bytes for logging.
async function inlineFontFaces(css: string): Promise<{ css: string; bytes: number }> {
  const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
  const urls = Array.from(css.matchAll(urlRe), (m) => m[1]!);
  const unique = Array.from(new Set(urls));
  const map = new Map<string, string>();
  let bytes = 0;
  await Promise.all(
    unique.map(async (u) => {
      const raw = await fetchBytes(u);
      bytes += raw.length;
      map.set(u, `data:font/woff2;base64,${toBase64(raw)}`);
    }),
  );
  return {
    css: css.replace(urlRe, (_full, u) => `url(${map.get(u) ?? u})`),
    bytes,
  };
}

export function inlineHtmlDeps(opts: { assetsDir: string }): Plugin {
  const assetsDir = opts.assetsDir;
  return {
    name: 'qr:inline-html-deps',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        // 1. Inline theme-init.js
        const themeInitPath = resolve(assetsDir, 'theme-init.js');
        const themeInit = readFileSync(themeInitPath, 'utf-8');
        html = html.replace(
          THEME_INIT_RE,
          () => `<script>${themeInit.replace(/<\/script/g, '<\\/script')}</script>`,
        );

        // 2. Favicon as data URI
        const faviconMatch = html.match(FAVICON_RE);
        if (faviconMatch) {
          const faviconPath = resolve(assetsDir, 'favicon.svg');
          const svg = readFileSync(faviconPath, 'utf-8');
          const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
          html = html.replace(
            FAVICON_RE,
            `<link rel="icon" type="image/svg+xml" href="${dataUri}" />`,
          );
        }

        // 3. Google Fonts CSS + woff2 inlined as data URIs
        const fontMatch = html.match(FONT_CSS_URL_RE);
        if (fontMatch) {
          try {
            const fontCssUrl = fontMatch[1]!;
            const rawCss = await fetchText(fontCssUrl);
            const { css: rewritten, bytes } = await inlineFontFaces(rawCss);
            console.log(
              `[qr:inline-html-deps] Inlined font CSS + ${(bytes / 1024).toFixed(1)} kB of woff2`,
            );
            html = html.replace(
              FONT_CSS_URL_RE,
              () => `<style>${rewritten.replace(/<\/style/g, '<\\/style')}</style>`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[qr:inline-html-deps] Font inline failed (${msg}); leaving <link> intact`);
          }
        }

        // 4. Strip cosmetic artifacts left by vite-plugin-singlefile:
        //   - <script src></script> (the entry script's src was emptied
        //     after the body was inlined elsewhere)
        //   - rel="stylesheet" / crossorigin on rewritten <style> tags
        html = html
          .replace(/<script\s+src>\s*<\/script>/g, '')
          .replace(/<style\s+rel="stylesheet"\s+crossorigin>/g, '<style>');

        return html;
      },
    },
  };
}
