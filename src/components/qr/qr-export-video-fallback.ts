import type { StyleData } from './qr-types';
import { parseHex, computePhase, renderGradientFrame, compositeFrame } from './qr-export-render';

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
  maskDataUrl: string,
  style: StyleData,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const mime = bestMime();
  if (!mime) throw new Error('Video recording is not supported in this browser');

  const size = style.qrSize;
  const fps = 30;
  const speed = Math.max(style.animationSpeed, 1);
  const cycleDuration = (100 / speed) * 4;
  const frameCount = Math.round(cycleDuration * fps);
  const isBreathe = style.animationType === 'breathe';
  const totalFrames = isBreathe ? frameCount * 2 : frameCount;
  const frameDuration = 1000 / fps;

  const maskImg = new Image();
  await new Promise<void>((resolve) => {
    maskImg.onload = () => resolve();
    maskImg.src = maskDataUrl;
  });
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = size;
  maskCanvas.height = size;
  maskCanvas.getContext('2d')!.drawImage(maskImg, 0, 0, size, size);
  const maskData = maskCanvas.getContext('2d')!.getImageData(0, 0, size, size).data;

  const bgColor = style.transparentBg ? null : parseHex(style.bgColor);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Paint first frame before recording starts
  const p0 = computePhase(0, totalFrames, isBreathe);
  const g0 = renderGradientFrame(size, style.animationStops, p0);
  const f0 = compositeFrame(g0, maskData, bgColor, size);
  ctx.putImageData(new ImageData(f0 as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);

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
    const phase = computePhase(f, totalFrames, isBreathe);
    const gradData = renderGradientFrame(size, style.animationStops, phase);
    const frameData = compositeFrame(gradData, maskData, bgColor, size);
    ctx.putImageData(
      new ImageData(frameData as Uint8ClampedArray<ArrayBuffer>, size, size),
      0,
      0,
    );

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
