import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { StyleData } from './qr-types';
import {
  parseHex,
  computePhase,
  renderGradientFrame,
  compositeFrame,
  floydSteinbergDither,
  getEffectiveLoopKind,
} from './qr-export-render';

type Msg = {
  maskBitmap: ImageBitmap;
  style: StyleData;
  frameCount: number;
};

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<Msg>) => {
  const { maskBitmap, style, frameCount } = e.data;
  const size = maskBitmap.width;
  // Alternate-loop types (and any forward type with `alt` direction)
  // need 2× frames to keep the wall-clock pace matched to forward types.
  const loopKind = getEffectiveLoopKind(style.animationType, style.animationDirection);
  const totalFrames = loopKind === 'alternate' ? frameCount * 2 : frameCount;
  const speed = Math.max(style.animationSpeed, 1);
  const msPerFrame = Math.round(((100 / speed) * 4 * 1000) / totalFrames);

  const maskCanvas = new OffscreenCanvas(size, size);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  maskCtx.drawImage(maskBitmap, 0, 0);
  const maskData = maskCtx.getImageData(0, 0, size, size).data;

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  const gif = GIFEncoder();

  for (let f = 0; f < totalFrames; f++) {
    const phase = computePhase(
      f,
      totalFrames,
      style.animationType,
      style.animationDirection,
      style.animationTimingFunction,
    );
    const gradData = renderGradientFrame(size, style.animationStops, phase, style.animationType);
    const frame = compositeFrame(gradData, maskData, bgColor, size);

    const palette = quantize(frame, 256);
    const dithered = floydSteinbergDither(frame, size, size, palette);
    const indexed = applyPalette(dithered, palette);

    gif.writeFrame(indexed, size, size, { palette, delay: msPerFrame });
    ctx.postMessage({ type: 'progress', pct: Math.round(((f + 1) / totalFrames) * 100) });
  }

  gif.finish();
  const result = gif.bytes().buffer.slice(0) as ArrayBuffer;
  ctx.postMessage({ type: 'done', result }, [result]);
};
