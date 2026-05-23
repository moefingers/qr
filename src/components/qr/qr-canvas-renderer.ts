import type { StyleData, DotShape, CornerShape } from './qr-types';
import { computeLogoDimensions } from './qr-utils';
import qrcode from 'qrcode-generator';

export interface RenderOptions {
  canvas: HTMLCanvasElement;
  data: string;
  style: StyleData;
  logoImg: HTMLImageElement | SVGElement | null;
  logoSvgMarkup: string | null;
  // Per-module dodge strength in [0..1]. 1 = erase, 0 = draw, fractional
  // = ramp via globalAlpha so the fade edge reads as soft.
  dodgeMask: Float32Array | null;
  logoColorSync: boolean;
}

function toUTF8ByteString(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  let out = '';
  for (let i = 0; i < utf8.length; i++) out += String.fromCharCode(utf8[i]!);
  return out;
}

function isFinderPattern(r: number, c: number, count: number): boolean {
  if (r < 7 && c < 7) return true;
  if (r < 7 && c >= count - 7) return true;
  if (r >= count - 7 && c < 7) return true;
  return false;
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  shape: DotShape,
) {
  const h = size / 2;
  switch (shape) {
    case 'dot':
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.95, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rounded': {
      const r = size * 0.35;
      const s2 = size * 1.05;
      const x = cx - s2 / 2,
        y = cy - s2 / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, s2, s2, r);
      ctx.fill();
      break;
    }
    case 'diamond': {
      const dh = h * 1.15;
      ctx.beginPath();
      ctx.moveTo(cx, cy - dh);
      ctx.lineTo(cx + dh, cy);
      ctx.lineTo(cx, cy + dh);
      ctx.lineTo(cx - dh, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.beginPath();
      const spikes = 5,
        outerR = h * 1.3,
        innerR = h * 0.55;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = (Math.PI * i) / spikes - Math.PI / 2;
        const rv = i % 2 === 0 ? outerR : innerR;
        if (i === 0) ctx.moveTo(cx + Math.cos(rad) * rv, cy + Math.sin(rad) * rv);
        else ctx.lineTo(cx + Math.cos(rad) * rv, cy + Math.sin(rad) * rv);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart': {
      const s = size * 0.65;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.7);
      ctx.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.4);
      ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.7);
      ctx.fill();
      break;
    }
    default:
      ctx.fillRect(cx - h, cy - h, size, size);
  }
}

function drawFinderOuter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  modSize: number,
  shape: CornerShape,
  color: string | CanvasGradient,
) {
  const s = modSize * 7;
  ctx.fillStyle = color;
  switch (shape) {
    case 'dot': {
      const r = s / 2;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x + r, y + r, r - modSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'rounded': {
      const cr = modSize * 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, cr);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.roundRect(x + modSize, y + modSize, s - modSize * 2, s - modSize * 2, cr * 0.5);
      ctx.fill();
      ctx.restore();
      break;
    }
    default: {
      ctx.fillRect(x, y, s, s);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(x + modSize, y + modSize, s - modSize * 2, s - modSize * 2);
      ctx.restore();
    }
  }
}

function drawFinderInner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  modSize: number,
  shape: CornerShape,
  color: string | CanvasGradient,
) {
  const s = modSize * 3;
  const cx = x + s / 2,
    cy = y + s / 2;
  ctx.fillStyle = color;
  switch (shape) {
    case 'dot':
      ctx.beginPath();
      ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rounded': {
      const cr = modSize * 0.8;
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, cr);
      ctx.fill();
      break;
    }
    default:
      ctx.fillRect(x, y, s, s);
  }
}

function createDotFill(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  style: StyleData,
): string | CanvasGradient {
  if (!style.useGradient) return style.dotColor;
  const angle = (style.gradientAngle * Math.PI) / 180;
  if (style.gradientType === 'radial') {
    const g = ctx.createRadialGradient(
      canvasSize / 2,
      canvasSize / 2,
      0,
      canvasSize / 2,
      canvasSize / 2,
      canvasSize / 2,
    );
    g.addColorStop(0, style.dotColor);
    g.addColorStop(1, style.gradientEndColor);
    return g;
  }
  const dx = (Math.cos(angle) * canvasSize) / 2;
  const dy = (Math.sin(angle) * canvasSize) / 2;
  const g = ctx.createLinearGradient(
    canvasSize / 2 - dx,
    canvasSize / 2 - dy,
    canvasSize / 2 + dx,
    canvasSize / 2 + dy,
  );
  g.addColorStop(0, style.dotColor);
  g.addColorStop(1, style.gradientEndColor);
  return g;
}

function colorizeSvgMarkup(svgMarkup: string, style: StyleData): string {
  const NONE_PLACEHOLDER = '__FILL_NONE_PLACEHOLDER__';
  const fillRef = style.useGradient ? 'url(#__qr_logo_grad__)' : style.dotColor;

  let gradientDef = '';
  if (style.useGradient) {
    if (style.gradientType === 'radial') {
      gradientDef = `<defs><radialGradient id="__qr_logo_grad__" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${style.dotColor}"/><stop offset="100%" stop-color="${style.gradientEndColor}"/></radialGradient></defs>`;
    } else {
      const rad = (style.gradientAngle * Math.PI) / 180;
      const x1 = 50 - Math.cos(rad) * 50;
      const y1 = 50 - Math.sin(rad) * 50;
      const x2 = 50 + Math.cos(rad) * 50;
      const y2 = 50 + Math.sin(rad) * 50;
      gradientDef = `<defs><linearGradient id="__qr_logo_grad__" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0%" stop-color="${style.dotColor}"/><stop offset="100%" stop-color="${style.gradientEndColor}"/></linearGradient></defs>`;
    }
  }

  // Preserve `fill="none"` (it's a meaningful "no fill" signal we never
  // want to recolor) by parking it behind a placeholder before the
  // global fill rewrite, then restoring it. Stroke="none" gets the same
  // treatment to keep stroke-only logos rendering — though we don't
  // rewrite strokes, leaving "none" intact is still required when the
  // outer-SVG rewrite below would otherwise propagate a fill.
  let result = svgMarkup
    .replace(/fill="none"/g, NONE_PLACEHOLDER)
    .replace(/fill="[^"]*"/g, `fill="${fillRef}"`)
    .replace(new RegExp(NONE_PLACEHOLDER, 'g'), 'fill="none"');

  // Inject a root-level `fill="..."` so SVGs that omit any fill (like
  // most simple icon sets) inherit the chosen color. CRUCIAL: strip any
  // existing root-level fill first — a duplicate XML attribute makes
  // the Blob-loaded SVG fail to render (uploaded stroke-only icons
  // like @infinite-syndicate/src/app/icon.svg ship with `fill="none"`
  // on the <svg> root, and duplicating it breaks the whole image
  // silently). The browser's `new Image().src = blobUrl` parser is
  // stricter about duplicate attributes than the inline-HTML parser,
  // which is why this bug shows up only for uploads, not for the
  // preloaded SVGs whose roots happen not to set a fill.
  result = result.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\s+fill="[^"]*"/g, '');
    return `<svg${cleaned} fill="${fillRef}">`;
  });

  if (gradientDef) {
    result = result.replace(/<svg([^>]*)>/, `<svg$1>${gradientDef}`);
  }

  return result;
}

async function svgToImage(svgMarkup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
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

export interface RenderResult {
  success: boolean;
  modCount: number;
  byteSize: number;
  error?: string;
}

export async function renderQrToCanvas(opts: RenderOptions): Promise<RenderResult> {
  const { canvas, data, style, logoSvgMarkup, dodgeMask, logoColorSync, logoImg } = opts;

  if (!data) return { success: false, modCount: 0, byteSize: 0, error: 'No data' };

  const byteSize = new Blob([data]).size;
  const canvasSize = style.qrSize;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, style.ecLevel);
    qr.addData(toUTF8ByteString(data), 'Byte');
    qr.make();
  } catch {
    return { success: false, modCount: 0, byteSize, error: 'Data too large for QR code' };
  }

  const modCount = qr.getModuleCount();
  const totalMods = modCount + style.quietZone * 2;
  const modSize = canvasSize / totalMods;

  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // When gradient is enabled and logo color-sync is on, we use a unified
  // rendering strategy: draw all foreground elements (QR + logo) in solid
  // black on a transparent layer, then paint the gradient over the opaque
  // pixels using source-in compositing. This makes the gradient flow
  // seamlessly across both QR dots and logo as one cohesive image.
  const unifiedGradient = style.useGradient && logoColorSync && (logoImg || logoSvgMarkup);

  if (!style.transparentBg) {
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
  }

  // For unified gradient: draw foreground on an offscreen canvas in black
  const fgCanvas = unifiedGradient ? document.createElement('canvas') : null;
  let fgCtx: CanvasRenderingContext2D;
  if (fgCanvas) {
    fgCanvas.width = canvasSize;
    fgCanvas.height = canvasSize;
    fgCtx = fgCanvas.getContext('2d')!;
  } else {
    fgCtx = ctx;
  }

  const dotFill = unifiedGradient ? '#000000' : createDotFill(fgCtx, canvasSize, style);
  const cornerColor = unifiedGradient
    ? '#000000'
    : style.cornerColor && /^#[0-9a-fA-F]{6}$/.test(style.cornerColor)
      ? style.cornerColor
      : style.dotColor;

  fgCtx.fillStyle = dotFill;
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (!qr.isDark(r, c)) continue;
      if (isFinderPattern(r, c, modCount)) continue;
      const strength = dodgeMask ? dodgeMask[r * modCount + c]! : 0;
      if (strength >= 1) continue;
      const cx = (c + style.quietZone) * modSize + modSize / 2;
      const cy = (r + style.quietZone) * modSize + modSize / 2;
      if (strength > 0) {
        fgCtx.globalAlpha = 1 - strength;
        drawModule(fgCtx, cx, cy, modSize * (style.shapeScale / 100), style.dotShape);
        fgCtx.globalAlpha = 1;
      } else {
        drawModule(fgCtx, cx, cy, modSize * (style.shapeScale / 100), style.dotShape);
      }
    }
  }

  const finderPositions: [number, number][] = [
    [0, 0],
    [0, modCount - 7],
    [modCount - 7, 0],
  ];
  for (const [fr, fc] of finderPositions) {
    const fx = (fc + style.quietZone) * modSize;
    const fy = (fr + style.quietZone) * modSize;

    drawFinderOuter(fgCtx, fx, fy, modSize, style.cornerOuterShape, cornerColor);

    const gapX = fx + modSize,
      gapY = fy + modSize;
    const gapS = modSize * 5;
    const clearGap = unifiedGradient || style.transparentBg;
    if (clearGap) {
      fgCtx.save();
      fgCtx.globalCompositeOperation = 'destination-out';
      fgCtx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      fgCtx.fillStyle = style.bgColor;
    }
    if (style.cornerOuterShape === 'dot') {
      fgCtx.beginPath();
      fgCtx.arc(fx + modSize * 3.5, fy + modSize * 3.5, modSize * 2.5, 0, Math.PI * 2);
      fgCtx.fill();
    } else if (style.cornerOuterShape === 'rounded') {
      fgCtx.beginPath();
      fgCtx.roundRect(gapX, gapY, gapS, gapS, modSize * 0.7);
      fgCtx.fill();
    } else {
      fgCtx.fillRect(gapX, gapY, gapS, gapS);
    }
    if (clearGap) fgCtx.restore();

    const ix = (fc + 2 + style.quietZone) * modSize;
    const iy = (fr + 2 + style.quietZone) * modSize;
    drawFinderInner(fgCtx, ix, iy, modSize, style.cornerInnerShape, cornerColor);
  }

  // Logo overlay
  const hasLogo = logoImg || logoSvgMarkup;
  if (hasLogo) {
    const maxDim = canvasSize * style.logoSize;
    const imgRef = logoImg instanceof HTMLImageElement ? logoImg : null;
    const { w: logoW, h: logoH } = computeLogoDimensions(maxDim, imgRef, logoSvgMarkup);

    const lx = (canvasSize - logoW) / 2;
    const ly = (canvasSize - logoH) / 2;

    // Only clear a rectangular background when there's no dodge mask
    // (dodge mask already removes individual dots around the logo shape)
    if (style.logoBgEnabled && !dodgeMask) {
      if (unifiedGradient) {
        fgCtx.save();
        fgCtx.globalCompositeOperation = 'destination-out';
        fgCtx.beginPath();
        fgCtx.roundRect(
          lx - style.logoMargin,
          ly - style.logoMargin,
          logoW + style.logoMargin * 2,
          logoH + style.logoMargin * 2,
          8,
        );
        fgCtx.fill();
        fgCtx.restore();
      } else if (!style.transparentBg) {
        fgCtx.fillStyle = style.bgColor;
        fgCtx.beginPath();
        fgCtx.roundRect(
          lx - style.logoMargin,
          ly - style.logoMargin,
          logoW + style.logoMargin * 2,
          logoH + style.logoMargin * 2,
          8,
        );
        fgCtx.fill();
      } else {
        fgCtx.save();
        fgCtx.globalCompositeOperation = 'destination-out';
        fgCtx.beginPath();
        fgCtx.roundRect(
          lx - style.logoMargin,
          ly - style.logoMargin,
          logoW + style.logoMargin * 2,
          logoH + style.logoMargin * 2,
          8,
        );
        fgCtx.fill();
        fgCtx.restore();
      }
    }

    if (logoSvgMarkup) {
      let finalMarkup: string;
      if (unifiedGradient) {
        finalMarkup = colorizeSvgMarkup(logoSvgMarkup, {
          ...style,
          useGradient: false,
          dotColor: '#000000',
        });
      } else if (logoColorSync) {
        finalMarkup = colorizeSvgMarkup(logoSvgMarkup, style);
      } else {
        finalMarkup = colorizeSvgMarkup(logoSvgMarkup, {
          ...style,
          dotColor: style.logoColor,
          useGradient: style.logoUseGradient,
          gradientEndColor: style.logoGradientEndColor,
          gradientType: style.logoGradientType,
          gradientAngle: style.logoGradientAngle,
        });
      }
      try {
        const img = await svgToImage(finalMarkup);
        fgCtx.drawImage(img, lx, ly, logoW, logoH);
      } catch {
        /* SVG rendering failed silently */
      }
    } else if (logoImg instanceof HTMLImageElement) {
      if (style.logoIndependent && style.logoHueShift > 0) {
        fgCtx.save();
        fgCtx.filter = `hue-rotate(${style.logoHueShift}deg)`;
        fgCtx.drawImage(logoImg, lx, ly, logoW, logoH);
        fgCtx.restore();
      } else {
        fgCtx.drawImage(logoImg, lx, ly, logoW, logoH);
      }
    }
  }

  // Unified gradient pass: paint gradient over all black foreground pixels
  if (unifiedGradient && fgCanvas) {
    const gradFill = createDotFill(fgCtx, canvasSize, style);
    fgCtx.save();
    fgCtx.globalCompositeOperation = 'source-in';
    fgCtx.fillStyle = gradFill;
    fgCtx.fillRect(0, 0, canvasSize, canvasSize);
    fgCtx.restore();
    // Composite the gradient-colored foreground onto the main canvas
    ctx.drawImage(fgCanvas, 0, 0);
  }

  return { success: true, modCount, byteSize };
}

export function generateQrMatrix(
  data: string,
  ecLevel: string,
): { modCount: number; isDark: (r: number, c: number) => boolean } | null {
  try {
    const qr = qrcode(0, ecLevel as Parameters<typeof qrcode>[1]);
    qr.addData(toUTF8ByteString(data), 'Byte');
    qr.make();
    return { modCount: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
  } catch {
    return null;
  }
}
