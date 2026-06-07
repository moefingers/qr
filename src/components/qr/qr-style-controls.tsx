import { useState, useRef, useEffect } from 'react';
import { Save as SaveIcon, Trash2, Star } from 'lucide-react';
import type {
  StyleData,
  DotShape,
  CornerShape,
  GradientType,
  ErrorCorrectionLevel,
  AnimationType,
  AnimationDirection,
  AnimationTimingFunction,
  AnimationStop,
  AnimationLayers,
  LogoAnimationType,
} from './qr-types';
import { DEFAULT_STYLE } from './qr-types';
import { QR_PRESETS } from './qr-presets';
import { QrAnimatedPreview } from './qr-animated-preview';
import {
  renderQrToCanvas,
  generateQrMatrix,
  renderLogoLayer,
} from './qr-canvas-renderer';
import { computeDodgeMask } from './qr-dot-dodge';
import styles from './qr-style-controls.module.css';

// For `sweep` and `radialLoop` the animation plays through a repeating
// gradient in a single direction. For it to wrap seamlessly back to
// frame 0, the gradient at `positionEnd` must be visually identical to
// the gradient at `position` — meaning every stop must shift by the
// same amount AND that shift must be an integer multiple of the band
// period (lastStop - firstStop). Other types either bounce or wrap
// inherently and don't need this check.
function checkLoopSeamless(
  type: AnimationType,
  stops: AnimationStop[],
): string | null {
  if (type !== 'sweep' && type !== 'radialLoop') return null;
  if (!Array.isArray(stops) || stops.length < 2) return null;

  const shifts = stops.map((s) => s.positionEnd - s.position);
  const firstShift = shifts[0]!;
  if (shifts.some((s) => Math.abs(s - firstShift) > 0.01)) {
    return 'Stops should all shift by the same amount (positionEnd − position) for a seamless loop.';
  }

  const minPos = Math.min(...stops.map((s) => s.position));
  const maxPos = Math.max(...stops.map((s) => s.position));
  const period = maxPos - minPos;
  if (period < 0.01) return null;

  const ratio = firstShift / period;
  const rounded = Math.round(ratio);
  if (rounded === 0 || Math.abs(ratio - rounded) > 0.02) {
    const target = (rounded === 0 ? 1 : rounded) * period;
    return `Shift of ${firstShift.toFixed(1)} isn't a clean multiple of the band period ${period.toFixed(1)}. Try shift = ${target.toFixed(1)} (${rounded === 0 ? 1 : rounded}× the period).`;
  }

  return null;
}

// Some types look right only when the cycle bounces forward-then-reverse,
// because their gradient-position keyframes go from start to end without
// returning. Those default to direction 'alt'.
function getAnimationDirectionPreset(type: AnimationType): AnimationDirection {
  return type === 'breathe' || type === 'wave' ? 'alt' : 'cw';
}

// Per-type default for the timing function. Breathe wants ease-out for
// its gentle exhale, wave wants ease-in-out so the swell rises and falls
// smoothly. Everything else stays linear.
function getAnimationTimingPreset(
  type: AnimationType,
): AnimationTimingFunction {
  if (type === 'breathe') return 'ease-out';
  if (type === 'wave') return 'ease-in-out';
  return 'linear';
}

function getAnimationStopPreset(
  type: AnimationType,
  dotColor: string,
): AnimationStop[] | null {
  const accent = '#5eead4';
  switch (type) {
    case 'breathe':
      return [
        { color: dotColor, colorEnd: dotColor, position: 10, positionEnd: 20 },
        { color: accent, colorEnd: accent, position: 20, positionEnd: 15 },
        { color: dotColor, colorEnd: dotColor, position: 30, positionEnd: 10 },
      ];
    case 'radialLoop':
      // Seamless: each stop shifts by exactly one band width (last - first).
      return [
        { color: dotColor, colorEnd: dotColor, position: 10, positionEnd: 20 },
        { color: accent, colorEnd: accent, position: 12, positionEnd: 22 },
        { color: dotColor, colorEnd: dotColor, position: 20, positionEnd: 30 },
      ];
    case 'sweep':
      // Shift (40) is two periods of the band (20) -> seamless wrap.
      return [
        { color: dotColor, colorEnd: dotColor, position: 0, positionEnd: 40 },
        { color: accent, colorEnd: accent, position: 10, positionEnd: 50 },
        { color: dotColor, colorEnd: dotColor, position: 20, positionEnd: 60 },
      ];
    case 'wave':
      return [
        { color: dotColor, colorEnd: dotColor, position: 5, positionEnd: 25 },
        { color: accent, colorEnd: accent, position: 15, positionEnd: 35 },
        { color: dotColor, colorEnd: dotColor, position: 25, positionEnd: 45 },
      ];
    case 'pulse':
      // Positions ignored for pulse; even spacing keeps the stop editor sensible.
      return [
        { color: dotColor, colorEnd: dotColor, position: 0, positionEnd: 0 },
        { color: accent, colorEnd: accent, position: 50, positionEnd: 50 },
        {
          color: dotColor,
          colorEnd: dotColor,
          position: 100,
          positionEnd: 100,
        },
      ];
    case 'spiral':
      return [
        { color: dotColor, colorEnd: dotColor, position: 0, positionEnd: 0 },
        { color: accent, colorEnd: accent, position: 50, positionEnd: 50 },
        {
          color: dotColor,
          colorEnd: dotColor,
          position: 100,
          positionEnd: 100,
        },
      ];
    case 'colorCycle':
      // Final stop matches first so wrap is seamless.
      return [
        { color: '#ef4444', colorEnd: '#ef4444', position: 0, positionEnd: 0 },
        {
          color: '#10b981',
          colorEnd: '#10b981',
          position: 33,
          positionEnd: 33,
        },
        {
          color: '#3b82f6',
          colorEnd: '#3b82f6',
          position: 67,
          positionEnd: 67,
        },
        {
          color: '#ef4444',
          colorEnd: '#ef4444',
          position: 100,
          positionEnd: 100,
        },
      ];
    default:
      return null;
  }
}

interface Props {
  style: StyleData;
  onChange: (style: StyleData) => void;
  customLogo: string | null;
  onLogoChange: (logo: string | null) => void;
  isSvgLogo: boolean;
  // Live QR data string. Save tiles render previews using this so the
  // user sees what their actual content looks like in each saved style,
  // not a placeholder.
  qrData: string;
}

type Tab =
  | 'presets'
  | 'saves'
  | 'colors'
  | 'dots'
  | 'logo'
  | 'animate'
  | 'advanced';

const DOT_SHAPES: { id: DotShape; label: string; icon: string }[] = [
  { id: 'square', label: 'Square', icon: '■' },
  { id: 'dot', label: 'Circle', icon: '●' },
  { id: 'rounded', label: 'Rounded', icon: '▢' },
  { id: 'diamond', label: 'Diamond', icon: '◆' },
  { id: 'star', label: 'Star', icon: '★' },
  { id: 'heart', label: 'Heart', icon: '♥' },
];

const CORNER_SHAPES: { id: CornerShape; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'dot', label: 'Circle' },
];

const ANIMATION_TYPES: { id: AnimationType; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'wave', label: 'Wave' },
  { id: 'radialLoop', label: 'Radial' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'colorCycle', label: 'Cycle' },
];

const DIRECTIONS: { id: AnimationDirection; label: string }[] = [
  { id: 'cw', label: 'Forward' },
  { id: 'ccw', label: 'Reverse' },
  { id: 'alt', label: 'Bounce' },
];

const LOGO_ANIMATION_TYPES: { id: LogoAnimationType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'scale', label: 'Expand / contract' },
  { id: 'flipX', label: 'Flip X' },
];

const NO_LAYERS: AnimationLayers = {
  colorMaskUrl: null,
  baseImageUrl: null,
  logoLayerUrl: null,
};

export function QrStyleControls({
  style,
  onChange,
  customLogo,
  onLogoChange,
  isSvgLogo,
  qrData,
}: Props) {
  const [tab, setTab] = useState<Tab>('presets');

  function set<K extends keyof StyleData>(key: K, value: StyleData[K]) {
    onChange({ ...style, [key]: value, activePreset: null });
  }

  function updateStop(i: number, patch: Partial<AnimationStop>) {
    const stops = [...style.animationStops];
    stops[i] = { ...stops[i]!, ...patch };
    onChange({ ...style, animationStops: stops });
  }

  function applyPreset(presetId: string) {
    const preset = QR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({ ...style, ...preset.overrides, activePreset: presetId });
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'presets', label: 'Presets' },
    { id: 'saves', label: 'Saves' },
    { id: 'colors', label: 'Colors' },
    { id: 'dots', label: 'Shapes' },
    { id: 'logo', label: 'Logo' },
    { id: 'animate', label: 'Animate' },
    { id: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.tabBar} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'presets' && (
        <div className={styles.grid4}>
          {QR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.optionTile} ${style.activePreset === p.id ? styles.optionTileActive : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              <div
                className={styles.swatch}
                style={{ background: p.preview.dot }}
              />
              <span className={styles.optionLabel}>{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'saves' && (
        <StyleSaves
          style={style}
          customLogo={customLogo}
          qrData={qrData}
          onLoad={(s, logo) => {
            onChange({ ...s, activePreset: null });
            if (logo !== undefined) onLogoChange(logo);
          }}
        />
      )}

      {tab === 'colors' && (
        <div className={styles.panel}>
          {style.animationType !== 'none' && (
            <div className="alert alert-warning">
              Animation is on, so the dot color below is overridden by the
              animated gradient. Edit the gradient stops in the{' '}
              <button
                type="button"
                onClick={() => setTab('animate')}
                style={{
                  textDecoration: 'underline',
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Animate tab
              </button>
              .
            </div>
          )}
          <ColorField
            label="Dot color"
            value={style.dotColor}
            onChange={(v) => set('dotColor', v)}
          />
          <ColorField
            label="Background"
            value={style.bgColor}
            onChange={(v) => set('bgColor', v)}
          />
          <ColorField
            label="Corner color"
            value={style.cornerColor || style.dotColor}
            onChange={(v) => set('cornerColor', v)}
            hint="Leave empty to match dot color"
          />
          <ToggleRow
            label="Transparent background"
            checked={style.transparentBg}
            onChange={(v) => set('transparentBg', v)}
          />
          <ToggleRow
            label="Gradient"
            checked={style.useGradient}
            onChange={(v) => set('useGradient', v)}
          />
          {style.useGradient && (
            <div className={styles.indented}>
              <ColorField
                label="Gradient end"
                value={style.gradientEndColor}
                onChange={(v) => set('gradientEndColor', v)}
              />
              <label>
                Type
                <select
                  value={style.gradientType}
                  onChange={(e) =>
                    set('gradientType', e.target.value as GradientType)
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </label>
              {style.gradientType === 'linear' && (
                <SliderField
                  label="Angle"
                  value={style.gradientAngle}
                  min={0}
                  max={360}
                  onChange={(v) => set('gradientAngle', v)}
                  suffix="deg"
                />
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'dots' && (
        <div className={styles.panel}>
          <div>
            <p className={styles.subHeading}>Dot shape</p>
            <div className={styles.grid3}>
              {DOT_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.optionTile} ${style.dotShape === s.id ? styles.optionTileActive : ''}`}
                  onClick={() => set('dotShape', s.id)}
                >
                  <span className={styles.optionIcon}>{s.icon}</span>
                  <span className={styles.optionLabel}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <SliderField
            label="Shape scale"
            value={style.shapeScale}
            min={60}
            max={160}
            onChange={(v) => set('shapeScale', v)}
            suffix="%"
          />

          <div>
            <p className={styles.subHeading}>Corner outer</p>
            <div className={styles.grid3}>
              {CORNER_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.optionTile} ${style.cornerOuterShape === s.id ? styles.optionTileActive : ''}`}
                  onClick={() => set('cornerOuterShape', s.id)}
                >
                  <span className={styles.optionLabel}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={styles.subHeading}>Corner inner</p>
            <div className={styles.grid3}>
              {CORNER_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.optionTile} ${style.cornerInnerShape === s.id ? styles.optionTileActive : ''}`}
                  onClick={() => set('cornerInnerShape', s.id)}
                >
                  <span className={styles.optionLabel}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'logo' && (
        <div className={styles.panel}>
          <div>
            <p className={styles.subHeading}>Custom logo</p>
            <label className={styles.uploadDrop}>
              <span>
                {customLogo && !customLogo.startsWith('/')
                  ? 'Logo uploaded — click to change'
                  : 'Click to upload (SVG, PNG, JPG)'}
              </span>
              <input
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onLogoChange(reader.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
            {customLogo && (
              <div className={styles.uploadActions}>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => onLogoChange(null)}
                >
                  Remove logo
                </button>
              </div>
            )}
          </div>

          {customLogo && (
            <>
              <SliderField
                label="Logo size"
                value={Math.round(style.logoSize * 100)}
                min={15}
                max={40}
                onChange={(v) => set('logoSize', v / 100)}
                suffix="%"
              />
              <SliderField
                label="Logo margin"
                value={style.logoMargin}
                min={0}
                max={14}
                onChange={(v) => set('logoMargin', v)}
                suffix="px"
              />
              <SliderField
                label="Dodge aggressiveness"
                value={Math.round(style.dodgeAggressiveness * 100)}
                min={0}
                max={500}
                step={1}
                inputBox
                onChange={(v) => set('dodgeAggressiveness', v / 100)}
                hint="100 = one module-width of clearance around the logo silhouette"
              />
              <SliderField
                label="Dodge softness"
                value={Math.round(style.dodgeSoftness * 100)}
                min={0}
                max={200}
                step={1}
                inputBox
                onChange={(v) => set('dodgeSoftness', v / 100)}
                hint="Width of the fade-out ring beyond the aggressiveness cutoff (0 = hard edge)"
              />
              <SliderField
                label="Logo coverage threshold"
                value={Math.round(style.dodgeCoverageThreshold * 100)}
                min={0}
                max={100}
                step={1}
                inputBox
                onChange={(v) => set('dodgeCoverageThreshold', v / 100)}
                suffix="%"
                hint="Minimum logo coverage per module before it counts as 'logo' (0 = any pixel, 100 = fully solid)"
              />
              <ToggleRow
                label="Independent styling"
                checked={style.logoIndependent}
                onChange={(v) => set('logoIndependent', v)}
              />
              {style.logoIndependent && isSvgLogo && (
                <div className={styles.indented}>
                  <ColorField
                    label="Logo color"
                    value={style.logoColor}
                    onChange={(v) => set('logoColor', v)}
                  />
                  <ToggleRow
                    label="Logo gradient"
                    checked={style.logoUseGradient}
                    onChange={(v) => set('logoUseGradient', v)}
                  />
                  {style.logoUseGradient && (
                    <>
                      <ColorField
                        label="Gradient end"
                        value={style.logoGradientEndColor}
                        onChange={(v) => set('logoGradientEndColor', v)}
                      />
                      <label>
                        Type
                        <select
                          value={style.logoGradientType}
                          onChange={(e) =>
                            set(
                              'logoGradientType',
                              e.target.value as GradientType,
                            )
                          }
                        >
                          <option value="linear">Linear</option>
                          <option value="radial">Radial</option>
                        </select>
                      </label>
                      {style.logoGradientType === 'linear' && (
                        <SliderField
                          label="Angle"
                          value={style.logoGradientAngle}
                          min={0}
                          max={360}
                          onChange={(v) => set('logoGradientAngle', v)}
                          suffix="deg"
                        />
                      )}
                    </>
                  )}
                </div>
              )}
              {style.logoIndependent && !isSvgLogo && (
                <div className={styles.indented}>
                  <SliderField
                    label="Hue shift"
                    value={style.logoHueShift}
                    min={0}
                    max={360}
                    onChange={(v) => set('logoHueShift', v)}
                    suffix="deg"
                  />
                </div>
              )}

              <div className={styles.stopsBlock}>
                <p className={styles.subHeading}>During animation</p>
                <ToggleRow
                  label="Let QR animation color the logo"
                  checked={style.logoColorOver}
                  onChange={(v) => set('logoColorOver', v)}
                />
                {!style.logoColorOver && (
                  <div className={styles.indented}>
                    <label className={styles.curveRow}>
                      <span className={styles.sliderLabel}>Logo motion</span>
                      <select
                        value={style.logoAnimationType}
                        onChange={(e) =>
                          set(
                            'logoAnimationType',
                            e.target.value as LogoAnimationType,
                          )
                        }
                      >
                        {LOGO_ANIMATION_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {style.logoAnimationType !== 'none' && (
                      <SliderField
                        label="Logo motion speed"
                        value={style.logoAnimationSpeed}
                        min={0}
                        max={600}
                        onChange={(v) => set('logoAnimationSpeed', v)}
                        hint={
                          style.logoAnimationSpeed === 0 ? 'Paused' : undefined
                        }
                      />
                    )}
                    <p className={styles.fieldHint}>
                      The logo keeps its own colors and animates separately from
                      the QR. Visible while an animation (QR or logo) is active.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'animate' && (
        <div className={styles.panel}>
          <div>
            <p className={styles.subHeading}>Type</p>
            <div className={styles.grid4}>
              {ANIMATION_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.optionTile} ${style.animationType === t.id ? styles.optionTileActive : ''}`}
                  onClick={() => {
                    const stopPreset = getAnimationStopPreset(
                      t.id,
                      style.dotColor,
                    );
                    const dirPreset = getAnimationDirectionPreset(t.id);
                    const timingPreset = getAnimationTimingPreset(t.id);
                    onChange({
                      ...style,
                      animationType: t.id,
                      animationStops: stopPreset ?? style.animationStops,
                      animationDirection: dirPreset,
                      animationTimingFunction: timingPreset,
                      activePreset: null,
                    });
                  }}
                >
                  <span className={styles.optionLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          {style.animationType !== 'none' && (
            <>
              <SliderField
                label="Speed"
                value={style.animationSpeed}
                min={0}
                max={600}
                onChange={(v) => set('animationSpeed', v)}
                hint={style.animationSpeed === 0 ? 'Static pattern' : undefined}
              />
              <div className={styles.directionRow}>
                <span className={styles.sliderLabel}>Direction</span>
                <div className={styles.pillRow}>
                  {DIRECTIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`${styles.pill} ${style.animationDirection === d.id ? styles.pillActive : ''}`}
                      onClick={() => set('animationDirection', d.id)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className={styles.curveRow}>
                <span className={styles.sliderLabel}>Curve</span>
                <select
                  value={style.animationTimingFunction}
                  onChange={(e) =>
                    set(
                      'animationTimingFunction',
                      e.target.value as AnimationTimingFunction,
                    )
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="ease">Ease</option>
                  <option value="ease-in">Ease in</option>
                  <option value="ease-out">Ease out</option>
                  <option value="ease-in-out">Ease in-out</option>
                </select>
              </label>
              {(() => {
                const warn = checkLoopSeamless(
                  style.animationType,
                  style.animationStops,
                );
                return warn ? (
                  <div className="alert alert-warning">{warn}</div>
                ) : null;
              })()}
              <div className={styles.stopsBlock}>
                <div className={styles.stopsHeader}>
                  <p className={styles.subHeading}>Stops</p>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => {
                      const stops = [
                        ...style.animationStops,
                        {
                          color: '#ffffff',
                          colorEnd: '#ffffff',
                          position: 50,
                          positionEnd: 50,
                        },
                      ];
                      onChange({ ...style, animationStops: stops });
                    }}
                  >
                    + Add
                  </button>
                </div>
                <div className={styles.panel}>
                  {style.animationStops.map((stop, i) => (
                    <div key={i} className={styles.stop}>
                      <div className={styles.stopHeadRow}>
                        <span className={styles.stopIndex}>{i + 1}</span>
                        <div className={styles.stopColors}>
                          <div className={styles.stopColorCell}>
                            <input
                              type="color"
                              className={styles.stopColorSwatch}
                              value={stop.color}
                              onChange={(e) =>
                                updateStop(i, { color: e.target.value })
                              }
                            />
                            <span className={styles.stopColorLabel}>Start</span>
                          </div>
                          <div className={styles.stopColorCell}>
                            <input
                              type="color"
                              className={styles.stopColorSwatch}
                              value={stop.colorEnd}
                              onChange={(e) =>
                                updateStop(i, { colorEnd: e.target.value })
                              }
                            />
                            <span className={styles.stopColorLabel}>End</span>
                          </div>
                        </div>
                        {style.animationStops.length > 3 && (
                          <button
                            type="button"
                            className={styles.stopRemove}
                            onClick={() => {
                              const stops = style.animationStops.filter(
                                (_, j) => j !== i,
                              );
                              onChange({ ...style, animationStops: stops });
                            }}
                            aria-label="Remove stop"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <div className={styles.stopPosGrid}>
                        <div className={styles.stopPosCell}>
                          <div className={styles.stopPosHead}>
                            <span className={styles.stopPosLabel}>
                              Pos start
                            </span>
                            <input
                              type="number"
                              className={styles.stopPosInput}
                              min={0}
                              max={100}
                              value={stop.position}
                              onChange={(e) =>
                                updateStop(i, {
                                  position: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <input
                            type="range"
                            className={styles.range}
                            min={0}
                            max={100}
                            value={stop.position}
                            onChange={(e) =>
                              updateStop(i, {
                                position: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className={styles.stopPosCell}>
                          <div className={styles.stopPosHead}>
                            <span className={styles.stopPosLabel}>Pos end</span>
                            <input
                              type="number"
                              className={styles.stopPosInput}
                              min={0}
                              max={100}
                              value={stop.positionEnd}
                              onChange={(e) =>
                                updateStop(i, {
                                  positionEnd: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <input
                            type="range"
                            className={styles.range}
                            min={0}
                            max={100}
                            value={stop.positionEnd}
                            onChange={(e) =>
                              updateStop(i, {
                                positionEnd: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'advanced' && (
        <div className={styles.panel}>
          <label>
            Error correction
            <select
              value={style.ecLevel}
              onChange={(e) =>
                set('ecLevel', e.target.value as ErrorCorrectionLevel)
              }
            >
              <option value="L">L — 7% recovery</option>
              <option value="M">M — 15% recovery</option>
              <option value="Q">Q — 25% recovery</option>
              <option value="H">H — 30% recovery (best for logos)</option>
            </select>
          </label>
          <SliderField
            label="Quiet zone"
            value={style.quietZone}
            min={0}
            max={4}
            onChange={(v) => set('quietZone', v)}
            suffix=" modules"
          />
          <SliderField
            label="Canvas size"
            value={style.qrSize}
            min={260}
            max={1000}
            step={20}
            onChange={(v) => set('qrSize', v)}
            suffix="px"
          />
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Saves — localStorage-backed, drag-to-reorder via pointer events + FLIP,
// star-pin a primary, animated previews opt-in. No server calls.
// =========================================================================

interface SaveEntry {
  id: string;
  name: string;
  styleData: StyleData;
  customLogo: string | null;
}

const SAVES_KEY = 'qr-saves';
const PRIMARY_KEY = 'qr-saves-primary';

function loadSavesFromStorage(): SaveEntry[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    // Migration: older saves may lack an id; mint one so DnD + view
    // transitions have a stable key. We don't migrate the data shape (we
    // tolerate older `style` field by mapping it into `styleData` below).
    return arr.map((s, i) => {
      const raw = s as Record<string, unknown>;
      return {
        id: typeof raw.id === 'string' ? raw.id : `legacy-${i}-${Date.now()}`,
        name: typeof raw.name === 'string' ? raw.name : `Save ${i + 1}`,
        styleData: (raw.styleData ?? raw.style ?? {}) as StyleData,
        customLogo: (raw.customLogo as string | null | undefined) ?? null,
      };
    });
  } catch {
    return [];
  }
}

function persistSaves(saves: SaveEntry[]) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
}

function loadPrimaryFromStorage(): string | null {
  return localStorage.getItem(PRIMARY_KEY);
}

function persistPrimary(id: string | null) {
  if (id) localStorage.setItem(PRIMARY_KEY, id);
  else localStorage.removeItem(PRIMARY_KEY);
}

// Pointer-event drag threshold (squared, in CSS px) before a pointerdown
// becomes a drag rather than a tap. Below this the gesture is a click
// and load fires. Comparing squared distance avoids sqrt per move.
const DRAG_START_DISTANCE_SQ = 25; // 5px
const TOUCH_HOLD_MS = 250;

interface DragState {
  id: string;
  startX: number;
  startY: number;
  started: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  isTouch: boolean;
  grabOffsetX: number;
  grabOffsetY: number;
  ghostDataUrl: string | null;
  ghostWidth: number;
  ghostHeight: number;
}

interface Ghost {
  id: string;
  dataUrl: string | null;
  cursorX: number;
  cursorY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
}

// Wrap a mutation in document.startViewTransition when available so the
// browser FLIPs each view-transition-named tile from its old position to
// its new one. Falls back to a plain call on unsupported browsers.
function withViewTransition(fn: () => void) {
  type ViewTransitionDocument = Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const d = document as ViewTransitionDocument;
  if (typeof d.startViewTransition === 'function') d.startViewTransition(fn);
  else fn();
}

function StyleSaves({
  style,
  customLogo,
  qrData,
  onLoad,
}: {
  style: StyleData;
  customLogo: string | null;
  qrData: string;
  onLoad: (style: StyleData, logo?: string | null) => void;
}) {
  const [saves, setSaves] = useState<SaveEntry[]>(() => loadSavesFromStorage());
  const [primaryId, setPrimaryId] = useState<string | null>(() =>
    loadPrimaryFromStorage(),
  );
  const [saveName, setSaveName] = useState('');
  const [animatePreviews, setAnimatePreviews] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const tileElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  function save() {
    if (!saveName.trim()) return;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: SaveEntry = {
      id,
      name: saveName.trim(),
      styleData: style,
      customLogo,
    };
    const updated = [...saves, entry];
    setSaves(updated);
    persistSaves(updated);
    setSaveName('');
  }

  function overwrite(id: string) {
    const updated = saves.map((s) =>
      s.id === id ? { ...s, styleData: style, customLogo } : s,
    );
    setSaves(updated);
    persistSaves(updated);
  }

  function remove(id: string) {
    withViewTransition(() => {
      const updated = saves.filter((s) => s.id !== id);
      setSaves(updated);
      persistSaves(updated);
      if (primaryId === id) {
        setPrimaryId(null);
        persistPrimary(null);
      }
    });
  }

  function togglePrimary(id: string) {
    const next = primaryId === id ? null : id;
    setPrimaryId(next);
    persistPrimary(next);
  }

  function commitReorder(order: string[]) {
    const byId = new Map(saves.map((s) => [s.id, s]));
    const next = order.map((id) => byId.get(id)!).filter(Boolean);
    withViewTransition(() => {
      setSaves(next);
      persistSaves(next);
    });
  }

  // Compute where the dragged tile should land based on which other tile
  // the cursor is currently over (or nearest to, if in a gap). Returns a
  // new order array with `id` spliced into the target index.
  function computeDropOrder(
    id: string,
    clientX: number,
    clientY: number,
  ): string[] | null {
    const tiles = tileElsRef.current;
    if (tiles.size === 0) return null;
    let bestId: string | null = null;
    let bestDistSq = Infinity;
    for (const [tileId, el] of tiles) {
      if (tileId === id) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestId = tileId;
      }
    }
    if (!bestId) return null;
    const baseOrder = saves.map((s) => s.id);
    const targetEl = tiles.get(bestId)!;
    const targetRect = targetEl.getBoundingClientRect();
    const insertAfter = clientX > targetRect.left + targetRect.width / 2;
    const baseIdx = baseOrder.indexOf(bestId);
    const filtered = baseOrder.filter((x) => x !== id);
    const insertAt = Math.min(
      filtered.length,
      Math.max(0, baseIdx + (insertAfter ? 1 : 0)),
    );
    filtered.splice(insertAt, 0, id);
    return filtered;
  }

  function makeDragHandlers(id: string, onLoadIfTap: () => void) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const isTouch = e.pointerType === 'touch';
        const startX = e.clientX;
        const startY = e.clientY;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);

        const tileRect = target.getBoundingClientRect();
        let dataUrl: string | null = null;
        try {
          const canvas = target.querySelector(
            'canvas',
          ) as HTMLCanvasElement | null;
          if (canvas && canvas.width > 0) dataUrl = canvas.toDataURL();
        } catch {
          /* tainted canvas: ghost falls back to a plain box */
        }

        const state: DragState = {
          id,
          startX,
          startY,
          started: false,
          holdTimer: null,
          isTouch,
          grabOffsetX: startX - tileRect.left,
          grabOffsetY: startY - tileRect.top,
          ghostDataUrl: dataUrl,
          ghostWidth: tileRect.width,
          ghostHeight: tileRect.height,
        };

        const start = () => {
          if (!dragRef.current || dragRef.current.id !== id) return;
          dragRef.current.started = true;
          setDragId(id);
          setGhost({
            id,
            dataUrl: state.ghostDataUrl,
            cursorX: startX,
            cursorY: startY,
            grabOffsetX: state.grabOffsetX,
            grabOffsetY: state.grabOffsetY,
            width: state.ghostWidth,
            height: state.ghostHeight,
          });
        };

        if (isTouch) {
          state.holdTimer = setTimeout(start, TOUCH_HOLD_MS);
        }
        dragRef.current = state;

        const onMove = (ev: PointerEvent) => {
          const s = dragRef.current;
          if (!s || s.id !== id) return;
          const dx = ev.clientX - s.startX;
          const dy = ev.clientY - s.startY;
          if (!s.started) {
            if (s.isTouch) {
              if (dx * dx + dy * dy > DRAG_START_DISTANCE_SQ) {
                // Movement before the hold timer fires = scroll intent.
                if (s.holdTimer) clearTimeout(s.holdTimer);
                cleanup();
                return;
              }
              return;
            }
            if (dx * dx + dy * dy > DRAG_START_DISTANCE_SQ) start();
            else return;
          }
          setGhost((prev) =>
            prev ? { ...prev, cursorX: ev.clientX, cursorY: ev.clientY } : prev,
          );
        };

        const onUp = (ev: PointerEvent) => {
          const s = dragRef.current;
          if (!s || s.id !== id) {
            cleanup();
            return;
          }
          if (s.started) {
            const finalOrder = computeDropOrder(id, ev.clientX, ev.clientY);
            if (
              finalOrder &&
              finalOrder.join(',') !== saves.map((x) => x.id).join(',')
            ) {
              commitReorder(finalOrder);
            }
          } else {
            onLoadIfTap();
          }
          cleanup();
        };

        const cleanup = () => {
          if (state.holdTimer) clearTimeout(state.holdTimer);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          try {
            target.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
          dragRef.current = null;
          setDragId(null);
          setGhost(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      },
    };
  }

  return (
    <div className={styles.panel}>
      <div className={styles.savesHeader}>
        <input
          placeholder="Save name…"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          maxLength={50}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!saveName.trim()}
        >
          Save
        </button>
      </div>

      {saves.length > 0 && (
        <ToggleRow
          label="Animate previews"
          checked={animatePreviews}
          onChange={setAnimatePreviews}
        />
      )}

      {saves.length === 0 && (
        <p className={styles.emptyState}>No saved styles yet</p>
      )}

      <div className={styles.savesGrid}>
        {saves.map((s) => (
          <SaveTile
            key={s.id}
            save={s}
            qrData={qrData}
            animate={animatePreviews}
            isPrimary={primaryId === s.id}
            isDragging={dragId === s.id}
            dragHandlers={makeDragHandlers(s.id, () =>
              onLoad(s.styleData, s.customLogo),
            )}
            tileRef={(el) => {
              if (el) tileElsRef.current.set(s.id, el);
              else tileElsRef.current.delete(s.id);
            }}
            onLoad={() => onLoad(s.styleData, s.customLogo)}
            onOverwrite={() => overwrite(s.id)}
            onDelete={() => remove(s.id)}
            onTogglePrimary={() => togglePrimary(s.id)}
          />
        ))}
      </div>

      {ghost && <GhostTile ghost={ghost} />}
    </div>
  );
}

const FALLBACK_QR_DATA = 'https://example.com';

function SaveTile({
  save,
  qrData,
  animate,
  isPrimary,
  isDragging,
  dragHandlers,
  tileRef,
  onOverwrite,
  onDelete,
  onTogglePrimary,
}: {
  save: SaveEntry;
  qrData: string;
  animate: boolean;
  isPrimary: boolean;
  isDragging: boolean;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  tileRef: (el: HTMLDivElement | null) => void;
  onLoad: () => void;
  onOverwrite: () => void;
  onDelete: () => void;
  onTogglePrimary: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<AnimationLayers>(NO_LAYERS);

  useEffect(() => {
    const dataString = qrData || FALLBACK_QR_DATA;
    let cancelled = false;
    (async () => {
      const savedStyle = { ...DEFAULT_STYLE, ...save.styleData } as StyleData;
      const tileSize = 250;

      let logoImg: HTMLImageElement | null = null;
      let logoSvgMarkup: string | null = null;
      if (save.customLogo) {
        try {
          if (
            save.customLogo.endsWith('.svg') ||
            save.customLogo.startsWith('data:image/svg')
          ) {
            logoSvgMarkup = save.customLogo.startsWith('data:image/svg')
              ? atob(save.customLogo.split(',')[1] ?? '')
              : await (await fetch(save.customLogo)).text();
          } else {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((r) => {
              img.onload = () => r();
              img.src = save.customLogo!;
            });
            logoImg = img;
          }
        } catch {
          /* logo unavailable — render without */
        }
      }
      if (cancelled) return;

      let dodgeMask: Float32Array | null = null;
      if (logoImg || logoSvgMarkup) {
        const matrix = generateQrMatrix(dataString, savedStyle.ecLevel);
        if (matrix) {
          dodgeMask = await computeDodgeMask({
            logoImg,
            logoSvgMarkup,
            modCount: matrix.modCount,
            canvasSize: tileSize,
            quietZone: savedStyle.quietZone,
            logoSize: savedStyle.logoSize,
            aggressiveness: savedStyle.dodgeAggressiveness,
            softness: savedStyle.dodgeSoftness,
            coverageThreshold: savedStyle.dodgeCoverageThreshold,
          });
        }
      }
      if (cancelled) return;

      const renderOpts = {
        data: dataString,
        style: { ...savedStyle, qrSize: tileSize },
        logoImg,
        logoSvgMarkup,
        dodgeMask,
        logoColorSync: !savedStyle.logoIndependent,
      };

      const canvas = canvasRef.current;
      if (canvas) await renderQrToCanvas({ canvas, ...renderOpts });
      if (cancelled) return;

      const colorAnim =
        savedStyle.animationType !== 'none' &&
        savedStyle.animationStops?.length >= 3;
      const redrawLogo = !!save.customLogo && !savedStyle.logoColorOver;
      const logoMotion = redrawLogo && savedStyle.logoAnimationType !== 'none';

      if (!colorAnim && !logoMotion) {
        if (!cancelled) setLayers(NO_LAYERS);
        return;
      }

      let colorMaskUrl: string | null = null;
      let baseImageUrl: string | null = null;
      let logoLayerUrl: string | null = null;

      if (colorAnim) {
        const maskCanvas = document.createElement('canvas');
        await renderQrToCanvas({
          canvas: maskCanvas,
          ...renderOpts,
          style: {
            ...savedStyle,
            qrSize: tileSize,
            dotColor: '#000000',
            cornerColor: '#000000',
            useGradient: false,
            transparentBg: true,
          },
          skipLogo: redrawLogo,
        });
        colorMaskUrl = maskCanvas.toDataURL();
      } else {
        const baseCanvas = document.createElement('canvas');
        await renderQrToCanvas({
          canvas: baseCanvas,
          ...renderOpts,
          skipLogo: true,
        });
        baseImageUrl = baseCanvas.toDataURL();
      }

      if (redrawLogo) {
        const layer = await renderLogoLayer({
          canvasSize: tileSize,
          style: { ...savedStyle, qrSize: tileSize },
          logoImg,
          logoSvgMarkup,
          logoColorSync: !savedStyle.logoIndependent,
        });
        logoLayerUrl = layer ? layer.toDataURL() : null;
      }

      if (!cancelled) setLayers({ colorMaskUrl, baseImageUrl, logoLayerUrl });
    })();
    return () => {
      cancelled = true;
    };
  }, [save.styleData, save.customLogo, qrData]);

  const savedStyle = { ...DEFAULT_STYLE, ...save.styleData } as StyleData;
  const isAnimated = !!(layers.colorMaskUrl || layers.baseImageUrl);
  const tileAnimStyle = animate
    ? savedStyle
    : { ...savedStyle, animationSpeed: 0, logoAnimationSpeed: 0 };
  const lightBg = savedStyle.previewBg === 'light';

  return (
    <div
      ref={tileRef}
      role="button"
      tabIndex={0}
      aria-label={`Load "${save.name}"`}
      title={`Load "${save.name}"`}
      style={{ viewTransitionName: `qr-save-${save.id}`, touchAction: 'none' }}
      className={`${styles.saveTile} ${isPrimary ? styles.saveTilePrimary : ''} ${isDragging ? styles.saveTileDragging : ''}`}
      {...dragHandlers}
    >
      <div
        className={`${styles.saveTileCanvasWrap} ${lightBg ? styles.saveTileCanvasWrapLight : styles.saveTileCanvasWrapDark}`}
        style={{ aspectRatio: '1 / 1' }}
      >
        {isAnimated && (
          <QrAnimatedPreview
            layers={layers}
            style={tileAnimStyle as StyleData}
            size={250}
          />
        )}
        <canvas
          ref={canvasRef}
          className={styles.saveTileCanvas}
          style={{ display: isAnimated ? 'none' : undefined }}
        />
      </div>
      <div className={styles.saveTileName}>{save.name}</div>
      <div className={`${styles.saveTileControls} ${styles.saveTileLeft}`}>
        <button
          type="button"
          className={`${styles.saveTileBtn} ${isPrimary ? styles.saveTileBtnPrimary : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePrimary();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={isPrimary ? 'Unset as primary' : 'Set as primary'}
          aria-label={isPrimary ? 'Unset as primary' : 'Set as primary'}
          aria-pressed={isPrimary}
        >
          <Star size={12} fill={isPrimary ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className={`${styles.saveTileControls} ${styles.saveTileRight}`}>
        <button
          type="button"
          className={styles.saveTileBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOverwrite();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Overwrite with current"
          aria-label="Overwrite with current"
        >
          <SaveIcon size={12} />
        </button>
        <button
          type="button"
          className={`${styles.saveTileBtn} ${styles.saveTileBtnDestructive}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Delete"
          aria-label="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function GhostTile({ ghost }: { ghost: Ghost }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: ghost.width,
        height: ghost.height,
        transform: `translate(${ghost.cursorX - ghost.grabOffsetX}px, ${ghost.cursorY - ghost.grabOffsetY}px) rotate(3deg) scale(0.92)`,
        transformOrigin: `${ghost.grabOffsetX}px ${ghost.grabOffsetY}px`,
        opacity: 0.85,
        pointerEvents: 'none',
        zIndex: 50,
        transition: 'none',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      {ghost.dataUrl ? (
        <img
          src={ghost.dataUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <div
          style={{ width: '100%', height: '100%', background: 'var(--muted)' }}
        />
      )}
    </div>
  );
}

// =========================================================================
// Reusable field primitives
// =========================================================================

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className={styles.colorField}>
      <span>{label}</span>
      <div className={styles.colorRow}>
        <input
          type="color"
          className={styles.colorSwatch}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className={styles.colorText}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
        />
      </div>
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  hint,
  step = 1,
  precision = 0,
  inputBox = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
  step?: number;
  precision?: number;
  inputBox?: boolean;
}) {
  const format = (n: number) =>
    precision > 0 ? n.toFixed(precision).replace(/\.?0+$/, '') : String(n);
  // Displayed text is derived from `value` on every render unless the
  // user is actively editing the input — then we hold their in-progress
  // string in `localText` and clear it back to null on blur. Lets the
  // parent's value-prop changes flow through without the
  // setState-in-effect anti-pattern, and avoids fighting the input
  // while the user is typing.
  const [localText, setLocalText] = useState<string | null>(null);
  const text = localText ?? format(value);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setLocalText(null);
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    const mult = Math.pow(10, Math.max(0, precision));
    const rounded = Math.round(clamped * mult) / mult;
    onChange(rounded);
    setLocalText(null);
  };

  return (
    <label className={styles.slider}>
      <div className={styles.sliderHead}>
        <span className={styles.sliderLabel}>{label}</span>
        {inputBox ? (
          <span className={styles.sliderValueGroup}>
            <input
              type="number"
              className={styles.sliderValueBox}
              min={min}
              max={max}
              step={step}
              value={text}
              onFocus={() => setLocalText(format(value))}
              onChange={(e) => setLocalText(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            {suffix && <span className={styles.sliderValue}>{suffix}</span>}
          </span>
        ) : (
          <span className={styles.sliderValue}>
            {format(value)}
            {suffix}
          </span>
        )}
      </div>
      <input
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}
