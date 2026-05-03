import { computeLogoDimensions } from './qr-utils';

export interface DodgeInput {
  logoImg: HTMLImageElement | null;
  logoSvgMarkup: string | null;
  logoColorSync: boolean;
  dotColor: string;
  modCount: number;
  canvasSize: number;
  quietZone: number;
  logoSize: number;
  logoMargin: number;
  aggressiveness: number;
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

export async function computeDodgeMask(input: DodgeInput): Promise<boolean[] | null> {
  const {
    logoImg,
    logoSvgMarkup,
    modCount,
    canvasSize,
    quietZone,
    logoSize,
    logoMargin,
    aggressiveness,
  } = input;

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

  // Logo area including margin
  const areaWPx = logoWPx + logoMargin * 2;
  const areaHPx = logoHPx + logoMargin * 2;

  // Logo region in module coordinates
  const logoStartXMod = (canvasSize - areaWPx) / 2 / modSizePx - quietZone;
  const logoEndXMod = (canvasSize + areaWPx) / 2 / modSizePx - quietZone;
  const logoStartYMod = (canvasSize - areaHPx) / 2 / modSizePx - quietZone;
  const logoEndYMod = (canvasSize + areaHPx) / 2 / modSizePx - quietZone;

  const regionModW = logoEndXMod - logoStartXMod;
  const regionModH = logoEndYMod - logoStartYMod;

  // Render the logo onto a sample canvas that matches the area's aspect ratio.
  // Using a square canvas for a wide logo distorts the alpha sampling.
  const minRes = 32;
  const sampleScale = minRes / Math.max(regionModW, regionModH);
  const sampleW = Math.max(Math.round(regionModW * sampleScale), 4);
  const sampleH = Math.max(Math.round(regionModH * sampleScale), 4);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sCtx = sampleCanvas.getContext('2d')!;

  // The logo content area (without margin) within the sample
  const marginFracX = logoMargin / areaWPx;
  const marginFracY = logoMargin / areaHPx;
  const drawX = marginFracX * sampleW;
  const drawY = marginFracY * sampleH;
  const drawW = sampleW - drawX * 2;
  const drawH = sampleH - drawY * 2;

  sCtx.clearRect(0, 0, sampleW, sampleH);
  sCtx.drawImage(img, drawX, drawY, drawW, drawH);

  const imageData = sCtx.getImageData(0, 0, sampleW, sampleH);
  const { data } = imageData;

  // Build raw mask by sampling alpha at each module position
  const rawMask: boolean[] = new Array(modCount * modCount).fill(false);

  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (
        r < Math.floor(logoStartYMod) ||
        r > Math.ceil(logoEndYMod) ||
        c < Math.floor(logoStartXMod) ||
        c > Math.ceil(logoEndXMod)
      ) {
        continue;
      }

      const sampleX = Math.floor(((c - logoStartXMod) / regionModW) * sampleW);
      const sampleY = Math.floor(((r - logoStartYMod) / regionModH) * sampleH);

      if (sampleX < 0 || sampleX >= sampleW || sampleY < 0 || sampleY >= sampleH) continue;

      const pixelIdx = (sampleY * sampleW + sampleX) * 4;
      const alpha = data[pixelIdx + 3] ?? 0;

      if (alpha > 20) {
        rawMask[r * modCount + c] = true;
      }
    }
  }

  if (aggressiveness <= 0) return rawMask;

  // Distance field approach: for each empty module, find the minimum
  // Chebyshev distance to any logo pixel, then suppress if within threshold.
  // This gives smooth, sub-ring granularity instead of jumping in whole rings.
  const threshold = (aggressiveness * modCount) / 800;
  const dilatedMask: boolean[] = [...rawMask];

  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (rawMask[r * modCount + c]) continue;

      // Only check modules near the logo region
      if (
        r < Math.floor(logoStartYMod) - threshold ||
        r > Math.ceil(logoEndYMod) + threshold ||
        c < Math.floor(logoStartXMod) - threshold ||
        c > Math.ceil(logoEndXMod) + threshold
      ) {
        continue;
      }

      // Find minimum distance to any true cell in the raw mask
      const searchR = Math.ceil(threshold);
      let minDist = Infinity;
      for (let dr = -searchR; dr <= searchR && minDist > threshold; dr++) {
        for (let dc = -searchR; dc <= searchR; dc++) {
          const nr = r + dr,
            nc = c + dc;
          if (nr < 0 || nr >= modCount || nc < 0 || nc >= modCount) continue;
          if (rawMask[nr * modCount + nc]) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            if (dist < minDist) minDist = dist;
          }
        }
      }

      if (minDist <= threshold) {
        dilatedMask[r * modCount + c] = true;
      }
    }
  }

  return dilatedMask;
}
