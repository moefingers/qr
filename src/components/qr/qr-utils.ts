export const RENDER_DEBOUNCE_MS = 150;
export const SAVE_DEBOUNCE_MS = 800;
export const MAX_QR_BYTES = 2953;
export const QR_BYTE_WARN_THRESHOLD = 2500;
export const MAX_LOGO_BYTES = 500_000;

export function parseSvgAspect(markup: string): number {
  const vbMatch = markup.match(/viewBox=["'][\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)["']/);
  const wMatch = markup.match(/width=["']([\d.]+)/);
  const hMatch = markup.match(/height=["']([\d.]+)/);
  let svgW = 0,
    svgH = 0;
  if (vbMatch) {
    svgW = parseFloat(vbMatch[1]!);
    svgH = parseFloat(vbMatch[2]!);
  } else if (wMatch && hMatch) {
    svgW = parseFloat(wMatch[1]!);
    svgH = parseFloat(hMatch[1]!);
  }
  return svgW > 0 && svgH > 0 ? svgW / svgH : 1;
}

export function computeLogoDimensions(
  maxDim: number,
  img: { naturalWidth: number; naturalHeight: number } | null,
  svgMarkup: string | null,
): { w: number; h: number } {
  let aspect = 1;
  if (img && img.naturalWidth && img.naturalHeight) {
    aspect = img.naturalWidth / img.naturalHeight;
  } else if (svgMarkup) {
    aspect = parseSvgAspect(svgMarkup);
  }
  if (aspect > 1) return { w: maxDim, h: maxDim / aspect };
  if (aspect < 1) return { w: maxDim * aspect, h: maxDim };
  return { w: maxDim, h: maxDim };
}

export function sanitizeFilename(name: string, fallback = 'qrcode'): string {
  return name.replace(/\s+/g, '_').toLowerCase() || fallback;
}
