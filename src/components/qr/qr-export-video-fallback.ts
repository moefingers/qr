import type { StyleData, AnimationLayers } from './qr-types';
import {
  parseHex,
  computePhase,
  renderGradientFrame,
  compositeFrame,
  getEffectiveLoopKind,
  getExportSpeed,
  getLogoCycles,
  logoPhaseAt,
  computeLogoTransform,
  drawLogoTransformed,
} from './qr-export-render';
import { imageFromDataUrl } from './qr-export-assets';

function bestMime(): { mimeType: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of [
    { mimeType: 'video/mp4; codecs=avc1', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm; codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm; codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ]) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

export function isMediaRecorderFallbackSupported(): boolean {
  return bestMime() !== null && 'captureStream' in HTMLCanvasElement.prototype;
}

export async function exportVideoFallback(
  layers: AnimationLayers,
  style: StyleData,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const mime = bestMime();
  if (!mime)
    throw new Error('Video recording is not supported in this browser');

  const size = style.qrSize;
  const fps = 30;
  const speed = Math.max(getExportSpeed(style), 1);
  const cycleDuration = (100 / speed) * 4;
  const frameCount = Math.round(cycleDuration * fps);
  const loopKind = getEffectiveLoopKind(
    style.animationType,
    style.animationDirection,
  );
  const totalFrames = loopKind === 'alternate' ? frameCount * 2 : frameCount;
  const frameDuration = 1000 / fps;
  const logoCycles = getLogoCycles(style, totalFrames, fps);

  let maskData: Uint8ClampedArray | null = null;
  if (layers.colorMaskUrl) {
    const maskImg = await imageFromDataUrl(layers.colorMaskUrl);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    maskCanvas.getContext('2d')!.drawImage(maskImg, 0, 0, size, size);
    maskData = maskCanvas.getContext('2d')!.getImageData(0, 0, size, size).data;
  }
  const baseImg = layers.baseImageUrl
    ? await imageFromDataUrl(layers.baseImageUrl)
    : null;
  const logoImg = layers.logoLayerUrl
    ? await imageFromDataUrl(layers.logoLayerUrl)
    : null;

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const paintFrame = (f: number) => {
    if (maskData) {
      const phase = computePhase(
        f,
        totalFrames,
        style.animationType,
        style.animationDirection,
        style.animationTimingFunction,
      );
      const grad = renderGradientFrame(
        size,
        style.animationStops,
        phase,
        style.animationType,
      );
      const frameData = compositeFrame(grad, maskData, bgColor, size);
      ctx.putImageData(
        new ImageData(frameData as Uint8ClampedArray<ArrayBuffer>, size, size),
        0,
        0,
      );
    } else if (baseImg) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(baseImg, 0, 0, size, size);
    }
    if (logoImg) {
      const lp = logoPhaseAt(f, totalFrames, logoCycles);
      drawLogoTransformed(
        ctx,
        logoImg,
        size,
        computeLogoTransform(style.logoAnimationType, lp),
      );
    }
  };

  // Paint first frame before recording starts
  paintFrame(0);

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime.mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  recorder.start();
  onProgress?.(0);

  for (let f = 1; f < totalFrames; f++) {
    paintFrame(f);

    await new Promise((r) => setTimeout(r, frameDuration));
    onProgress?.(Math.round(((f + 1) / totalFrames) * 95));
  }

  await new Promise((r) => setTimeout(r, 100));

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime.mimeType });
      onProgress?.(100);
      resolve({ blob, ext: mime.ext });
    };
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  });
}
