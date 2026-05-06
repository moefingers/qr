import { useState, useRef, useEffect } from 'react';
import type {
  StyleData,
  DotShape,
  CornerShape,
  GradientType,
  ErrorCorrectionLevel,
  AnimationType,
  AnimationDirection,
  AnimationStop,
} from './qr-types';
import { DEFAULT_STYLE } from './qr-types';
import { QR_PRESETS } from './qr-presets';
import { QrAnimatedPreview } from './qr-animated-preview';
import { renderQrToCanvas, generateQrMatrix } from './qr-canvas-renderer';
import { computeDodgeMask } from './qr-dot-dodge';

function getAnimationStopPreset(type: AnimationType, dotColor: string): AnimationStop[] | null {
  const accent = '#5eead4';
  switch (type) {
    case 'breathe':
      return [
        { color: dotColor, colorEnd: dotColor, position: 10, positionEnd: 20 },
        { color: accent, colorEnd: accent, position: 20, positionEnd: 15 },
        { color: dotColor, colorEnd: dotColor, position: 30, positionEnd: 10 },
      ];
    case 'radialLoop':
      return [
        { color: dotColor, colorEnd: dotColor, position: 10, positionEnd: 20 },
        { color: accent, colorEnd: accent, position: 12, positionEnd: 22 },
        { color: dotColor, colorEnd: dotColor, position: 20, positionEnd: 30 },
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
}

type Tab = 'presets' | 'saves' | 'colors' | 'dots' | 'logo' | 'animate' | 'advanced';

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

export function QrStyleControls({
  style,
  onChange,
  customLogo,
  onLogoChange,
  isSvgLogo,
}: Props) {
  const [tab, setTab] = useState<Tab>('presets');

  function set<K extends keyof StyleData>(key: K, value: StyleData[K]) {
    onChange({ ...style, [key]: value, activePreset: null });
  }

  function updateStop(i: number, patch: Partial<StyleData['animationStops'][number]>) {
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
    <div>
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors relative ${tab === t.id ? 'text-accent' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t" />
            )}
          </button>
        ))}
      </div>

      {tab === 'presets' && (
        <div className="grid grid-cols-4 gap-2">
          {QR_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`p-2 rounded-lg border-2 transition-all text-center ${style.activePreset === p.id ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
              onClick={() => applyPreset(p.id)}
            >
              <div
                className="w-6 h-6 rounded-full mx-auto mb-1 border border-gray-200 dark:border-gray-600"
                style={{ background: p.preview.dot }}
              />
              <span className="text-[10px] text-gray-600 dark:text-gray-400">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'saves' && (
        <StyleSaves
          style={style}
          customLogo={customLogo}
          onLoad={(s, logo) => {
            onChange({ ...s, activePreset: null });
            if (logo !== undefined) onLogoChange(logo);
          }}
        />
      )}

      {tab === 'colors' && (
        <div className="space-y-4">
          <ColorField
            label="Dot Color"
            value={style.dotColor}
            onChange={(v) => set('dotColor', v)}
          />
          <ColorField
            label="Background"
            value={style.bgColor}
            onChange={(v) => set('bgColor', v)}
          />
          <ColorField
            label="Corner Color"
            value={style.cornerColor || style.dotColor}
            onChange={(v) => set('cornerColor', v)}
            hint="Leave empty to match dot color"
          />

          <ToggleRow
            label="Transparent Background"
            checked={style.transparentBg}
            onChange={(v) => set('transparentBg', v)}
          />
          <ToggleRow
            label="Gradient"
            checked={style.useGradient}
            onChange={(v) => set('useGradient', v)}
          />

          {style.useGradient && (
            <div className="pl-3 border-l-2 border-accent/30 space-y-3">
              <ColorField
                label="Gradient End"
                value={style.gradientEndColor}
                onChange={(v) => set('gradientEndColor', v)}
              />
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</span>
                <select
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm"
                  value={style.gradientType}
                  onChange={(e) => set('gradientType', e.target.value as GradientType)}
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
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Dot Shape</p>
            <div className="grid grid-cols-3 gap-2">
              {DOT_SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`p-2 rounded-lg border-2 text-center transition-all ${style.dotShape === s.id ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                  onClick={() => set('dotShape', s.id)}
                >
                  <span className="text-lg block">{s.icon}</span>
                  <span className="text-[10px]">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <SliderField
            label="Shape Scale"
            value={style.shapeScale}
            min={60}
            max={160}
            onChange={(v) => set('shapeScale', v)}
            suffix="%"
          />

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Corner Outer
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CORNER_SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`p-2 rounded-lg border-2 text-center transition-all text-xs ${style.cornerOuterShape === s.id ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                  onClick={() => set('cornerOuterShape', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Corner Inner
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CORNER_SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`p-2 rounded-lg border-2 text-center transition-all text-xs ${style.cornerInnerShape === s.id ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                  onClick={() => set('cornerInnerShape', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'logo' && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Custom Logo
            </p>
            <label className="flex items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-accent/50 transition-colors">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {customLogo && !customLogo.startsWith('/')
                  ? 'Logo uploaded - click to change'
                  : 'Click to upload (SVG, PNG, JPG)'}
              </span>
              <input
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp"
                className="hidden"
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
              <button
                className="mt-2 text-xs text-red-500 hover:text-red-600 transition-colors"
                onClick={() => onLogoChange(null)}
              >
                Remove logo
              </button>
            )}
          </div>

          {customLogo && (
            <>
              <SliderField
                label="Logo Size"
                value={Math.round(style.logoSize * 100)}
                min={15}
                max={40}
                onChange={(v) => set('logoSize', v / 100)}
                suffix="%"
              />
              <SliderField
                label="Logo Margin"
                value={style.logoMargin}
                min={0}
                max={14}
                onChange={(v) => set('logoMargin', v)}
                suffix="px"
              />
              <SliderField
                label="Dodge Aggressiveness"
                value={style.dodgeAggressiveness}
                min={0}
                max={100}
                onChange={(v) => set('dodgeAggressiveness', v)}
                hint="0 = tight fit, 100 = generous padding"
              />
              <ToggleRow
                label="Independent styling"
                checked={style.logoIndependent}
                onChange={(v) => set('logoIndependent', v)}
              />
              {style.logoIndependent && isSvgLogo && (
                <div className="pl-3 border-l-2 border-accent/30 space-y-3">
                  <ColorField
                    label="Logo Color"
                    value={style.logoColor}
                    onChange={(v) => set('logoColor', v)}
                  />
                  <ToggleRow
                    label="Logo Gradient"
                    checked={style.logoUseGradient}
                    onChange={(v) => set('logoUseGradient', v)}
                  />
                  {style.logoUseGradient && (
                    <>
                      <ColorField
                        label="Gradient End"
                        value={style.logoGradientEndColor}
                        onChange={(v) => set('logoGradientEndColor', v)}
                      />
                      <label className="block">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                          Type
                        </span>
                        <select
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm"
                          value={style.logoGradientType}
                          onChange={(e) => set('logoGradientType', e.target.value as GradientType)}
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
                <div className="pl-3 border-l-2 border-accent/30 space-y-3">
                  <SliderField
                    label="Hue Shift"
                    value={style.logoHueShift}
                    min={0}
                    max={360}
                    onChange={(v) => set('logoHueShift', v)}
                    suffix="deg"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'animate' && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Type</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'none', label: 'Off' },
                  { id: 'sweep', label: 'Sweep' },
                  { id: 'pulse', label: 'Pulse' },
                  { id: 'wave', label: 'Wave' },
                  { id: 'radialLoop', label: 'Radial Loop' },
                  { id: 'breathe', label: 'Breathe' },
                  { id: 'spiral', label: 'Spiral' },
                  { id: 'colorCycle', label: 'Color Cycle' },
                ] as { id: AnimationType; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  className={`p-2 rounded-lg border-2 text-center transition-all text-xs ${style.animationType === t.id ? 'border-accent bg-accent/5 text-accent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                  onClick={() => {
                    const preset = getAnimationStopPreset(t.id, style.dotColor);
                    if (preset) {
                      onChange({
                        ...style,
                        animationType: t.id,
                        animationStops: preset,
                        activePreset: null,
                      });
                    } else {
                      set('animationType', t.id);
                    }
                  }}
                >
                  {t.label}
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Direction</span>
                <div className="flex gap-1">
                  {(['cw', 'ccw'] as AnimationDirection[]).map((d) => (
                    <button
                      key={d}
                      className={`px-3 py-1 rounded-md text-xs transition-all ${style.animationDirection === d ? 'bg-accent text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                      onClick={() => set('animationDirection', d)}
                    >
                      {d === 'cw' ? 'Forward' : 'Reverse'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Stops</p>
                  <button
                    className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    onClick={() => {
                      const stops = [
                        ...style.animationStops,
                        { color: '#ffffff', colorEnd: '#ffffff', position: 50, positionEnd: 50 },
                      ];
                      onChange({ ...style, animationStops: stops });
                    }}
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-3">
                  {style.animationStops.map((stop, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-4">{i + 1}</span>
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1">
                            <div className="shrink-0">
                              <input
                                type="color"
                                className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer appearance-none bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
                                value={stop.color}
                                onChange={(e) => updateStop(i, { color: e.target.value })}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">Start</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="shrink-0">
                              <input
                                type="color"
                                className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer appearance-none bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
                                value={stop.colorEnd}
                                onChange={(e) => updateStop(i, { colorEnd: e.target.value })}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">End</span>
                          </div>
                        </div>
                        {style.animationStops.length > 3 && (
                          <button
                            className="text-[10px] text-red-400 hover:text-red-500"
                            onClick={() => {
                              const stops = style.animationStops.filter((_, j) => j !== i);
                              onChange({ ...style, animationStops: stops });
                            }}
                          >
                            X
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">Pos start</span>
                            <input
                              type="number"
                              className="w-12 text-[10px] text-right bg-transparent border-b border-gray-600 outline-none font-mono"
                              min={0}
                              max={100}
                              value={stop.position}
                              onChange={(e) => updateStop(i, { position: Number(e.target.value) })}
                            />
                          </div>
                          <input
                            type="range"
                            className="w-full accent-accent"
                            min={0}
                            max={100}
                            value={stop.position}
                            onChange={(e) => {
                              const stops = [...style.animationStops];
                              stops[i] = { ...stop, position: Number(e.target.value) };
                              onChange({ ...style, animationStops: stops });
                            }}
                          />
                        </label>
                        <label className="block">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">Pos end</span>
                            <input
                              type="number"
                              className="w-12 text-[10px] text-right bg-transparent border-b border-gray-600 outline-none font-mono"
                              min={0}
                              max={100}
                              value={stop.positionEnd}
                              onChange={(e) =>
                                updateStop(i, { positionEnd: Number(e.target.value) })
                              }
                            />
                          </div>
                          <input
                            type="range"
                            className="w-full accent-accent"
                            min={0}
                            max={100}
                            value={stop.positionEnd}
                            onChange={(e) => {
                              const stops = [...style.animationStops];
                              stops[i] = { ...stop, positionEnd: Number(e.target.value) };
                              onChange({ ...style, animationStops: stops });
                            }}
                          />
                        </label>
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
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
              Error Correction
            </span>
            <select
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm"
              value={style.ecLevel}
              onChange={(e) => set('ecLevel', e.target.value as ErrorCorrectionLevel)}
            >
              <option value="L">L - 7% recovery</option>
              <option value="M">M - 15% recovery</option>
              <option value="Q">Q - 25% recovery</option>
              <option value="H">H - 30% recovery (best for logos)</option>
            </select>
          </label>
          <SliderField
            label="Quiet Zone"
            value={style.quietZone}
            min={0}
            max={4}
            onChange={(v) => set('quietZone', v)}
            suffix=" modules"
          />
          <SliderField
            label="Canvas Size"
            value={style.qrSize}
            min={260}
            max={1000}
            onChange={(v) => set('qrSize', v)}
            suffix="px"
            step={20}
          />
        </div>
      )}
    </div>
  );
}

const PLACEHOLDER_VCARD = 'BEGIN:VCARD\nVERSION:3.0\nFN:Preview\nEND:VCARD';

interface SaveEntry {
  name: string;
  style: StyleData;
  customLogo: string | null;
}

const SAVES_KEY = 'qr-saves';

function loadSavesFromStorage(): SaveEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistSaves(saves: SaveEntry[]) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
}

function SaveTile({
  save,
  animate,
  onLoad,
  onOverwrite,
  onDelete,
}: {
  save: SaveEntry;
  animate: boolean;
  onLoad: () => void;
  onOverwrite: () => void;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;

      const savedStyle = { ...DEFAULT_STYLE, ...save.style } as StyleData;
      const tileSize = 250;

      let logoImg: HTMLImageElement | null = null;
      let logoSvgMarkup: string | null = null;
      if (save.customLogo) {
        try {
          if (save.customLogo.endsWith('.svg') || save.customLogo.startsWith('data:image/svg')) {
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
          /* */
        }
      }
      if (cancelled) return;

      let dodgeMask: boolean[] | null = null;
      if (logoImg || logoSvgMarkup) {
        const matrix = generateQrMatrix(PLACEHOLDER_VCARD, savedStyle.ecLevel);
        if (matrix) {
          dodgeMask = await computeDodgeMask({
            logoImg,
            logoSvgMarkup,
            logoColorSync: !savedStyle.logoIndependent,
            dotColor: savedStyle.dotColor,
            modCount: matrix.modCount,
            canvasSize: tileSize,
            quietZone: savedStyle.quietZone,
            logoSize: savedStyle.logoSize,
            logoMargin: savedStyle.logoMargin,
            aggressiveness: savedStyle.dodgeAggressiveness,
          });
        }
      }

      const renderOpts = {
        data: PLACEHOLDER_VCARD,
        style: { ...savedStyle, qrSize: tileSize },
        logoImg,
        logoSvgMarkup,
        dodgeMask,
        logoColorSync: !savedStyle.logoIndependent,
      };

      // Render static QR to canvas
      const canvas = canvasRef.current;
      if (canvas) await renderQrToCanvas({ canvas, ...renderOpts });

      // Generate mask for animated saves
      if (savedStyle.animationType !== 'none' && savedStyle.animationStops?.length >= 3) {
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
        });
        setMaskUrl(maskCanvas.toDataURL());
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [save.style, save.customLogo, ready]);

  const savedStyle = save.style as StyleData;
  const isAnimated = savedStyle.animationType !== 'none' && !!maskUrl;
  const tileAnimStyle = animate ? savedStyle : { ...savedStyle, animationSpeed: 0 };

  return (
    <div className="group relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        className={`w-full relative overflow-hidden ${(save.style as StyleData).previewBg === 'light' ? 'bg-gray-100' : 'bg-gray-900'}`}
        onClick={onLoad}
        title={`Load "${save.name}"`}
      >
        {isAnimated && (
          <QrAnimatedPreview maskDataUrl={maskUrl} style={tileAnimStyle as StyleData} size={250} />
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ imageRendering: 'pixelated', display: isAnimated ? 'none' : undefined }}
        />
      </button>
      <div className="px-1.5 py-1 text-center">
        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate block">
          {save.name}
        </span>
      </div>
      <div className="absolute top-0.5 right-0.5 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
        <button
          className="p-1 rounded bg-black/60 text-white text-[9px]"
          onClick={onOverwrite}
          title="Overwrite with current"
        >
          Save
        </button>
        <button
          className="p-1 rounded bg-red-600/80 text-white text-[9px]"
          onClick={onDelete}
          title="Delete"
        >
          X
        </button>
      </div>
    </div>
  );
}

function StyleSaves({
  style,
  customLogo,
  onLoad,
}: {
  style: StyleData;
  customLogo: string | null;
  onLoad: (style: StyleData, logo?: string | null) => void;
}) {
  const [saves, setSaves] = useState<SaveEntry[]>(() => loadSavesFromStorage());
  const [loaded] = useState(true);
  const [saveName, setSaveName] = useState('');
  const [animatePreviews, setAnimatePreviews] = useState(false);

  function save() {
    if (!saveName.trim()) return;
    const newEntry: SaveEntry = { name: saveName.trim(), style, customLogo };
    const updated = [...saves, newEntry];
    setSaves(updated);
    persistSaves(updated);
    setSaveName('');
  }

  function overwrite(index: number) {
    const updated = saves.map((s, i) => (i === index ? { ...s, style, customLogo } : s));
    setSaves(updated);
    persistSaves(updated);
  }

  function remove(index: number) {
    const updated = saves.filter((_, i) => i !== index);
    setSaves(updated);
    persistSaves(updated);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Save name..."
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          maxLength={50}
        />
        <button
          className="px-3 py-2 rounded-lg bg-accent text-gray-900 text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
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

      {saves.length === 0 && loaded && (
        <p className="text-xs text-gray-400 text-center py-4">No saved styles yet</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {saves.map((s, i) => (
          <SaveTile
            key={`${s.name}-${i}`}
            save={s}
            animate={animatePreviews}
            onLoad={() => onLoad(s.style, s.customLogo)}
            onOverwrite={() => overwrite(i)}
            onDelete={() => remove(i)}
          />
        ))}
      </div>
    </div>
  );
}

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
    <label className="block">
      <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{label}</span>
      <div className="flex items-center gap-2">
        <div className="shrink-0">
          <input
            type="color"
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer appearance-none bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <input
          type="text"
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
        />
      </div>
      {hint && <span className="text-[10px] text-gray-400 mt-1 block">{hint}</span>}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-xs font-mono text-gray-600 dark:text-gray-300">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-[var(--color-accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="text-[10px] text-gray-400 mt-0.5 block">{hint}</span>}
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
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <button
        type="button"
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

