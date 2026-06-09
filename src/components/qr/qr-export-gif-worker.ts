import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { StyleData } from './qr-types';
import {
  parseHex,
  computePhase,
  renderGradientFrame,
  compositeFrame,
  floydSteinbergDither,
  getEffectiveLoopKind,
  getExportSpeed,
  getLogoCycles,
  logoPhaseAt,
  computeLogoTransform,
  drawLogoTransformed,
  isLogoColoredByAnimation,
  paintLogoColorFill,
} from './qr-export-render';

type Msg = {
  maskBitmap: ImageBitmap | null;
  baseBitmap: ImageBitmap | null;
  logoBitmap: ImageBitmap | null;
  style: StyleData;
  frameCount: number;
};

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<Msg>) => {
  const { maskBitmap, baseBitmap, logoBitmap, style, frameCount } = e.data;
  const size = (maskBitmap ?? baseBitmap)!.width;
  // Alternate-loop types (and any forward type with `alt` direction)
  // need 2× frames to keep the wall-clock pace matched to forward types.
  const loopKind = getEffectiveLoopKind(style.animationType, style.animationDirection);
  const totalFrames = loopKind === 'alternate' ? frameCount * 2 : frameCount;
  const speed = Math.max(getExportSpeed(style), 1);
  const cycleDurationSec = (100 / speed) * 4;
  const msPerFrame = Math.round((cycleDurationSec * 1000) / totalFrames);
  const logoCycles = getLogoCycles(
    style,
    totalFrames,
    totalFrames / cycleDurationSec,
  );

  let maskData: Uint8ClampedArray | null = null;
  if (maskBitmap) {
    const maskCanvas = new OffscreenCanvas(size, size);
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    maskCtx.drawImage(maskBitmap, 0, 0);
    maskData = maskCtx.getImageData(0, 0, size, size).data;
  }

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  // A canvas roundtrip is only needed when we have to composite the logo
  // layer or draw a static base — otherwise we quantize the raw composite.
  const needsCanvas = !!logoBitmap || !maskData;
  let frameCtx: OffscreenCanvasRenderingContext2D | null = null;
  if (needsCanvas) {
    const frameCanvas = new OffscreenCanvas(size, size);
    frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  // Colored-logo (color-over + motion): logo silhouette filled per-frame
  // with the animated color, painted on a scratch canvas.
  const logoColored = !!logoBitmap && isLogoColoredByAnimation(style);
  const logoScratch = logoColored ? new OffscreenCanvas(size, size) : null;
  const logoScratchCtx =
    logoScratch?.getContext('2d', { willReadFrequently: true }) ?? null;

  const gif = GIFEncoder();

  for (let f = 0; f < totalFrames; f++) {
    let frame: Uint8ClampedArray;
    let gradData: Uint8ClampedArray | null = null;

    if (maskData) {
      const phase = computePhase(
        f,
        totalFrames,
        style.animationType,
        style.animationDirection,
        style.animationTimingFunction,
      );
      gradData = renderGradientFrame(size, style.animationStops, phase, style.animationType);
      const composed = compositeFrame(gradData, maskData, bgColor, size);
      if (frameCtx) {
        frameCtx.putImageData(
          new ImageData(composed as Uint8ClampedArray<ArrayBuffer>, size, size),
          0,
          0,
        );
      } else {
        frame = composed;
      }
    } else {
      frameCtx!.clearRect(0, 0, size, size);
      frameCtx!.drawImage(baseBitmap!, 0, 0, size, size);
    }

    if (frameCtx) {
      if (logoBitmap) {
        const lp = logoPhaseAt(f, totalFrames, logoCycles);
        const t = computeLogoTransform(style.logoAnimationType, lp);
        if (logoColored && logoScratchCtx && gradData) {
          paintLogoColorFill(logoScratchCtx, gradData, logoBitmap, size);
          drawLogoTransformed(frameCtx, logoScratch!, size, t);
        } else {
          drawLogoTransformed(frameCtx, logoBitmap, size, t);
        }
      }
      frame = frameCtx.getImageData(0, 0, size, size).data;
    }

    const palette = quantize(frame!, 256);
    const dithered = floydSteinbergDither(frame!, size, size, palette);
    const indexed = applyPalette(dithered, palette);

    gif.writeFrame(indexed, size, size, { palette, delay: msPerFrame });
    ctx.postMessage({
      type: 'progress',
      pct: Math.round(((f + 1) / totalFrames) * 100),
    });
  }

  gif.finish();
  const result = gif.bytes().buffer.slice(0) as ArrayBuffer;
  ctx.postMessage({ type: 'done', result }, [result]);
};
