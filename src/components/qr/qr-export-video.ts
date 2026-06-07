import type { StyleData, AnimationLayers } from './qr-types';
import { getExportSpeed } from './qr-export-render';
import { bitmapFromDataUrl } from './qr-export-assets';
// See qr-export-gif.ts for why `?worker&inline` — same single-bundle rationale.
import VideoWorker from './qr-export-video-worker.ts?worker&inline';

export type VideoFormat = 'mp4' | 'webm';

export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
  );
}

export async function exportVideo(
  layers: AnimationLayers,
  style: StyleData,
  format: VideoFormat,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  if (!isWebCodecsSupported()) {
    const { exportVideoFallback, isMediaRecorderFallbackSupported } =
      await import('./qr-export-video-fallback');
    if (!isMediaRecorderFallbackSupported()) {
      throw new Error('Video export is not supported in this browser');
    }
    return exportVideoFallback(layers, style, onProgress);
  }

  const size = style.qrSize;
  const fps = 60;
  const speed = Math.max(getExportSpeed(style), 1);
  const cycleDuration = (100 / speed) * 4;
  const frameCount = Math.round(cycleDuration * fps);

  const maskBitmap = layers.colorMaskUrl
    ? await bitmapFromDataUrl(layers.colorMaskUrl, size)
    : null;
  const baseBitmap = layers.baseImageUrl
    ? await bitmapFromDataUrl(layers.baseImageUrl, size)
    : null;
  const logoBitmap = layers.logoLayerUrl
    ? await bitmapFromDataUrl(layers.logoLayerUrl, size)
    : null;
  const transfer = [maskBitmap, baseBitmap, logoBitmap].filter(
    (b): b is ImageBitmap => b !== null,
  );

  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';

  return new Promise((resolve, reject) => {
    const worker = new VideoWorker();

    worker.onmessage = (
      e: MessageEvent<{
        type: string;
        pct?: number;
        result?: ArrayBuffer;
        msg?: string;
      }>,
    ) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.pct!);
      } else if (e.data.type === 'done') {
        resolve({
          blob: new Blob([e.data.result!], { type: mimeType }),
          ext: format,
        });
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

    worker.postMessage(
      { maskBitmap, baseBitmap, logoBitmap, style, format, frameCount, fps },
      transfer,
    );
  });
}
