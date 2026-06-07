import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { StyleData, AnimationLayers } from './qr-types';
import { QrAnimatedPreview } from './qr-animated-preview';
import styles from './qr-fullscreen-modal.module.css';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layers: AnimationLayers;
  style: StyleData;
  lightBg: boolean;
  onClose: () => void;
}

export function QrFullscreenModal({
  canvasRef,
  layers,
  style,
  lightBg,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimated = !!(layers.colorMaskUrl || layers.baseImageUrl);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (isAnimated) return;
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.style.maxWidth = '100%';
    clone.style.maxHeight = '100%';
    clone.style.borderRadius = '12px';
    clone.getContext('2d')!.drawImage(canvas, 0, 0);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(clone);
  }, [canvasRef, layers, style, isAnimated]);

  return (
    <div
      className={`${styles.overlay} ${lightBg ? styles.overlayLight : styles.overlayDark}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className={`${styles.closeBtn} ${lightBg ? styles.closeBtnLight : styles.closeBtnDark}`}
        onClick={onClose}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <div className={styles.stage}>
        {isAnimated ? (
          <QrAnimatedPreview
            layers={layers}
            style={style}
            size={style.qrSize}
          />
        ) : (
          <div ref={containerRef} />
        )}
      </div>
    </div>
  );
}
