import type { AnimationStop } from './qr-types';

export function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function lerpHex(a: string, b: string, t: number): string {
  const [r, g, bv] = lerpRgb(parseHex(a), parseHex(b), t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`;
}

export function computePhase(f: number, total: number, isBreathe: boolean): number {
  const t = f / total;
  if (isBreathe) {
    const pp = t < 0.5 ? t * 2 : 2 - t * 2;
    return 1 - (1 - pp) * (1 - pp);
  }
  return t;
}

export function renderGradientFrame(
  size: number,
  stops: AnimationStop[],
  phase: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2,
    cy = size / 2;
  const maxR = size * 0.7;

  const positions = stops.map((s) => (s.position + (s.positionEnd - s.position) * phase) / 100);
  const colors = stops.map((s) =>
    parseHex(s.color === s.colorEnd ? s.color : lerpHex(s.color, s.colorEnd, phase)),
  );

  const sorted = positions
    .map((p, i) => ({ pos: p, color: colors[i]! }))
    .sort((a, b) => a.pos - b.pos);

  const firstPos = sorted[0]!.pos;
  const lastPos = sorted[sorted.length - 1]!.pos;
  const interval = Math.max(Math.abs(lastPos - firstPos), 0.02);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const frac = dist / maxR;

      const withinBand = (((frac - firstPos) % interval) + interval) % interval;
      const bandPos = withinBand + firstPos;

      let r = sorted[0]!.color[0],
        g = sorted[0]!.color[1],
        b = sorted[0]!.color[2];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (bandPos >= sorted[i]!.pos && bandPos <= sorted[i + 1]!.pos) {
          const range = sorted[i + 1]!.pos - sorted[i]!.pos;
          const t = range > 0.001 ? (bandPos - sorted[i]!.pos) / range : 0;
          const c = lerpRgb(sorted[i]!.color, sorted[i + 1]!.color, t);
          r = c[0];
          g = c[1];
          b = c[2];
          break;
        }
      }

      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  return data;
}

export function compositeFrame(
  gradData: Uint8ClampedArray,
  maskData: Uint8ClampedArray,
  bgColor: [number, number, number] | null,
  size: number,
): Uint8ClampedArray {
  const frame = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const pi = i * 4;
    const maskAlpha = maskData[pi + 3]!;
    if (maskAlpha > 0) {
      const a = maskAlpha / 255;
      if (bgColor) {
        frame[pi] = Math.round(gradData[pi]! * a + bgColor[0] * (1 - a));
        frame[pi + 1] = Math.round(gradData[pi + 1]! * a + bgColor[1] * (1 - a));
        frame[pi + 2] = Math.round(gradData[pi + 2]! * a + bgColor[2] * (1 - a));
        frame[pi + 3] = 255;
      } else {
        frame[pi] = gradData[pi]!;
        frame[pi + 1] = gradData[pi + 1]!;
        frame[pi + 2] = gradData[pi + 2]!;
        frame[pi + 3] = Math.round(a * 255);
      }
    } else if (bgColor) {
      frame[pi] = bgColor[0];
      frame[pi + 1] = bgColor[1];
      frame[pi + 2] = bgColor[2];
      frame[pi + 3] = 255;
    }
  }
  return frame;
}

export function floydSteinbergDither(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[][],
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(rgba);
  const errors = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const eIdx = (y * width + x) * 3;

      let r = result[idx]! + errors[eIdx]!;
      let g = result[idx + 1]! + errors[eIdx + 1]!;
      let b = result[idx + 2]! + errors[eIdx + 2]!;

      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      let bestDist = Infinity;
      let bestR = 0,
        bestG = 0,
        bestB = 0;
      for (const p of palette) {
        const dr = r - p[0]!,
          dg = g - p[1]!,
          db = b - p[2]!;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestR = p[0]!;
          bestG = p[1]!;
          bestB = p[2]!;
        }
      }

      result[idx] = bestR;
      result[idx + 1] = bestG;
      result[idx + 2] = bestB;

      const errR = r - bestR;
      const errG = g - bestG;
      const errB = b - bestB;

      const diffuse = (n: number, weight: number) => {
        errors[n] = errors[n]! + errR * weight;
        errors[n + 1] = errors[n + 1]! + errG * weight;
        errors[n + 2] = errors[n + 2]! + errB * weight;
      };

      if (x + 1 < width) diffuse((y * width + x + 1) * 3, 7 / 16);
      if (y + 1 < height) {
        if (x - 1 >= 0) diffuse(((y + 1) * width + x - 1) * 3, 3 / 16);
        diffuse(((y + 1) * width + x) * 3, 5 / 16);
        if (x + 1 < width) diffuse(((y + 1) * width + x + 1) * 3, 1 / 16);
      }
    }
  }

  return result;
}
