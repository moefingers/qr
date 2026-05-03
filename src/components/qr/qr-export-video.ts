import type { StyleData } from './qr-types';

export type VideoFormat = 'mp4' | 'webm';

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export async function exportVideo(
  maskDataUrl: string,
  style: StyleData,
  format: VideoFormat,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (!isWebCodecsSupported()) {
    throw new Error('WebCodecs API not supported in this browser');
  }

  const size = style.qrSize;
  const fps = 60;
  const speed = Math.max(style.animationSpeed, 1);
  const cycleDuration = (100 / speed) * 4;
  const frameCount = Math.round(cycleDuration * fps);

  const maskImg = new Image();
  await new Promise<void>((resolve) => {
    maskImg.onload = () => resolve();
    maskImg.src = maskDataUrl;
  });
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = size;
  maskCanvas.height = size;
  maskCanvas.getContext('2d')!.drawImage(maskImg, 0, 0, size, size);
  const maskBitmap = await createImageBitmap(maskCanvas);

  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./qr-export-video-worker.ts', import.meta.url));

    worker.onmessage = (
      e: MessageEvent<{ type: string; pct?: number; result?: ArrayBuffer; msg?: string }>,
    ) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.pct!);
      } else if (e.data.type === 'done') {
        resolve(new Blob([e.data.result!], { type: mimeType }));
        worker.terminate();
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.msg));
        worker.terminate();
      }
    };

    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };

    worker.postMessage({ maskBitmap, style, format, frameCount, fps }, [maskBitmap]);
  });
}
