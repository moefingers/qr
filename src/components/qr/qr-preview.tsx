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
import {
  sanitizeFilename,
  QR_BYTE_WARN_THRESHOLD,
  MAX_QR_BYTES,
} from './qr-utils';
import type { StyleData, QrMode, AnimationLayers } from './qr-types';
import styles from './qr-preview.module.css';

interface QrMeta {
  title: string;
  sub: string;
}

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layers: AnimationLayers;
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
  layers,
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

  // The editor populates a color mask (color animation) and/or a base
  // image (logo-only animation) exactly when the QR is animated.
  const isAnimated = !!(layers.colorMaskUrl || layers.baseImageUrl);
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
    if (!isAnimated) return;
    setExportProgress(0);
    setExportLabel('MP4');
    try {
      const { exportVideo } = await import('./qr-export-video');
      const { blob, ext } = await exportVideo(
        layers,
        style,
        'mp4',
        setExportProgress,
      );
      triggerDownload(blob, `${name}_qr.${ext}`);
    } catch (err) {
      console.error('MP4 export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadWebm() {
    if (!isAnimated) return;
    setExportProgress(0);
    setExportLabel('WebM');
    try {
      const { exportVideo } = await import('./qr-export-video');
      const { blob, ext } = await exportVideo(
        layers,
        style,
        'webm',
        setExportProgress,
      );
      triggerDownload(blob, `${name}_qr.${ext}`);
    } catch (err) {
      console.error('WebM export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadGif() {
    if (!isAnimated) return;
    setExportProgress(0);
    setExportLabel('GIF');
    try {
      const { exportGif } = await import('./qr-export-gif');
      const blob = await exportGif(layers, style, 60, setExportProgress);
      triggerDownload(blob, `${name}_qr.gif`);
    } catch (err) {
      console.error('GIF export failed:', err);
    } finally {
      setExportProgress(null);
      setExportLabel('');
    }
  }

  async function downloadAnimatedFrame(format: 'png' | 'webp') {
    if (!isAnimated) return;
    setExportProgress(0);
    setExportLabel(format.toUpperCase());
    try {
      const { exportFrame } = await import('./qr-export-frame');
      const blob = await exportFrame(layers, style, format);
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

  return (
    <div className={styles.root}>
      <div
        className={`${styles.canvasFrame} ${lightBg ? styles.canvasFrameLight : styles.canvasFrameDark}`}
        onClick={openModal}
      >
        {isAnimated && (
          <QrAnimatedPreview
            layers={layers}
            style={style}
            size={style.qrSize}
          />
        )}
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ display: isAnimated ? 'none' : undefined }}
        />
        <div className={styles.overlay}>
          <button
            type="button"
            className={styles.overlayBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleBg();
            }}
            title={lightBg ? 'Use dark background' : 'Use light background'}
          >
            {lightBg ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <button
            type="button"
            className={styles.overlayBtn}
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {qrMeta.title && (
        <div className={styles.meta}>
          <p className={styles.metaTitle}>{qrMeta.title}</p>
          {qrMeta.sub && <p className={styles.metaSub}>{qrMeta.sub}</p>}
        </div>
      )}

      {byteSize > 0 && (
        <p
          className={`${styles.byteCount} ${warn ? styles.byteCountWarn : ''}`}
        >
          {byteSize.toLocaleString()} / {MAX_QR_BYTES.toLocaleString()} bytes
        </p>
      )}

      {busy && (
        <div>
          <div className={styles.progressBar}>
            {exportProgress === -1 ? (
              <div className={styles.progressIndeterminate} />
            ) : (
              <div
                className={styles.progressFill}
                style={{ width: `${exportProgress}%` }}
              />
            )}
          </div>
          {exportLabel && (
            <p className={styles.progressLabel}>Exporting {exportLabel}…</p>
          )}
        </div>
      )}

      {isAnimated ? (
        <div className={styles.actions}>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={`btn btn-primary ${styles.actionBtn}`}
              onClick={downloadMp4}
              disabled={busy}
            >
              <Download size={14} /> MP4
            </button>
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={downloadGif}
              disabled={busy}
            >
              <Download size={14} /> GIF
            </button>
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={downloadWebm}
              disabled={busy}
            >
              <Download size={14} /> WebM
            </button>
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={() => downloadAnimatedFrame('png')}
              disabled={busy}
            >
              <ImageIcon size={14} /> PNG
            </button>
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={() => downloadAnimatedFrame('webp')}
              disabled={busy}
            >
              <ImageIcon size={14} /> WebP
            </button>
            {mode === 'contact' && (
              <button
                type="button"
                className={`btn btn-outline ${styles.actionBtn}`}
                onClick={downloadVcf}
                disabled={!qrData || busy}
              >
                <FileDown size={14} /> .vcf
              </button>
            )}
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={copyData}
              disabled={!qrData || busy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actionRow}>
          <button
            type="button"
            className={`btn btn-primary ${styles.actionBtn}`}
            onClick={downloadPng}
            disabled={busy}
          >
            <Download size={14} /> PNG
          </button>
          <button
            type="button"
            className={`btn btn-outline ${styles.actionBtn}`}
            onClick={downloadWebp}
            disabled={busy}
          >
            <Download size={14} /> WebP
          </button>
          {mode === 'contact' && (
            <button
              type="button"
              className={`btn btn-outline ${styles.actionBtn}`}
              onClick={downloadVcf}
              disabled={!qrData || busy}
            >
              <FileDown size={14} /> .vcf
            </button>
          )}
          <button
            type="button"
            className={`btn btn-outline ${styles.actionBtn}`}
            onClick={copyData}
            disabled={!qrData || busy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <a ref={downloadRef} className={styles.hiddenAnchor} />

      {showModal && (
        <QrFullscreenModal
          canvasRef={canvasRef}
          layers={layers}
          style={style}
          lightBg={lightBg}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
