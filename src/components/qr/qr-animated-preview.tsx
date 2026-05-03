import { useMemo } from 'react';
import type { StyleData } from './qr-types';

let instanceCounter = 0;

interface Props {
  maskDataUrl: string;
  style: StyleData;
  size: number;
}

export function QrAnimatedPreview({ maskDataUrl, style, size }: Props) {
  const id = useMemo(() => instanceCounter++, []);

  const css = useMemo(() => {
    if (style.animationType === 'none') return '';

    const stops = style.animationStops;
    const speed = Math.max(style.animationSpeed, 1);
    const duration = (100 / speed) * 4;

    const v = (i: number) => `--qp${id}-${i}`;

    const propertyDefs = stops
      .map(
        (_, i) => `@property ${v(i)} {
  syntax: '<percentage>';
  inherits: false;
  initial-value: ${stops[i]!.position}%;
}`,
      )
      .join('\n');

    const gradientStops = stops.map((s, i) => `${s.color} var(${v(i)})`).join(', ');
    const kfFrom = stops.map((s, i) => `${v(i)}: ${s.position}%;`).join(' ');
    const kfTo = stops.map((s, i) => `${v(i)}: ${s.positionEnd}%;`).join(' ');

    const isBreathe = style.animationType === 'breathe';
    const timing = isBreathe ? 'ease-out alternate-reverse' : 'linear';

    return `
${propertyDefs}

@keyframes qra${id} {
  0% { ${kfFrom} }
  100% { ${kfTo} }
}

.qrag${id} {
  background: repeating-radial-gradient(${gradientStops});
  animation: ${duration}s qra${id} ${timing} infinite;
  -webkit-mask-image: url("${maskDataUrl}");
  mask-image: url("${maskDataUrl}");
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  width: ${size}px;
  max-width: 100%;
  aspect-ratio: 1;
}`;
  }, [maskDataUrl, style, size, id]);

  if (style.animationType === 'none' || !css) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className={`qrag${id}`}
        style={style.animationSpeed === 0 ? { animationPlayState: 'paused' } : undefined}
      />
    </>
  );
}
