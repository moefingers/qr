import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { StyleData } from './qr-types';
import { QrAnimatedPreview } from './qr-animated-preview';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskDataUrl: string | null;
  style: StyleData;
  lightBg: boolean;
  onClose: () => void;
}

export function QrFullscreenModal({ canvasRef, maskDataUrl, style, lightBg, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (maskDataUrl && style.animationType !== 'none') return;
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    clone.style.maxWidth = '90vmin';
    clone.style.maxHeight = '90vmin';
    clone.style.borderRadius = '12px';
    clone.getContext('2d')!.drawImage(canvas, 0, 0);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(clone);
  }, [canvasRef, maskDataUrl, style]);

  const isAnimated = maskDataUrl && style.animationType !== 'none';

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: lightBg ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${lightBg ? 'bg-black/10 hover:bg-black/20 text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
      {isAnimated ? (
        <div style={{ maxWidth: '90vmin', maxHeight: '90vmin' }}>
          <QrAnimatedPreview maskDataUrl={maskDataUrl} style={style} size={style.qrSize} />
        </div>
      ) : (
        <div ref={containerRef} className="flex items-center justify-center" />
      )}
    </div>
  );
}
