import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { StyleData } from './qr-types';
import {
  parseHex,
  computePhase,
  renderGradientFrame,
  compositeFrame,
  floydSteinbergDither,
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
  const isBreathe = style.animationType === 'breathe';
  const totalFrames = isBreathe ? frameCount * 2 : frameCount;
  const speed = Math.max(style.animationSpeed, 1);
  const msPerFrame = Math.round(((100 / speed) * 4 * 1000) / totalFrames);

  const maskCanvas = new OffscreenCanvas(size, size);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  maskCtx.drawImage(maskBitmap, 0, 0);
  const maskData = maskCtx.getImageData(0, 0, size, size).data;

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  const gif = GIFEncoder();

  for (let f = 0; f < totalFrames; f++) {
    const phase = computePhase(f, totalFrames, isBreathe);
    const gradData = renderGradientFrame(size, style.animationStops, phase);
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
