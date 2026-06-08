import type {
  AnimationStop,
  AnimationType,
  AnimationDirection,
  AnimationTimingFunction,
  LogoAnimationType,
  StyleData,
} from './qr-types';

export type AnimationLoopKind = 'forward' | 'alternate';

// Types that travel back-and-forth want their cycle stretched across 2×
// the frame count so the wall-clock pace matches forward types.
export function getAnimationLoopKind(type: AnimationType): AnimationLoopKind {
  return type === 'breathe' || type === 'pulse' || type === 'wave'
    ? 'alternate'
    : 'forward';
}

// Effective loop kind incl. user-controlled direction. A forward-loop
// type with direction `alt` (bounce) needs the cycle doubled too.
export function getEffectiveLoopKind(
  type: AnimationType,
  direction: AnimationDirection,
): AnimationLoopKind {
  if (getAnimationLoopKind(type) === 'alternate') return 'alternate';
  return direction === 'alt' ? 'alternate' : 'forward';
}

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

// JS counterparts of CSS animation-timing-function keywords. Polynomial
// approximations are visually close enough to the spec cubic-beziers for
// preview/export use.
function applyEasing(t: number, fn: AnimationTimingFunction): number {
  switch (fn) {
    case 'ease':
      return t * t * (3 - 2 * t);
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'linear':
    default:
      return t;
  }
}

export function computePhase(
  f: number,
  total: number,
  type: AnimationType,
  direction: AnimationDirection = 'cw',
  timing: AnimationTimingFunction = 'linear',
): number {
  let t = total > 0 ? f / total : 0;

  // `alt` on a forward-loop type runs forward then reverses; the caller
  // achieves this by doubling totalFrames, and we map t to a triangle
  // wave so the doubled cycle bounces. Intrinsic-alternate types
  // already bounce via their type shape (below) and skip this.
  const intrinsicAlt = getAnimationLoopKind(type) === 'alternate';
  if (direction === 'alt' && !intrinsicAlt) {
    t = t < 0.5 ? t * 2 : 2 - t * 2;
  }

  // `ccw` reverses time. After the alt-bounce so an alt+ccw combo still
  // bounces; it just starts from the other end of the cycle.
  if (direction === 'ccw') t = 1 - t;

  t = applyEasing(t, timing);

  switch (type) {
    case 'breathe': {
      // Triangle wave with ease-out: gentle inhale/exhale.
      const pp = t < 0.5 ? t * 2 : 2 - t * 2;
      return 1 - (1 - pp) * (1 - pp);
    }
    case 'pulse':
      return Math.pow(Math.sin(t * Math.PI), 2);
    case 'wave':
      return Math.sin(t * Math.PI);
    default:
      // Linear forward sweep used by sweep / radialLoop / spiral / colorCycle.
      return t;
  }
}

export function colorAtPhase(
  stops: AnimationStop[],
  phase: number,
): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return parseHex(stops[0]!.color);
  const segs = stops.length - 1;
  const sp = phase * segs;
  const i = Math.max(0, Math.min(segs - 1, Math.floor(sp)));
  const t = sp - i;
  return lerpRgb(parseHex(stops[i]!.color), parseHex(stops[i + 1]!.color), t);
}

export function renderGradientFrame(
  size: number,
  stops: AnimationStop[],
  phase: number,
  type: AnimationType,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);

  // Uniform-color types: every pixel renders the same color sampled from
  // the stop sequence at the current phase.
  if (type === 'pulse' || type === 'colorCycle') {
    const [r, g, b] = colorAtPhase(stops, phase);
    for (let i = 0; i < size * size; i++) {
      const pi = i * 4;
      data[pi] = r;
      data[pi + 1] = g;
      data[pi + 2] = b;
      data[pi + 3] = 255;
    }
    return data;
  }

  const cx = size / 2,
    cy = size / 2;
  const maxR = size * 0.7;

  const positions = stops.map(
    (s) => (s.position + (s.positionEnd - s.position) * phase) / 100,
  );
  const colors = stops.map((s) =>
    parseHex(
      s.color === s.colorEnd ? s.color : lerpHex(s.color, s.colorEnd, phase),
    ),
  );

  const sorted = positions
    .map((p, i) => ({ pos: p, color: colors[i]! }))
    .sort((a, b) => a.pos - b.pos);

  const firstPos = sorted[0]!.pos;
  const lastPos = sorted[sorted.length - 1]!.pos;
  const interval = Math.max(Math.abs(lastPos - firstPos), 0.02);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Per-type "flow axis" mapping to a raw 0..1 position before the
      // band-wrap modulo.
      let frac: number;
      switch (type) {
        case 'sweep':
          frac = x / size;
          break;
        case 'wave':
          frac = (x + y) / (size * 1.5);
          break;
        case 'spiral': {
          // Angular sweep around center, with `phase` added so the conic
          // gradient spins. Stop positions stay fixed for spiral; the
          // rotation comes from this term.
          const ang = Math.atan2(y - cy, x - cx) / (2 * Math.PI) + 0.5;
          frac = ang + phase;
          break;
        }
        case 'radialLoop':
        case 'breathe':
        default:
          frac = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxR;
          break;
      }

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
        frame[pi + 1] = Math.round(
          gradData[pi + 1]! * a + bgColor[1] * (1 - a),
        );
        frame[pi + 2] = Math.round(
          gradData[pi + 2]! * a + bgColor[2] * (1 - a),
        );
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

// ─── Logo transform animation ────────────────────────────────────────
// The logo animates on a separate track from the color animation: it is
// redrawn (in its own colors) on top of every frame and moved/scaled/faded
// per-frame. These helpers are shared by the live CSS preview's
// keyframe-sampling and by every canvas-based export path.

export interface LogoTransform {
  scaleX: number;
  scaleY: number;
  opacity: number;
}

// phase ∈ [0,1) over one cycle. All curves return to their start at
// phase 1 so the exported loop is seamless.
export function computeLogoTransform(
  type: LogoAnimationType,
  phase: number,
): LogoTransform {
  const tau = Math.PI * 2;
  switch (type) {
    case 'pulse':
      // Opacity dips and recovers (cosine ⇒ smooth, seamless).
      return {
        scaleX: 1,
        scaleY: 1,
        opacity: 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(tau * phase)),
      };
    case 'scale': {
      // Expand / contract around 1.0.
      const s = 1 + 0.15 * Math.sin(tau * phase);
      return { scaleX: s, scaleY: s, opacity: 1 };
    }
    case 'flipX':
      // scaleX swept +1 → 0 → -1 → 0 → +1 (coin flip).
      return { scaleX: Math.cos(tau * phase), scaleY: 1, opacity: 1 };
    case 'none':
    default:
      return { scaleX: 1, scaleY: 1, opacity: 1 };
  }
}

// Speed that drives the export loop duration: the color animation when
// it's active, otherwise the logo's own speed (so a logo-only animation
// still produces a sensibly-paced export).
export function getExportSpeed(style: StyleData): number {
  return style.animationType !== 'none'
    ? style.animationSpeed
    : style.logoAnimationSpeed;
}

// The logo's two animation axes are orthogonal:
//  • color-over (logoColorOver) — is the logo painted by the QR's color
//    animation, or kept in its own colors?
//  • motion (logoAnimationType) — does the logo pulse/scale/flip?
// When the QR color animation is on, color-over is on, and the logo has
// motion, the logo layer is the logo SILHOUETTE filled per-frame by the
// QR's animated color (rather than composited in its own colors).
export function isLogoColoredByAnimation(style: StyleData): boolean {
  return (
    style.animationType !== 'none' &&
    style.logoColorOver &&
    style.logoAnimationType !== 'none'
  );
}

// Integer number of logo cycles across the whole export loop. Integer ⇒
// the last frame lines up with the first, keeping GIF/video loops
// seamless. Derived from wall-clock so the logo's pace tracks its speed
// slider regardless of the color track's frame count. Driven purely by
// motion — independent of color-over.
export function getLogoCycles(
  style: StyleData,
  totalFrames: number,
  fps: number,
): number {
  if (style.logoAnimationType === 'none') return 0;
  if (totalFrames <= 0 || fps <= 0) return 0;
  const loopSec = totalFrames / fps;
  const logoCycleSec = (100 / Math.max(style.logoAnimationSpeed, 1)) * 4;
  return Math.max(1, Math.round(loopSec / logoCycleSec));
}

export function logoPhaseAt(
  f: number,
  totalFrames: number,
  logoCycles: number,
): number {
  if (logoCycles <= 0 || totalFrames <= 0) return 0;
  return ((f / totalFrames) * logoCycles) % 1;
}

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Draws the (full-canvas-size) logo layer onto a frame with the given
// transform, scaled about the canvas center. Works on both DOM and
// OffscreenCanvas contexts.
export function drawLogoTransformed(
  ctx: AnyCtx2D,
  logo: CanvasImageSource,
  size: number,
  t: LogoTransform,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity));
  ctx.translate(size / 2, size / 2);
  ctx.scale(t.scaleX, t.scaleY);
  ctx.translate(-size / 2, -size / 2);
  ctx.drawImage(logo, 0, 0, size, size);
  ctx.restore();
}

// Paints `scratchCtx` with the current animated-color frame (gradData)
// clipped to the logo silhouette (the logo's alpha). The result is the
// logo shape painted in the QR's animated color, transparent elsewhere —
// ready to be drawn transformed via drawLogoTransformed. Used for the
// color-over + motion case.
export function paintLogoColorFill(
  scratchCtx: AnyCtx2D,
  gradData: Uint8ClampedArray,
  logo: CanvasImageSource,
  size: number,
): void {
  scratchCtx.putImageData(
    new ImageData(gradData as Uint8ClampedArray<ArrayBuffer>, size, size),
    0,
    0,
  );
  scratchCtx.save();
  scratchCtx.globalCompositeOperation = 'destination-in';
  scratchCtx.drawImage(logo, 0, 0, size, size);
  scratchCtx.restore();
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
