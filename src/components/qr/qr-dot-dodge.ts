import { computeLogoDimensions } from './qr-utils';

// Build a fractional dodge mask for every module in the QR matrix.
//
// Algorithm: 2-pass exact Euclidean Distance Transform (Felzenszwalb 1D
// parabola-envelope), restricted to the logo bounding box plus the
// soft-fade reach. The result is a per-module strength in [0..1]:
//   1.0 = fully erase the module (logo overlap)
//   0.0 = untouched (far from logo)
//   in between = linear fade from `aggressiveness` to
//                `aggressiveness + softness` (in module-widths) past the
//                logo's alpha silhouette
// The renderer uses `globalAlpha = 1 - strength` so the fade edge looks
// soft instead of stepped.
//
// Sub-module precision: the logo bitmap is sampled at 4× the module
// grid, so a thin logo stroke that only grazes one corner of a module
// produces a distance closer to its true edge than to the module
// center, and the strength reads correctly. Coverage threshold filters
// modules with too little logo footprint before the EDT sees them.

export interface DodgeInput {
  logoImg: HTMLImageElement | null;
  logoSvgMarkup: string | null;
  modCount: number;
  canvasSize: number;
  quietZone: number;
  logoSize: number;
  aggressiveness: number;
  softness: number;
  coverageThreshold: number;
}

async function svgToImageForDodge(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG load failed'));
    };
    img.src = url;
  });
}

// Felzenszwalb 1D EDT: lower envelope of parabolas. O(n) per row/column.
function edt1d(f: Float64Array, n: number, out: Float64Array): void {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dx = q - v[k]!;
    out[q] = dx * dx + f[v[k]!]!;
  }
}

function edt2d(grid: Float64Array, w: number, h: number): void {
  const colBuf = new Float64Array(h);
  const colOut = new Float64Array(h);
  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) colBuf[r] = grid[r * w + c]!;
    edt1d(colBuf, h, colOut);
    for (let r = 0; r < h; r++) grid[r * w + c] = colOut[r]!;
  }
  const rowBuf = new Float64Array(w);
  const rowOut = new Float64Array(w);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) rowBuf[c] = grid[r * w + c]!;
    edt1d(rowBuf, w, rowOut);
    for (let c = 0; c < w; c++) grid[r * w + c] = rowOut[c]!;
  }
}

export async function computeDodgeMask(input: DodgeInput): Promise<Float32Array | null> {
  const { logoImg, logoSvgMarkup, modCount, canvasSize, quietZone, logoSize } = input;
  const aggressiveness = Math.max(0, input.aggressiveness);
  const softness = Math.max(0, input.softness);
  const coverageThreshold = Math.max(0, Math.min(1, input.coverageThreshold));

  if (!logoImg && !logoSvgMarkup) return null;

  let img: HTMLImageElement;
  if (logoSvgMarkup) {
    try {
      img = await svgToImageForDodge(logoSvgMarkup);
    } catch {
      return null;
    }
  } else if (logoImg) {
    img = logoImg;
  } else {
    return null;
  }

  const totalMods = modCount + quietZone * 2;
  const modSizePx = canvasSize / totalMods;

  const maxDimPx = canvasSize * logoSize;
  const { w: logoWPx, h: logoHPx } = computeLogoDimensions(maxDimPx, img, logoSvgMarkup);
  const logoLxPx = (canvasSize - logoWPx) / 2;
  const logoLyPx = (canvasSize - logoHPx) / 2;

  // Restrict EDT to logo bbox + (inner + softness fade) + 1mod slack.
  const paddingPx = (aggressiveness + softness) * modSizePx + modSizePx;
  const bboxLx = Math.max(0, Math.floor(logoLxPx - paddingPx));
  const bboxLy = Math.max(0, Math.floor(logoLyPx - paddingPx));
  const bboxRx = Math.min(canvasSize, Math.ceil(logoLxPx + logoWPx + paddingPx));
  const bboxRy = Math.min(canvasSize, Math.ceil(logoLyPx + logoHPx + paddingPx));
  const bboxWPx = bboxRx - bboxLx;
  const bboxHPx = bboxRy - bboxLy;
  if (bboxWPx <= 0 || bboxHPx <= 0) return null;

  // 4× oversample so sub-module logo features influence the distance field.
  const oversample = 4;
  const samplesPerPx = oversample / modSizePx;
  const bmpW = Math.max(8, Math.round(bboxWPx * samplesPerPx));
  const bmpH = Math.max(8, Math.round(bboxHPx * samplesPerPx));

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = bmpW;
  sampleCanvas.height = bmpH;
  const sCtx = sampleCanvas.getContext('2d')!;
  sCtx.clearRect(0, 0, bmpW, bmpH);
  sCtx.drawImage(
    img,
    (logoLxPx - bboxLx) * samplesPerPx,
    (logoLyPx - bboxLy) * samplesPerPx,
    logoWPx * samplesPerPx,
    logoHPx * samplesPerPx,
  );

  const { data } = sCtx.getImageData(0, 0, bmpW, bmpH);

  // Sentinel must exceed any squared distance the EDT can produce. Using
  // Infinity poisons the parabola-envelope arithmetic (Inf - Inf = NaN)
  // when rows/cols have no source pixels, so use a safely-large finite.
  const LARGE = (bmpW * bmpW + bmpH * bmpH) * 2 + 1;
  const grid = new Float64Array(bmpW * bmpH);
  for (let i = 0; i < bmpW * bmpH; i++) {
    grid[i] = (data[i * 4 + 3] ?? 0) > 20 ? 0 : LARGE;
  }

  // Coverage filter — modules whose bitmap footprint covers less than
  // `coverageThreshold` of their area get their sources erased before the
  // EDT. Thin strokes that only graze a module no longer pull its
  // strength toward 1; the fade ramp from neighboring, fully-covered
  // modules still handles soft-edge cases.
  if (coverageThreshold > 0) {
    for (let r = 0; r < modCount; r++) {
      const cyStart = (r + quietZone) * modSizePx;
      const cyEnd = cyStart + modSizePx;
      const by1 = Math.max(0, Math.floor((cyStart - bboxLy) * samplesPerPx));
      const by2 = Math.min(bmpH, Math.ceil((cyEnd - bboxLy) * samplesPerPx));
      if (by1 >= by2) continue;
      for (let c = 0; c < modCount; c++) {
        const cxStart = (c + quietZone) * modSizePx;
        const cxEnd = cxStart + modSizePx;
        const bx1 = Math.max(0, Math.floor((cxStart - bboxLx) * samplesPerPx));
        const bx2 = Math.min(bmpW, Math.ceil((cxEnd - bboxLx) * samplesPerPx));
        if (bx1 >= bx2) continue;

        let source = 0;
        const total = (by2 - by1) * (bx2 - bx1);
        for (let by = by1; by < by2; by++) {
          const rowOff = by * bmpW;
          for (let bx = bx1; bx < bx2; bx++) {
            if (grid[rowOff + bx] === 0) source++;
          }
        }
        if (source / total < coverageThreshold) {
          for (let by = by1; by < by2; by++) {
            const rowOff = by * bmpW;
            for (let bx = bx1; bx < bx2; bx++) grid[rowOff + bx] = LARGE;
          }
        }
      }
    }
  }

  edt2d(grid, bmpW, bmpH);

  // Per-module strength = fade ramp on Euclidean distance (module-widths)
  // from logo silhouette.
  //   d <= aggressiveness                  -> 1 (fully dodged)
  //   d >= aggressiveness + softness       -> 0 (untouched)
  //   linear between
  // When softness === 0 this degrades to a hard threshold.
  const innerBmp = aggressiveness * oversample;
  const outerBmp = (aggressiveness + softness) * oversample;
  const fadeBmp = outerBmp - innerBmp;

  const mask = new Float32Array(modCount * modCount);
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      const cxPx = (c + quietZone + 0.5) * modSizePx;
      const cyPx = (r + quietZone + 0.5) * modSizePx;
      const bmpX = Math.floor((cxPx - bboxLx) * samplesPerPx);
      const bmpY = Math.floor((cyPx - bboxLy) * samplesPerPx);
      if (bmpX < 0 || bmpX >= bmpW || bmpY < 0 || bmpY >= bmpH) continue;
      const distBmp = Math.sqrt(grid[bmpY * bmpW + bmpX]!);
      if (distBmp <= innerBmp) mask[r * modCount + c] = 1;
      else if (fadeBmp > 0 && distBmp < outerBmp) {
        mask[r * modCount + c] = 1 - (distBmp - innerBmp) / fadeBmp;
      }
    }
  }

  return mask;
}
