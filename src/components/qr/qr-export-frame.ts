import type { StyleData, AnimationLayers } from './qr-types';
import {
  parseHex,
  renderGradientFrame,
  compositeFrame,
  drawLogoTransformed,
  isLogoColoredByAnimation,
  paintLogoColorFill,
} from './qr-export-render';
import { imageFromDataUrl } from './qr-export-assets';

export type FrameFormat = 'png' | 'webp';

export async function exportFrame(
  layers: AnimationLayers,
  style: StyleData,
  format: FrameFormat,
  phase = 0.5,
): Promise<Blob> {
  const size = style.qrSize;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = size;
  outputCanvas.height = size;
  const ctx = outputCanvas.getContext('2d')!;

  let gradData: Uint8ClampedArray | null = null;

  if (layers.colorMaskUrl) {
    const maskImg = await imageFromDataUrl(layers.colorMaskUrl);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    maskCanvas.getContext('2d')!.drawImage(maskImg, 0, 0, size, size);
    const maskData = maskCanvas
      .getContext('2d')!
      .getImageData(0, 0, size, size).data;

    const bgColor = style.transparentBg ? null : parseHex(style.bgColor);
    gradData = renderGradientFrame(size, style.animationStops, phase, style.animationType);
    const frameData = compositeFrame(gradData, maskData, bgColor, size);
    ctx.putImageData(
      new ImageData(frameData as Uint8ClampedArray<ArrayBuffer>, size, size),
      0,
      0,
    );
  } else if (layers.baseImageUrl) {
    const baseImg = await imageFromDataUrl(layers.baseImageUrl);
    ctx.drawImage(baseImg, 0, 0, size, size);
  }

  // The still shows the logo undistorted (identity transform) regardless
  // of its motion type — a representative frame, not mid-flip. When the
  // logo is colored by the animation, fill its silhouette with the
  // sampled-phase color.
  if (layers.logoLayerUrl) {
    const logoImg = await imageFromDataUrl(layers.logoLayerUrl);
    const identity = { scaleX: 1, scaleY: 1, opacity: 1 };
    if (isLogoColoredByAnimation(style) && gradData) {
      const scratch = document.createElement('canvas');
      scratch.width = size;
      scratch.height = size;
      paintLogoColorFill(scratch.getContext('2d')!, gradData, logoImg, size);
      drawLogoTransformed(ctx, scratch, size, identity);
    } else {
      drawLogoTransformed(ctx, logoImg, size, identity);
    }
  }

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
