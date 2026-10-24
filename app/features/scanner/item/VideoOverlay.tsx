import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ScanResult, VideoScanResult } from '~/features/scanner/core/types';
import { makeInstanceKey } from '~/features/scanner/core/types';
import { replayAt, type ReplayView } from '~/features/scanner/video/replay';
import { OVERLAY_AMBER, OVERLAY_GREEN, OVERLAY_RED, formatQty, isConfidentVideoCell } from './overlayStyle';

interface Props {
  entry: VideoScanResult;
  confirmedItems: Record<string, boolean>;
  activeIdx: number | null;
  /** Called with the result index under the pointer (or null) so the list can highlight the same cell. */
  onActiveChange: (index: number | null) => void;
  hideLabels: boolean;
  /** Seeks to the keyframe that shows this cell and pauses; a new `nonce` repeats the request. */
  focus: { cellId: string; nonce: number } | null;
}

const CONTROL_STRIP_PX = 48; // Native video controls sit at the bottom; pointer events there belong to the player.

interface Caption {
  time: number;
  keyframe: number | null;
  cells: number;
}

export function VideoOverlay({ entry, confirmedItems, activeIdx, onActiveChange, hideLabels, focus }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReplayView | null>(null);
  const lastDrawKey = useRef('');
  const labelIconsRef = useRef(new Map<string, HTMLImageElement>());
  const [showOverlay, setShowOverlay] = useState(true);
  const [caption, setCaption] = useState<Caption>({ time: 0, keyframe: null, cells: 0 });
  const { replayFrames, trace, width, height } = entry.video;

  const resultByCell = useMemo(() => {
    const map = new Map<string, { r: ScanResult; index: number }>();
    entry.results.forEach((r, index) => {
      if (r.cellId) map.set(r.cellId, { r, index });
    });
    return map;
  }, [entry.results]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const view = replayAt(replayFrames, trace, video.currentTime);
    // The caption is React state, so only update it when the keyframe or whole-frame time changes.
    viewRef.current = view;
    const keyframe = view ? view.index : null;
    setCaption((prev) => (prev.keyframe === keyframe && Math.abs(prev.time - video.currentTime) < 0.05 ? prev : { time: video.currentTime, keyframe, cells: view?.frame.cells.length ?? 0 }));

    // A list-row highlight only dims the other boxes while paused; during playback every box stays visible.
    const highlight = video.paused ? activeIdx : null;
    const key = [view?.frame.frame ?? -1, view ? Math.round(view.delta * 2) : 0, highlight ?? -1, showOverlay, hideLabels, canvas.width, canvas.height].join('|');
    if (key === lastDrawKey.current) return;
    lastDrawKey.current = key;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!view || !showOverlay) return;

    const { frame, delta } = view;
    const scale = canvas.width / frame.width;
    const displayScale = (wrapperRef.current?.clientWidth || canvas.width) / frame.width;
    const roi = frame.roi;
    const anyActive = highlight !== null;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(roi.x, roi.y, roi.right - roi.x, roi.bottom - roi.y);
    ctx.clip();
    // Size annotations in CSS pixels so high-density displays do not shrink them.
    const lineWidth = 1.5 / displayScale;
    const fontPx = 9 / displayScale;
    ctx.font = `bold ${fontPx}px sans-serif`;
    for (const cell of frame.cells) {
      const { x, w, h } = cell.box;
      const y = cell.box.y + delta;
      if (y + h < roi.y || y > roi.bottom) continue;
      const found = resultByCell.get(cell.id);
      const r = found?.r;
      const confident = r ? isConfidentVideoCell(r) : false;
      const isActive = found !== undefined && found.index === highlight;
      const color = !r || !r.icon ? OVERLAY_RED : confident ? OVERLAY_GREEN : OVERLAY_AMBER;
      ctx.globalAlpha = anyActive ? (isActive ? 1 : 0.2) : 0.65;
      const borderWidth = isActive ? 2.5 / displayScale : lineWidth;
      // Dashed outline marks cells that still need review, so the cue does not rely on colour alone.
      ctx.setLineDash(confident ? [] : [6 / displayScale, 4 / displayScale]);
      ctx.strokeStyle = color;
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (!r || hideLabels) continue;
      const unit = 1 / displayScale;
      const labelH = 13 * unit;
      // Match the photo overlay: similarity outside top-left, quantity and icon inside top-right.
      const similarity = `${(r.similarity * 100).toFixed(0)}%`;
      const similarityW = (similarity.length * 5.5 + 7) * unit;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(x, y - labelH, similarityW, labelH);
      ctx.fillStyle = color;
      ctx.fillText(similarity, x + 3 * unit, y - 3 * unit);

      if (r.quantity > 0) {
        const quantity = formatQty(r.quantity);
        const icon = r.icon ? labelIconsRef.current.get(r.icon.dataUrl) : undefined;
        const hasIcon = !!icon?.complete && icon.naturalWidth > 0;
        const quantityW = (quantity.length * 5.5 + (hasIcon ? 20 : 8)) * unit;
        const labelX = x + w - quantityW;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(labelX, y, quantityW, labelH);
        if (hasIcon && icon) ctx.drawImage(icon, labelX + 3 * unit, y + 2 * unit, 9 * unit, 9 * unit);
        ctx.fillStyle = '#fff';
        ctx.fillText(quantity, labelX + (hasIcon ? 14 : 3) * unit, y + 10 * unit);
      }

      if (r.icon && found && confirmedItems[makeInstanceKey(entry.id, found.index)]) {
        ctx.fillStyle = OVERLAY_GREEN;
        ctx.beginPath();
        ctx.arc(x + 7 * unit, y + h - 7 * unit, 6 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * unit;
        ctx.beginPath();
        ctx.moveTo(x + 4 * unit, y + h - 7 * unit);
        ctx.lineTo(x + 6 * unit, y + h - 4.5 * unit);
        ctx.lineTo(x + 10 * unit, y + h - 9.5 * unit);
        ctx.stroke();
      }
    }
    ctx.restore();
  }, [replayFrames, trace, resultByCell, activeIdx, showOverlay, hideLabels, confirmedItems, entry.id]);

  useEffect(() => {
    const pending: HTMLImageElement[] = [];
    for (const result of entry.results) {
      const url = result.icon?.dataUrl;
      if (!url) continue;
      const cachedIcon = labelIconsRef.current.get(url);
      if (cachedIcon?.complete && cachedIcon.naturalWidth > 0) continue;
      const icon = cachedIcon ?? new Image();
      labelIconsRef.current.set(url, icon);
      icon.onload = () => {
        lastDrawKey.current = '';
        draw();
      };
      if (!cachedIcon) icon.src = url;
      pending.push(icon);
    }
    return () => {
      for (const icon of pending) icon.onload = null;
    };
  }, [entry.results, draw]);

  // Keep the canvas backing store at CSS size x capped DPR, and redraw whenever the box changes size.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(wrapper.clientWidth * ratio));
      const h = Math.max(1, Math.round(wrapper.clientHeight * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        lastDrawKey.current = '';
        draw();
      }
    };
    const obs = new ResizeObserver(resize);
    obs.observe(wrapper);
    resize();
    return () => obs.disconnect();
  }, [draw]);

  useEffect(() => {
    lastDrawKey.current = '';
    draw();
  }, [draw]);

  // Redraw on seeks/pauses, and per presented frame while playing (requestVideoFrameCallback when available).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let handle = 0;
    let cancelled = false;
    const loop = () => {
      draw();
      if (cancelled || video.paused || video.ended) return;
      handle = 'requestVideoFrameCallback' in video ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelled = false;
      // Selection only makes sense on a still frame; starting playback releases it.
      onActiveChange(null);
      loop();
    };
    const events = ['loadedmetadata', 'seeked', 'timeupdate', 'pause', 'ended'] as const;
    for (const e of events) video.addEventListener(e, draw);
    video.addEventListener('play', onPlay);
    return () => {
      cancelled = true;
      if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      for (const e of events) video.removeEventListener(e, draw);
      video.removeEventListener('play', onPlay);
    };
  }, [draw, onActiveChange]);

  // List row -> video: jump to the keyframe closest to the cell's best observation and pause there.
  useEffect(() => {
    const video = videoRef.current;
    if (!focus || !video) return;
    const found = resultByCell.get(focus.cellId);
    let target: number | null = null;
    let bestDistance = Infinity;
    for (const frame of replayFrames) {
      const cell = frame.cells.find((c) => c.id === focus.cellId);
      if (!cell) continue;
      // Prefer the frame where the cell sits closest to the middle of the grid area (fully visible, least clipped).
      const middle = (frame.roi.y + frame.roi.bottom) / 2;
      const distance = Math.abs(cell.box.y + cell.box.h / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = frame.time;
      }
    }
    if (found && target !== null) {
      video.pause();
      video.currentTime = target;
    }
  }, [focus, replayFrames, resultByCell]);

  function jump(direction: 1 | -1) {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    const target = direction > 0 ? replayFrames.find((f) => f.time > current + 0.001) : replayFrames.findLast((f) => f.time < current - 0.001);
    if (target) {
      video.pause();
      video.currentTime = target.time;
    }
  }

  function hitTest(clientX: number, clientY: number): number | null {
    const wrapper = wrapperRef.current;
    const view = viewRef.current;
    if (!wrapper || !view) return null;
    const rect = wrapper.getBoundingClientRect();
    if (rect.bottom - clientY < CONTROL_STRIP_PX) return null;
    const fx = ((clientX - rect.left) / rect.width) * view.frame.width;
    const fy = ((clientY - rect.top) / rect.height) * view.frame.height - view.delta;
    for (const cell of view.frame.cells) {
      const { x, y, w, h } = cell.box;
      if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) return resultByCell.get(cell.id)?.index ?? null;
    }
    return null;
  }

  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
  const hasFrames = replayFrames.length > 0;

  return (
    <div>
      {/* The wrapper takes the video's exact aspect ratio (capped by viewport height), so canvas and video coincide with no letterbox math. */}
      <div
        ref={wrapperRef}
        className="relative mx-auto [--cap:45vh]"
        style={{ aspectRatio: `${width || 16} / ${height || 9}`, width: `min(100%, calc(var(--cap) * ${aspect}))` }}
        // Paused: hovering selects the cell under the pointer, and a click on a cell selects it instead of starting playback
        // (capture phase, so the native player never sees it). Playing, or off any cell: the click is left to the player.
        onMouseMove={(e) => {
          if (videoRef.current?.paused) onActiveChange(hitTest(e.clientX, e.clientY));
        }}
        onMouseLeave={() => {
          if (videoRef.current?.paused) onActiveChange(null);
        }}
        onClickCapture={(e) => {
          if (!videoRef.current?.paused) return;
          const index = hitTest(e.clientX, e.clientY);
          if (index === null) return;
          e.stopPropagation();
          e.preventDefault();
          onActiveChange(index === activeIdx ? null : index);
        }}
      >
        <video ref={videoRef} src={entry.objectUrl} controls playsInline preload="metadata" className="block w-full h-full bg-black" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-2">
        <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate">
          {caption.time.toFixed(2)}s · {caption.keyframe === null ? t('noOverlayHere') : `KF ${caption.keyframe + 1}/${replayFrames.length} · ${caption.cells}`}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => jump(-1)}
            disabled={!hasFrames}
            title={t('previousKeyframe')}
            aria-label={t('previousKeyframe')}
            className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
          >
            <FaChevronLeft className="text-xs" />
          </button>
          <button
            onClick={() => jump(1)}
            disabled={!hasFrames}
            title={t('nextKeyframe')}
            aria-label={t('nextKeyframe')}
            className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
          >
            <FaChevronRight className="text-xs" />
          </button>
          <button
            onClick={() => setShowOverlay((v) => !v)}
            aria-pressed={showOverlay}
            className={[
              'px-2 py-0.5 text-xs font-semibold border',
              showOverlay ? 'border-neutral-500 text-neutral-800 dark:text-neutral-200' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400',
            ].join(' ')}
          >
            {t('showOverlay')}
          </button>
        </div>
      </div>
    </div>
  );
}
