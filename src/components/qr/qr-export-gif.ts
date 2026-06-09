import type { StyleData, AnimationLayers } from './qr-types';
import { bitmapFromDataUrl } from './qr-export-assets';
// `?worker&inline` tells Vite to bundle the worker as a base64 string
// and construct a Blob at runtime via URL.createObjectURL, so the
// production HTML has no external worker file. Same Worker semantics,
// just delivered inline.
import GifWorker from './qr-export-gif-worker.ts?worker&inline';

export async function exportGif(
  layers: AnimationLayers,
  style: StyleData,
  frameCount = 60,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const exportSize = style.qrSize;

  const maskBitmap = layers.colorMaskUrl
    ? await bitmapFromDataUrl(layers.colorMaskUrl, exportSize)
    : null;
  const baseBitmap = layers.baseImageUrl
    ? await bitmapFromDataUrl(layers.baseImageUrl, exportSize)
    : null;
  const logoBitmap = layers.logoLayerUrl
    ? await bitmapFromDataUrl(layers.logoLayerUrl, exportSize)
    : null;
  const transfer = [maskBitmap, baseBitmap, logoBitmap].filter((b): b is ImageBitmap => b !== null);

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

    worker.postMessage({ maskBitmap, baseBitmap, logoBitmap, style, frameCount }, transfer);
  });
}
