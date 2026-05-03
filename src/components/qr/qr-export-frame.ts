import type { StyleData } from './qr-types';
import { parseHex, renderGradientFrame, compositeFrame } from './qr-export-render';

export type FrameFormat = 'png' | 'webp';

export async function exportFrame(
  maskDataUrl: string,
  style: StyleData,
  format: FrameFormat,
  phase = 0.5,
): Promise<Blob> {
  const size = style.qrSize;

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
  const gradData = renderGradientFrame(size, style.animationStops, phase);
  const frameData = compositeFrame(gradData, maskData, bgColor, size);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = size;
  outputCanvas.height = size;
  const ctx = outputCanvas.getContext('2d')!;
  ctx.putImageData(new ImageData(frameData as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);

  const mimeType = format === 'png' ? 'image/png' : 'image/webp';
  const quality = format === 'webp' ? 0.95 : undefined;

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      mimeType,
      quality,
    );
  });
}
