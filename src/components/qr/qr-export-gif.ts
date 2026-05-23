import type { StyleData } from './qr-types';
// `?worker&inline` tells Vite to bundle the worker as a base64 string
// and construct a Blob at runtime via URL.createObjectURL, so the
// production HTML has no external worker file. Same Worker semantics,
// just delivered inline.
import GifWorker from './qr-export-gif-worker.ts?worker&inline';

export async function exportGif(
  maskDataUrl: string,
  style: StyleData,
  frameCount = 60,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const exportSize = style.qrSize;

  const maskImg = new Image();
  await new Promise<void>((resolve) => {
    maskImg.onload = () => resolve();
    maskImg.src = maskDataUrl;
  });
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = exportSize;
  maskCanvas.height = exportSize;
  maskCanvas.getContext('2d')!.drawImage(maskImg, 0, 0, exportSize, exportSize);
  const maskBitmap = await createImageBitmap(maskCanvas);

  return new Promise((resolve, reject) => {
    const worker = new GifWorker();

    worker.onmessage = (
      e: MessageEvent<{ type: string; pct?: number; result?: ArrayBuffer; msg?: string }>,
    ) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.pct!);
      } else if (e.data.type === 'done') {
        resolve(new Blob([e.data.result!], { type: 'image/gif' }));
        worker.terminate();
      }
    };

    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };

    worker.postMessage({ maskBitmap, style, frameCount }, [maskBitmap]);
  });
}
