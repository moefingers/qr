// Shared main-thread helper: decode a canvas data URL into an ImageBitmap
// sized to the export canvas, ready to transfer into a worker. Used by the
// video and GIF export entry points.
export async function bitmapFromDataUrl(
  url: string,
  size: number,
): Promise<ImageBitmap> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load export layer'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
  return createImageBitmap(canvas);
}

// Decode a canvas data URL into an HTMLImageElement (no bitmap transfer).
// Used by the single-frame and MediaRecorder fallback exporters, which
// composite on the main thread.
export async function imageFromDataUrl(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load export layer'));
    img.src = url;
  });
  return img;
}
