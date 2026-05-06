import { useRef, useState } from 'react';
import {
  Download,
  Maximize2,
  FileDown,
  Sun,
  Moon,
  Image as ImageIcon,
  Copy,
  Check,
} from 'lucide-react';

import { QrFullscreenModal } from './qr-fullscreen-modal';
import { QrAnimatedPreview } from './qr-animated-preview';
import { sanitizeFilename, QR_BYTE_WARN_THRESHOLD, MAX_QR_BYTES } from './qr-utils';
import type { StyleData, QrMode } from './qr-types';

interface QrMeta {
  title: string;
  sub: string;
}

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskDataUrl: string | null;
  style: StyleData;
  byteSize: number;
  qrMeta: QrMeta;
  qrData: string;
  fileName: string;
  mode: QrMode;
  onToggleBg: () => void;
}

export function QrPreview({
  canvasRef,
  maskDataUrl,
  style,
  byteSize,
  qrMeta,
  qrData,
  fileName,
  mode,
  onToggleBg,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportLabel, setExportLabel] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const lightBg = style.previewBg === 'light';

  const isAnimated = !!(maskDataUrl && style.animationType !== 'none');
  const name = sanitizeFilename(fileName);

  function triggerDownload(blob: Blob, filename: string) {
    const link = downloadRef.current;
    if (!link) return;
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function downloadMp4() {
    if (!maskDataUrl) return;
    setExportProgress(0);
    setExportLabel('MP4');
    try {
      const { exportVideo } = await import('./qr-export-video');
      const blob = await exportVideo(maskDataUrl, style, 'mp4', setExportProgress);
      triggerDownload(blob, `${name}_qr.mp4`);
    } catch (err) {
      console.error('MP4 export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadWebm() {
    if (!maskDataUrl) return;
    setExportProgress(0);
    setExportLabel('WebM');
    try {
      const { exportVideo } = await import('./qr-export-video');
      const blob = await exportVideo(maskDataUrl, style, 'webm', setExportProgress);
      triggerDownload(blob, `${name}_qr.webm`);
    } catch (err) {
      console.error('WebM export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadGif() {
    if (!maskDataUrl) return;
    setExportProgress(0);
    setExportLabel('GIF');
    try {
      const { exportGif } = await import('./qr-export-gif');
      const blob = await exportGif(maskDataUrl, style, 60, setExportProgress);
      triggerDownload(blob, `${name}_qr.gif`);
    } catch (err) {
      console.error('GIF export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadAnimatedFrame(format: 'png' | 'webp') {
    if (!maskDataUrl) return;
    setExportProgress(0);
    setExportLabel(format.toUpperCase());
    try {
      const { exportFrame } = await import('./qr-export-frame');
      const blob = await exportFrame(maskDataUrl, style, format);
      triggerDownload(blob, `${name}_qr.${format}`);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${name}_qr.png`);
    }, 'image/png');
  }

  function downloadWebp() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) triggerDownload(blob, `${name}_qr.webp`);
      },
      'image/webp',
      0.95,
    );
  }

  function downloadVcf() {
    if (mode !== 'contact' || !qrData) return;
    const blob = new Blob([qrData], { type: 'text/vcard' });
    triggerDownload(blob, `${name}.vcf`);
  }

  async function copyData() {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function openModal() {
    if (canvasRef.current) setShowModal(true);
  }

  const warn = byteSize > QR_BYTE_WARN_THRESHOLD;
  const busy = exportProgress !== null;

  const btnPrimary =
    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#5eead4] text-gray-900 text-sm font-medium hover:bg-[#5eead4]/90 transition-colors disabled:opacity-60';
  const btnSecondary =
    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-700 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60';

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-xl overflow-hidden border border-gray-700 flex items-center justify-center p-4 cursor-pointer group"
        onClick={openModal}
        style={{
          background: lightBg
            ? 'repeating-conic-gradient(#f3f4f6 0% 25%, #e5e7eb 0% 50%) 0 0 / 16px 16px'
            : 'repeating-conic-gradient(#2a2d37 0% 25%, #1a1d23 0% 50%) 0 0 / 16px 16px',
        }}
      >
        {isAnimated && (
          <QrAnimatedPreview maskDataUrl={maskDataUrl} style={style} size={style.qrSize} />
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto rounded-lg"
          style={{ imageRendering: 'pixelated', display: isAnimated ? 'none' : undefined }}
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded-md bg-black/50 text-white"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBg();
            }}
          >
            {lightBg ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button className="p-1.5 rounded-md bg-black/50 text-white">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {qrMeta.title && (
        <div className="text-center">
          <p className="font-medium text-sm">{qrMeta.title}</p>
          {qrMeta.sub && <p className="text-xs text-gray-400">{qrMeta.sub}</p>}
        </div>
      )}

      {byteSize > 0 && (
        <p className={`text-center text-xs font-mono ${warn ? 'text-amber-500' : 'text-gray-400'}`}>
          {byteSize.toLocaleString()} / {MAX_QR_BYTES.toLocaleString()} bytes
        </p>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
            {exportProgress === -1 ? (
              <div className="bg-[#5eead4] h-1.5 rounded-full w-full animate-pulse" />
            ) : (
              <div
                className="bg-[#5eead4] h-1.5 rounded-full transition-all duration-150"
                style={{ width: `${exportProgress}%` }}
              />
            )}
          </div>
          {exportLabel && (
            <p className="text-center text-xs text-gray-400">Exporting {exportLabel}...</p>
          )}
        </div>
      )}

      {isAnimated ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={downloadMp4} disabled={busy}>
              <Download className="w-3.5 h-3.5" />
              MP4
            </button>
            <button className={btnSecondary} onClick={downloadGif} disabled={busy}>
              <Download className="w-3.5 h-3.5" />
              GIF
            </button>
            <button className={btnSecondary} onClick={downloadWebm} disabled={busy}>
              <Download className="w-3.5 h-3.5" />
              WebM
            </button>
          </div>
          <div className="flex gap-2">
            <button
              className={btnSecondary}
              onClick={() => downloadAnimatedFrame('png')}
              disabled={busy}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              PNG
            </button>
            <button
              className={btnSecondary}
              onClick={() => downloadAnimatedFrame('webp')}
              disabled={busy}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              WebP
            </button>
            {mode === 'contact' && (
              <button className={btnSecondary} onClick={downloadVcf} disabled={!qrData || busy}>
                <FileDown className="w-3.5 h-3.5" />
                .vcf
              </button>
            )}
            <button className={btnSecondary} onClick={copyData} disabled={!qrData || busy}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className={btnPrimary} onClick={downloadPng} disabled={busy}>
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>
          <button className={btnSecondary} onClick={downloadWebp} disabled={busy}>
            <Download className="w-3.5 h-3.5" />
            WebP
          </button>
          {mode === 'contact' && (
            <button className={btnSecondary} onClick={downloadVcf} disabled={!qrData || busy}>
              <FileDown className="w-3.5 h-3.5" />
              .vcf
            </button>
          )}
          <button className={btnSecondary} onClick={copyData} disabled={!qrData || busy}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <a ref={downloadRef} className="hidden" />

      {showModal && (
        <QrFullscreenModal
          canvasRef={canvasRef}
          maskDataUrl={maskDataUrl}
          style={style}
          lightBg={lightBg}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
