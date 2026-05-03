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
import { QrCode } from 'lucide-react';

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

    let dodgeMask: boolean[] | null = null;
    if (customLogo) {
      const matrix = generateQrMatrix(qrData, styleData.ecLevel);
      if (matrix) {
        dodgeMask = await computeDodgeMask({
          logoImg: logoImgRef.current,
          logoSvgMarkup: svgMarkupRef.current,
          logoColorSync: !styleData.logoIndependent,
          dotColor: styleData.dotColor,
          modCount: matrix.modCount,
          canvasSize: styleData.qrSize,
          quietZone: styleData.quietZone,
          logoSize: styleData.logoSize,
          logoMargin: styleData.logoMargin,
          aggressiveness: styleData.dodgeAggressiveness,
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
    <div className="min-h-screen bg-[#0b0c0e] text-[#e4e5e9]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#131519] border border-gray-700">
              <QrCode className="w-6 h-6 text-[#5eead4]" />
            </div>
            <div>
              <span className="inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-[#5eead4]/10 text-[#5eead4] rounded-full mb-1">
                Offline - Universal - Any Data
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Styled QR Generator</h1>
            </div>
          </div>
          <p className="text-sm text-gray-400 ml-14">
            Generate customizable QR codes for contacts, URLs, WiFi, email, SMS, or plain text.
          </p>
        </header>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          <div className="space-y-6">
            {/* Data input section */}
            <section className="rounded-xl bg-[#131519] border border-gray-700 p-5">
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
                QR Data
              </h2>
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

            {/* Style section */}
            <section className="rounded-xl bg-[#131519] border border-gray-700 p-5">
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
                Style
              </h2>
              <QrStyleControls
                style={styleData}
                onChange={setStyleData}
                customLogo={customLogo}
                onLogoChange={setCustomLogo}
                isSvgLogo={isSvgLogo}
              />
            </section>
          </div>

          {/* Preview panel */}
          <div className="lg:sticky lg:top-6">
            <section className="rounded-xl bg-[#131519] border border-gray-700 p-4">
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
