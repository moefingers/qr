import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, WifiOff, Star } from 'lucide-react';
import { useTheme } from '../../hooks/use-theme';

import type {
  StyleData,
  VCardData,
  WifiData,
  EmailData,
  SmsData,
  QrMode,
  AnimationLayers,
} from './qr-types';
import {
  DEFAULT_STYLE,
  DEFAULT_VCARD,
  DEFAULT_WIFI,
  DEFAULT_EMAIL,
  DEFAULT_SMS,
} from './qr-types';
import {
  buildVCard,
  buildUrl,
  buildText,
  buildWifi,
  buildEmail,
  buildSms,
} from './qr-data-builder';
import {
  renderQrToCanvas,
  generateQrMatrix,
  renderLogoLayer,
} from './qr-canvas-renderer';
import { computeDodgeMask } from './qr-dot-dodge';
import { QrAnimatedPreview } from './qr-animated-preview';
import { ThemeToggle } from '../ui/theme-toggle';
import styles from './qr-presenter.module.css';

const NO_LAYERS: AnimationLayers = {
  colorMaskUrl: null,
  baseImageUrl: null,
  logoLayerUrl: null,
};

interface SaveEntry {
  id: string;
  name: string;
  styleData: StyleData;
  customLogo: string | null;
}

interface LiveDraft {
  mode: QrMode;
  vcardData: VCardData;
  urlData: string;
  textData: string;
  wifiData: WifiData;
  emailData: EmailData;
  smsData: SmsData;
  styleData: StyleData;
  customLogo: string | null;
}

const EDITOR_STATE_KEY = 'qr-editor-state';
const SAVES_KEY = 'qr-saves';
const PRIMARY_KEY = 'qr-saves-primary';

function loadDraft(): LiveDraft | null {
  try {
    const raw = localStorage.getItem(EDITOR_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiveDraft>;
    return {
      mode: parsed.mode ?? 'url',
      vcardData: parsed.vcardData ?? DEFAULT_VCARD,
      urlData: parsed.urlData ?? '',
      textData: parsed.textData ?? '',
      wifiData: parsed.wifiData ?? DEFAULT_WIFI,
      emailData: parsed.emailData ?? DEFAULT_EMAIL,
      smsData: parsed.smsData ?? DEFAULT_SMS,
      styleData: { ...DEFAULT_STYLE, ...parsed.styleData },
      customLogo: parsed.customLogo ?? null,
    };
  } catch {
    return null;
  }
}

function loadSaves(): SaveEntry[] {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((s, i) => {
      const r = s as Record<string, unknown>;
      return {
        id: typeof r.id === 'string' ? r.id : `legacy-${i}`,
        name: typeof r.name === 'string' ? r.name : `Save ${i + 1}`,
        styleData: {
          ...DEFAULT_STYLE,
          ...(r.styleData ?? r.style ?? {}),
        } as StyleData,
        customLogo: (r.customLogo as string | null | undefined) ?? null,
      };
    });
  } catch {
    return [];
  }
}

function loadPrimary(): string | null {
  return localStorage.getItem(PRIMARY_KEY);
}

function persistPrimary(id: string | null) {
  if (id) localStorage.setItem(PRIMARY_KEY, id);
  else localStorage.removeItem(PRIMARY_KEY);
}

function buildQrDataFromDraft(d: LiveDraft): string | null {
  switch (d.mode) {
    case 'contact':
      return buildVCard(d.vcardData);
    case 'url':
      return buildUrl(d.urlData);
    case 'text':
      return buildText(d.textData);
    case 'wifi':
      return buildWifi(d.wifiData);
    case 'emailmsg':
      return buildEmail(d.emailData);
    case 'sms':
      return buildSms(d.smsData);
  }
}

function getUrlId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

// Resolve the active selection precedence:
//   1. ?id=<saveId> URL param
//   2. localStorage primary pin
//   3. First save in the list
//   4. Live draft
//
// Returns the active source as either a SaveEntry or the live draft, so
// the renderer always has *something* to display.
type ActiveSource =
  | { kind: 'save'; save: SaveEntry; dataString: string }
  | { kind: 'draft'; draft: LiveDraft; dataString: string };

// Resolve the initial active selection from saves + URL + primary pin.
// Kept outside the component so it stays as a pure function we can call
// from a useState initializer (no setState-in-effect).
function resolveInitialActiveId(
  savesList: SaveEntry[],
  pinned: string | null,
): string | null {
  const urlId = getUrlId();
  if (urlId && savesList.some((s) => s.id === urlId)) return urlId;
  if (pinned && savesList.some((s) => s.id === pinned)) return pinned;
  return savesList[0]?.id ?? null;
}

export function QrPresenter() {
  // Reads run synchronously during the first render via useState
  // initializers. This both eliminates the setState-in-effect pattern
  // and avoids the empty-state flash that would otherwise show on
  // every visit before the storage read completes.
  const [saves, setSaves] = useState<SaveEntry[]>(() => loadSaves());
  const [draft, setDraft] = useState<LiveDraft | null>(() => loadDraft());
  const [primaryId, setPrimaryId] = useState<string | null>(() =>
    loadPrimary(),
  );
  const [activeId, setActiveId] = useState<string | null>(() =>
    resolveInitialActiveId(loadSaves(), loadPrimary()),
  );

  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  // The presenter's light/dark surface follows the canonical theme mode.
  // No local toggle — one source of truth, one control, one mental model.
  const { resolvedMode } = useTheme();
  const lightBg = resolvedMode === 'light';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [layers, setLayers] = useState<AnimationLayers>(NO_LAYERS);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const svgMarkupRef = useRef<string | null>(null);
  // Bumped each time async logo loading finishes (or there's no logo to
  // load). Acts as a trigger key for the render effect so it reruns once
  // the refs are populated.
  const [logoLoadKey, setLogoLoadKey] = useState<string>('initial');

  // Cross-tab change sync. Same-tab edits in the editor will sync on the
  // next page revisit; cross-tab gets `storage` for free.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SAVES_KEY) setSaves(loadSaves());
      else if (e.key === EDITOR_STATE_KEY) setDraft(loadDraft());
      else if (e.key === PRIMARY_KEY) setPrimaryId(loadPrimary());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Online indicator listener (initial value already in state via useState).
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const togglePrimary = useCallback(
    (id: string) => {
      const next = primaryId === id ? null : id;
      setPrimaryId(next);
      persistPrimary(next);
    },
    [primaryId],
  );

  // Resolve the active source.
  const active = useMemo<ActiveSource | null>(() => {
    if (activeId) {
      const save = saves.find((s) => s.id === activeId);
      if (save) {
        // Save tiles render with the live draft's data so the user sees
        // *their* QR content with this style. Fall back to the vCard or
        // a sensible default if the editor hasn't initialized.
        const ds = draft ? buildQrDataFromDraft(draft) : null;
        return {
          kind: 'save',
          save,
          dataString: ds || 'https://example.com',
        };
      }
    }
    if (draft) {
      const ds = buildQrDataFromDraft(draft);
      if (ds) return { kind: 'draft', draft, dataString: ds };
    }
    return null;
  }, [activeId, saves, draft]);

  // useMemo so the spread (`...DEFAULT_STYLE, ...save.styleData`) doesn't
  // produce a fresh object reference every render, which would invalidate
  // the render-effect's deps on every parent re-render.
  const activeStyle: StyleData | null = useMemo(() => {
    if (!active) return null;
    return active.kind === 'save'
      ? { ...DEFAULT_STYLE, ...active.save.styleData }
      : active.draft.styleData;
  }, [active]);
  const activeLogo: string | null = active
    ? active.kind === 'save'
      ? active.save.customLogo
      : active.draft.customLogo
    : null;
  const activeName: string = active
    ? active.kind === 'save'
      ? active.save.name
      : 'Live draft'
    : '';
  const activeSub: string =
    active && active.kind === 'draft' && active.draft.mode === 'contact'
      ? [active.draft.vcardData.firstName, active.draft.vcardData.lastName]
          .filter(Boolean)
          .join(' ')
      : '';

  // (Removed: per-preset previewBg sync. Background follows the canonical
  // theme mode now — see lightBg derivation above.)

  // Load logo into refs the renderer expects. The effect kicks off the
  // async load and bumps `logoLoadKey` when done so the render effect
  // reruns with populated refs. The early-return null-src branch
  // doesn't setState — it just leaves the refs null and lets the next
  // render see them that way; the key tracks the src itself so a fresh
  // null after a previous logo still produces a key change.
  useEffect(() => {
    logoImgRef.current = null;
    svgMarkupRef.current = null;
    const src = activeLogo;
    // No logo: refs were cleared above. The render effect will rerun
    // anyway because activeLogo is in its dependency list, so no need
    // to bump the load key here (which would be setState-in-effect).
    if (!src) return;
    let cancelled = false;
    (async () => {
      try {
        if (src.endsWith('.svg') || src.startsWith('data:image/svg')) {
          let markup: string;
          if (src.startsWith('data:image/svg')) {
            const base64 = src.split(',')[1] ?? '';
            markup = atob(base64);
          } else {
            const res = await fetch(src);
            markup = await res.text();
          }
          if (!cancelled) {
            svgMarkupRef.current = markup;
            setLogoLoadKey(`svg:${src.slice(0, 40)}:${Date.now()}`);
          }
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('logo load failed'));
            img.src = src;
          });
          if (!cancelled) {
            logoImgRef.current = img;
            setLogoLoadKey(`img:${src.slice(0, 40)}:${Date.now()}`);
          }
        }
      } catch {
        if (!cancelled) setLogoLoadKey(`failed:${Date.now()}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeLogo]);

  const doRender = useCallback(async () => {
    if (!active || !activeStyle) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const matrix = generateQrMatrix(active.dataString, activeStyle.ecLevel);

    let dodgeMask: Float32Array | null = null;
    if (activeLogo && matrix) {
      dodgeMask = await computeDodgeMask({
        logoImg: logoImgRef.current,
        logoSvgMarkup: svgMarkupRef.current,
        modCount: matrix.modCount,
        canvasSize: activeStyle.qrSize,
        quietZone: activeStyle.quietZone,
        logoSize: activeStyle.logoSize,
        aggressiveness: activeStyle.dodgeAggressiveness,
        softness: activeStyle.dodgeSoftness,
        coverageThreshold: activeStyle.dodgeCoverageThreshold,
      });
    }

    await renderQrToCanvas({
      canvas,
      data: active.dataString,
      style: activeStyle,
      logoImg: logoImgRef.current,
      logoSvgMarkup: svgMarkupRef.current,
      dodgeMask,
      logoColorSync: !activeStyle.logoIndependent,
    });

    const colorAnim = activeStyle.animationType !== 'none';
    const redrawLogo = !!activeLogo && !activeStyle.logoColorOver;
    const logoMotion = redrawLogo && activeStyle.logoAnimationType !== 'none';

    if (!colorAnim && !logoMotion) {
      setLayers(NO_LAYERS);
      return;
    }

    let colorMaskUrl: string | null = null;
    let baseImageUrl: string | null = null;
    let logoLayerUrl: string | null = null;

    if (colorAnim) {
      const maskCanvas = document.createElement('canvas');
      await renderQrToCanvas({
        canvas: maskCanvas,
        data: active.dataString,
        style: {
          ...activeStyle,
          dotColor: '#000000',
          cornerColor: '#000000',
          useGradient: false,
          transparentBg: true,
        },
        logoImg: logoImgRef.current,
        logoSvgMarkup: svgMarkupRef.current,
        dodgeMask,
        logoColorSync: !activeStyle.logoIndependent,
        skipLogo: redrawLogo,
      });
      colorMaskUrl = maskCanvas.toDataURL();
    } else {
      const baseCanvas = document.createElement('canvas');
      await renderQrToCanvas({
        canvas: baseCanvas,
        data: active.dataString,
        style: activeStyle,
        logoImg: logoImgRef.current,
        logoSvgMarkup: svgMarkupRef.current,
        dodgeMask,
        logoColorSync: !activeStyle.logoIndependent,
        skipLogo: true,
      });
      baseImageUrl = baseCanvas.toDataURL();
    }

    if (redrawLogo) {
      const layer = await renderLogoLayer({
        canvasSize: activeStyle.qrSize,
        style: activeStyle,
        logoImg: logoImgRef.current,
        logoSvgMarkup: svgMarkupRef.current,
        logoColorSync: !activeStyle.logoIndependent,
      });
      logoLayerUrl = layer ? layer.toDataURL() : null;
    }

    setLayers({ colorMaskUrl, baseImageUrl, logoLayerUrl });
    // logoLoadKey is included to retrigger after async logo load completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeStyle, activeLogo, logoLoadKey]);

  // The render call mutates internal state (maskDataUrl + canvas pixels).
  // The lint rule reads that as "setState in effect" — but this IS the
  // sync-with-external-system case the rule exempts in spirit: the
  // canvas is the external system. Disabling the rule rather than
  // restructuring around it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    doRender();
  }, [doRender]);

  const isAnimated = !!(layers.colorMaskUrl || layers.baseImageUrl);

  if (!active || !activeStyle) {
    return (
      <main className={`${styles.shell} ${styles.shellLight}`}>
        <div className={styles.emptyState}>
          <h1>No QR yet</h1>
          <p>
            Open the editor and create or save a QR. Once anything is saved,
            this screen will display it.
          </p>
          <a href="#" className={`btn btn-primary ${styles.homeLink}`}>
            Open QR editor
          </a>
        </div>
      </main>
    );
  }

  const overlayCls = overlayVisible ? '' : styles.hidden;
  const lightCls = lightBg ? styles.shellLight : styles.shellDark;
  const headerLightCls = lightBg ? styles.headerLight : styles.headerDark;
  const footerLightCls = lightBg ? styles.footerLight : styles.footerDark;
  const chromeLightCls = lightBg ? styles.chromeBtnLight : styles.chromeBtnDark;
  const pickerLightCls = lightBg
    ? styles.pickerMenuLight
    : styles.pickerMenuDark;
  const pickerRowLightCls = lightBg
    ? styles.pickerRowLight
    : styles.pickerRowDark;

  return (
    <main
      className={`${styles.shell} ${lightCls}`}
      onClick={() => setOverlayVisible((v) => !v)}
    >
      <header
        className={`${styles.header} ${headerLightCls} ${overlayCls}`}
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href="#"
          className={`${styles.chromeBtn} ${chromeLightCls}`}
          aria-label="Back to editor"
        >
          <ArrowLeft size={16} />
          Editor
        </a>

        <div className={styles.picker}>
          <button
            type="button"
            className={`${styles.chromeBtn} ${chromeLightCls}`}
            onClick={() => setPickerOpen((v) => !v)}
            disabled={saves.length === 0 && !draft}
          >
            {activeId !== null && primaryId === activeId && (
              <Star
                size={14}
                className={styles.pickerStar}
                fill="currentColor"
                aria-hidden
              />
            )}
            <span className={styles.pickerLabel}>{activeName}</span>
            {(saves.length > 0 || draft) && <ChevronDown size={16} />}
          </button>
          {pickerOpen && (saves.length > 0 || draft) && (
            <div
              className={`${styles.pickerMenu} ${pickerLightCls}`}
              onMouseLeave={() => setPickerOpen(false)}
            >
              {draft && (
                <div className={`${styles.pickerRow} ${pickerRowLightCls}`}>
                  <button
                    type="button"
                    className={`${styles.pickerItem} ${activeId === null ? styles.pickerItemActive : ''}`}
                    onClick={() => {
                      setActiveId(null);
                      setPickerOpen(false);
                    }}
                  >
                    Live draft
                  </button>
                </div>
              )}
              {saves.map((s) => {
                const isThisPrimary = primaryId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`${styles.pickerRow} ${pickerRowLightCls}`}
                  >
                    <button
                      type="button"
                      className={`${styles.pickerItem} ${activeId === s.id ? styles.pickerItemActive : ''}`}
                      onClick={() => {
                        setActiveId(s.id);
                        setPickerOpen(false);
                      }}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      className={`${styles.pickerStarBtn} ${isThisPrimary ? styles.pickerStarActive : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePrimary(s.id);
                      }}
                      title={
                        isThisPrimary ? 'Unset as primary' : 'Set as primary'
                      }
                      aria-label={
                        isThisPrimary ? 'Unset as primary' : 'Set as primary'
                      }
                      aria-pressed={isThisPrimary}
                    >
                      <Star
                        size={16}
                        fill={isThisPrimary ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.headerRight}>
          {!online && (
            <span className={styles.offlinePill}>
              <WifiOff size={12} />
              Offline
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className={styles.qrStage}>
        {isAnimated && (
          <QrAnimatedPreview
            layers={layers}
            style={activeStyle}
            size={activeStyle.qrSize}
          />
        )}
        <canvas
          ref={canvasRef}
          className={styles.qrCanvas}
          style={{ display: isAnimated ? 'none' : undefined }}
        />
      </div>

      {(activeName || activeSub) && (
        <footer
          className={`${styles.footer} ${footerLightCls} ${overlayCls}`}
          onClick={(e) => e.stopPropagation()}
        >
          {activeName && <p className={styles.footerName}>{activeName}</p>}
          {activeSub && <p className={styles.footerSub}>{activeSub}</p>}
        </footer>
      )}
    </main>
  );
}
