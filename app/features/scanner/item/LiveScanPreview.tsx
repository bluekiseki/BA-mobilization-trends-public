import { useEffect, useRef, useState } from 'react';
import type { PreviewFrame } from '~/features/scanner/video/types';
import { formatQty } from './overlayStyle';

interface Props {
  /** The page calls the registered function with each analysed keyframe; the preview takes ownership of `frame.bitmap`. */
  register: (draw: ((frame: PreviewFrame) => void) | null) => void;
}

/**
 * Shows the keyframe currently being analysed with its raw, not yet graph-aligned detections.
 * Drawing happens on keyframes only and goes through a ref, so it never triggers React renders per frame.
 */
export function LiveScanPreview({ register }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    register((frame) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        frame.bitmap.close();
        return;
      }
      const started = performance.now();
      if (canvas.width !== frame.bitmap.width || canvas.height !== frame.bitmap.height) {
        canvas.width = frame.bitmap.width;
        canvas.height = frame.bitmap.height;
      }
      ctx.drawImage(frame.bitmap, 0, 0);
      frame.bitmap.close();
      const scale = canvas.width / frame.width;
      ctx.lineWidth = 2;
      ctx.font = 'bold 11px sans-serif';
      for (const cell of frame.cells) {
        const x = cell.box.x * scale;
        const y = cell.box.y * scale;
        const w = cell.box.w * scale;
        const h = cell.box.h * scale;
        // Dashed + amber until the frame graph confirms the cell: raw results can still change.
        ctx.strokeStyle = cell.key && cell.similarity >= 0.6 ? '#4ade80' : '#fbbf24';
        ctx.setLineDash(cell.key ? [] : [4, 3]);
        ctx.strokeRect(x, y, w, h);
        if (cell.quantity) {
          const label = formatQty(cell.quantity);
          const labelW = ctx.measureText(label).width + 6;
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fillRect(x + w - labelW, y, labelW, 14);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + w - labelW + 3, y + 11);
        }
      }
      ctx.setLineDash([]);
      if (import.meta.env.DEV) console.debug(`[Scanner] preview draw ${(performance.now() - started).toFixed(1)}ms, ${frame.cells.length} cells`);
      setHasFrame(true);
    });
    return () => register(null);
  }, [register]);

  return (
    <div className={hasFrame ? 'mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700' : 'hidden'}>
      <canvas ref={canvasRef} className="w-full max-h-64 object-contain" />
    </div>
  );
}
