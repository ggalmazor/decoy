import { useEffect, useRef } from 'preact/hooks';
import { buildMosaic } from '../../render/mosaic';
import { decoyFontReady } from '../../render/text';

interface Props {
  text: string;
  w: number;
  h: number;
  cell?: number;
  ink?: string;
  paper?: string;
  label?: string;
  class?: string;
}

// Every mosaic on the landing page and in the export dialog goes through buildMosaic, the same function the
// editor and the export use.
export function MosaicCanvas({
  text,
  w,
  h,
  cell = 8,
  ink = '#17140F',
  paper = '#F6F1E6',
  label = 'Pixelated decoy',
  class: className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const paint = () => {
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const bitmap = buildMosaic({ text, w, h, cell, ink, paper });
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap.canvas, 0, 0, w * dpr, h * dpr);
    };
    void decoyFontReady().then(paint);
    return () => {
      cancelled = true;
    };
  }, [text, w, h, cell, ink, paper]);
  return (
    <canvas
      ref={ref}
      class={className}
      role="img"
      aria-label={label}
      style={{ width: `${w}px`, height: `${h}px`, flex: 'none', display: 'block', maxWidth: '100%' }}
    />
  );
}
