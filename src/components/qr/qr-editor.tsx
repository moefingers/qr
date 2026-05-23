import { useState, useRef, useEffect, useCallback } from 'react';
import type { VCardData, WifiData, EmailData, SmsData, StyleData, QrMode } from './qr-types';
import {
  DEFAULT_VCARD,
  DEFAULT_WIFI,
  DEFAULT_EMAIL,
  DEFAULT_SMS,
  DEFAULT_STYLE,
} from './qr-types';
import { QrDataInput } from './qr-data-input';
import { QrStyleControls } from './qr-style-controls';
import { QrPreview } from './qr-preview';
import {
  buildVCard,
  buildUrl,
  buildText,
  buildWifi,
  buildEmail,
  buildSms,
  getQrMeta,
  getFileName,
} from './qr-data-builder';
import { renderQrToCanvas, generateQrMatrix } from './qr-canvas-renderer';
import { computeDodgeMask } from './qr-dot-dodge';
import { RENDER_DEBOUNCE_MS, SAVE_DEBOUNCE_MS } from './qr-utils';
import { QrCode, Maximize2 } from 'lucide-react';
import { ThemeToggle } from '../ui/theme-toggle';
import styles from './qr-editor.module.css';

const STORAGE_KEY = 'qr-editor-state';

interface PersistedState {
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

function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildQrData(
  mode: QrMode,
  vcard: VCardData,
  url: string,
  text: string,
  wifi: WifiData,
  email: EmailData,
  sms: SmsData,
): string | null {
  switch (mode) {
    case 'contact':
      return buildVCard(vcard);
    case 'url':
      return buildUrl(url);
    case 'text':
      return buildText(text);
    case 'wifi':
      return buildWifi(wifi);
    case 'emailmsg':
      return buildEmail(email);
    case 'sms':
      return buildSms(sms);
  }
}

export function QrEditor() {
  const saved = loadState();

  const [mode, setMode] = useState<QrMode>(saved.mode ?? 'url');
  const [vcardData, setVcardData] = useState<VCardData>(saved.vcardData ?? DEFAULT_VCARD);
  const [urlData, setUrlData] = useState<string>(saved.urlData ?? '');
  const [textData, setTextData] = useState<string>(saved.textData ?? '');
  const [wifiData, setWifiData] = useState<WifiData>(saved.wifiData ?? DEFAULT_WIFI);
  const [emailData, setEmailData] = useState<EmailData>(saved.emailData ?? DEFAULT_EMAIL);
  const [smsData, setSmsData] = useState<SmsData>(saved.smsData ?? DEFAULT_SMS);
  const [styleData, setStyleData] = useState<StyleData>({ ...DEFAULT_STYLE, ...saved.styleData });
  const [customLogo, setCustomLogo] = useState<string | null>(saved.customLogo ?? null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const svgMarkupRef = useRef<string | null>(null);

  const isSvgLogo =
    customLogo?.endsWith('.svg') || customLogo?.startsWith('data:image/svg') || false;

  const loadLogo = useCallback(async (src: string | null) => {
    logoImgRef.current = null;
    svgMarkupRef.current = null;
    if (!src) return;

    if (src.endsWith('.svg') || src.startsWith('data:image/svg')) {
      let markup: string;
      if (src.startsWith('data:image/svg')) {
        const base64 = src.split(',')[1] ?? '';
        markup = atob(base64);
      } else {
        const res = await fetch(src);
        markup = await res.text();
      }
      svgMarkupRef.current = markup;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = src;
      });
      logoImgRef.current = img;
    }
  }, []);

  const qrData = buildQrData(mode, vcardData, urlData, textData, wifiData, emailData, smsData);
  const hasData = !!qrData;

  const doRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!hasData || !qrData) {
      const ctx = canvas.getContext('2d')!;
      canvas.width = styleData.qrSize;
      canvas.height = styleData.qrSize;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setMaskDataUrl(null);
      return;
    }

    let dodgeMask: Float32Array | null = null;
    if (customLogo) {
      const matrix = generateQrMatrix(qrData, styleData.ecLevel);
      if (matrix) {
        dodgeMask = await computeDodgeMask({
          logoImg: logoImgRef.current,
          logoSvgMarkup: svgMarkupRef.current,
          modCount: matrix.modCount,
          canvasSize: styleData.qrSize,
          quietZone: styleData.quietZone,
          logoSize: styleData.logoSize,
          aggressiveness: styleData.dodgeAggressiveness,
          softness: styleData.dodgeSoftness,
          coverageThreshold: styleData.dodgeCoverageThreshold,
        });
      }
    }

    await renderQrToCanvas({
      canvas,
      data: qrData,
      style: styleData,
      logoImg: logoImgRef.current,
      logoSvgMarkup: svgMarkupRef.current,
      dodgeMask,
      logoColorSync: !styleData.logoIndependent,
    });

    if (styleData.animationType !== 'none') {
      const maskCanvas = document.createElement('canvas');
      const maskStyle: StyleData = {
        ...styleData,
        dotColor: '#000000',
        cornerColor: '#000000',
        useGradient: false,
        transparentBg: true,
      };
      await renderQrToCanvas({
        canvas: maskCanvas,
        data: qrData,
        style: maskStyle,
        logoImg: logoImgRef.current,
        logoSvgMarkup: svgMarkupRef.current,
        dodgeMask,
        logoColorSync: !styleData.logoIndependent,
      });
      setMaskDataUrl(maskCanvas.toDataURL());
    } else {
      setMaskDataUrl(null);
    }
  }, [qrData, hasData, styleData, customLogo]);

  useEffect(() => {
    loadLogo(customLogo);
  }, [customLogo, loadLogo]);

  useEffect(() => {
    const id = setTimeout(() => doRender(), RENDER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [doRender]);

  // Save to localStorage with debounce
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const state: PersistedState = {
        mode,
        vcardData,
        urlData,
        textData,
        wifiData,
        emailData,
        smsData,
        styleData,
        customLogo,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // storage full or unavailable
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [mode, vcardData, urlData, textData, wifiData, emailData, smsData, styleData, customLogo]);

  const byteSize = qrData ? new Blob([qrData]).size : 0;
  const qrMeta = getQrMeta(mode, vcardData, urlData, textData, wifiData, emailData, smsData);
  const fileName = getFileName(mode, vcardData, wifiData);

  return (
    <div className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <div className={styles.iconTile}>
                <QrCode size={24} />
              </div>
              <div className={styles.headingGroup}>
                <span className="badge badge-accent">Offline · Universal · Any data</span>
                <h1 className={styles.title}>Styled QR Generator</h1>
              </div>
            </div>
            <p className={styles.subtitle}>
              Generate customizable QR codes for contacts, URLs, WiFi, email, SMS, or plain text.
            </p>
          </div>
          <div className={styles.headerActions}>
            <a
              href="#present"
              className="btn btn-outline"
              title="Open the fullscreen presenter for scanning"
            >
              <Maximize2 size={14} />
              Present
            </a>
            <ThemeToggle />
          </div>
        </header>

        <div className={styles.layout}>
          <div className={styles.column}>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>QR Data</h2>
              <QrDataInput
                mode={mode}
                onModeChange={setMode}
                vcardData={vcardData}
                onVcardChange={setVcardData}
                urlData={urlData}
                onUrlChange={setUrlData}
                textData={textData}
                onTextChange={setTextData}
                wifiData={wifiData}
                onWifiChange={setWifiData}
                emailData={emailData}
                onEmailChange={setEmailData}
                smsData={smsData}
                onSmsChange={setSmsData}
              />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>Style</h2>
              <QrStyleControls
                style={styleData}
                onChange={setStyleData}
                customLogo={customLogo}
                onLogoChange={setCustomLogo}
                isSvgLogo={isSvgLogo}
                qrData={qrData ?? ''}
              />
            </section>
          </div>

          <div className={styles.previewColumn}>
            <section className={styles.section}>
              <QrPreview
                canvasRef={canvasRef}
                maskDataUrl={maskDataUrl}
                style={styleData}
                byteSize={byteSize}
                qrMeta={qrMeta}
                qrData={qrData ?? ''}
                fileName={fileName}
                mode={mode}
                onToggleBg={() =>
                  setStyleData((s) => ({
                    ...s,
                    previewBg: s.previewBg === 'light' ? 'dark' : 'light',
                  }))
                }
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
