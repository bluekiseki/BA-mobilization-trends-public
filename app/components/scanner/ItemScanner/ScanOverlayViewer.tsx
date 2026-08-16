import { useState, useRef, useCallback, useEffect } from 'react';
import { FaChevronLeft, FaChevronRight, FaImage, FaCheck, FaTimes, FaTrash } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ImageScanResult, ScanResult } from '~/scanner/types';
import { resolveIconName } from '~/scanner/iconLoader';
import { ScannerItemIcon } from './ScannerItemIcon';
import { CustomNumberInput } from '~/components/CustomInput';

interface Props {
  imageScanResults: ImageScanResult[];
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  onEdit: (key: string, value: number) => void;
  onConfirm: (key: string) => void;
  onUnconfirm: (key: string) => void;
  onDeleteImage: (fileName: string) => void;
}

interface NatSize {
  w: number;
  h: number;
}

export function ScanOverlayViewer({ imageScanResults, editedValues, confirmedItems, onEdit, onConfirm, onUnconfirm, onDeleteImage }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [selectedImg, setSelectedImg] = useState(0);
  const [natSize, setNatSize] = useState<NatSize | null>(null);
  const [imgBoxSize, setImgBoxSize] = useState<NatSize | null>(null);
  const [svgHoveredIdx, setSvgHoveredIdx] = useState<number | null>(null);
  const [listHoveredKey, setListHoveredKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const idx = Math.min(selectedImg, imageScanResults.length - 1);
  const current = imageScanResults[idx];

  const svgHoveredKey = svgHoveredIdx !== null ? (current.results[svgHoveredIdx]?.icon?.inventoryKey ?? null) : null;
  const activeKey = listHoveredKey ?? svgHoveredKey;

  // Track the img element's rendered box size via ResizeObserver
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const obs = new ResizeObserver(() => {
      const r = img.getBoundingClientRect();
      if (r.width > 0) setImgBoxSize({ w: r.width, h: r.height });
    });
    obs.observe(img);
    const r = img.getBoundingClientRect();
    if (r.width > 0) setImgBoxSize({ w: r.width, h: r.height });
    return () => obs.disconnect();
  }, [idx]);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNatSize({ w: img.naturalWidth, h: img.naturalHeight });
    const r = img.getBoundingClientRect();
    if (r.width > 0) setImgBoxSize({ w: r.width, h: r.height });
  }, []);

  function switchImage(i: number) {
    setSelectedImg(i);
    setNatSize(null);
    setImgBoxSize(null);
    setSvgHoveredIdx(null);
    setListHoveredKey(null);
  }

  if (imageScanResults.length === 0) return null;

  const recognized = current.results.filter((r) => r.icon);
  const unrecognized = current.results.filter((r) => !r.icon);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 border-b border-neutral-200 dark:border-neutral-700">
        <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <FaImage className="text-xs" />
          {t('screenshotPreview')}
          <span className="rounded bg-green-100 dark:bg-green-900/60 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-300">{t('itemRecognized', { count: recognized.length })}</span>
          {unrecognized.length > 0 && (
            <span className="rounded bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-600 dark:text-neutral-400">{t('itemUnknown', { count: unrecognized.length })}</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {imageScanResults.length > 1 && (
            <>
              <button
                onClick={() => switchImage(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
              >
                <FaChevronLeft className="text-xs" />
              </button>
              <span className="text-xs text-neutral-500 w-16 text-center">
                {idx + 1} / {imageScanResults.length}
              </span>
              <button
                onClick={() => switchImage(Math.min(imageScanResults.length - 1, idx + 1))}
                disabled={idx === imageScanResults.length - 1}
                className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
              >
                <FaChevronRight className="text-xs" />
              </button>
            </>
          )}
          <button
            onClick={() => {
              const newIdx = Math.max(0, idx - 1);
              onDeleteImage(current.fileName);
              if (imageScanResults.length > 1 && idx > 0) switchImage(newIdx);
            }}
            className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
            title="Delete this image"
          >
            <FaTrash className="text-xs" />
          </button>
        </div>
      </div>

      {/* Thumbnails */}
      {imageScanResults.length > 1 && (
        <div className="flex gap-1 p-1.5 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {imageScanResults.map((r, i) => (
            <div key={r.fileName} className="relative group shrink-0">
              <button
                tabIndex={-1}
                onClick={() => switchImage(i)}
                className={[
                  'rounded border-2 overflow-hidden transition-colors',
                  i === idx ? 'border-sky-400' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500',
                ].join(' ')}
              >
                <img src={r.objectUrl} alt={r.fileName} className="h-12 w-auto object-contain" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newIdx = Math.max(0, i - 1);
                  onDeleteImage(r.fileName);
                  if (imageScanResults.length > 1 && i === idx && idx > 0) switchImage(newIdx);
                }}
                className="absolute top-0.5 right-0.5 p-1 rounded bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Delete this image"
              >
                <FaTrash className="text-[10px]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image + overlay */}
      <div className="p-2 sm:p-3">
        <p className="text-xs text-neutral-500 font-mono mb-1.5 truncate">{current.fileName}</p>

        <div className="relative inline-block w-full">
          <img ref={imgRef} src={current.objectUrl} alt={current.fileName} onLoad={onImgLoad} className="w-full rounded object-contain max-h-96" />

          {natSize && imgBoxSize && (
            <BboxOverlay results={current.results} natSize={natSize} imgBoxSize={imgBoxSize} svgHoveredIdx={svgHoveredIdx} highlightKey={activeKey} onHover={setSvgHoveredIdx} hideLabels={isMobile} />
          )}
        </div>

        {/* Detail panel for the result hovered on the SVG */}
        {svgHoveredIdx !== null && current.results[svgHoveredIdx] && <HoveredItemInfo result={current.results[svgHoveredIdx]} />}
      </div>

      {/* Per-image item list */}
      <PerImageItemList
        results={current.results}
        editedValues={editedValues}
        confirmedItems={confirmedItems}
        activeKey={activeKey}
        onEdit={onEdit}
        onConfirm={onConfirm}
        onUnconfirm={onUnconfirm}
        onHoverKey={setListHoveredKey}
        onConfirmAll={() => {
          for (const r of current.results) {
            if (r.icon && !confirmedItems[r.icon.inventoryKey]) onConfirm(r.icon.inventoryKey);
          }
        }}
        onNext={idx < imageScanResults.length - 1 ? () => switchImage(idx + 1) : undefined}
      />
    </div>
  );
}

/* ── Bbox SVG Overlay ─────────────────────────────────────────────── */

interface BboxProps {
  results: ScanResult[];
  natSize: NatSize;
  imgBoxSize: NatSize;
  svgHoveredIdx: number | null;
  highlightKey: string | null;
  onHover: (i: number | null) => void;
  hideLabels: boolean;
}

function formatQty(n: number): string {
  if (n >= 1_000_000) return `×${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `×${Math.round(n / 1_000)}K`;
  return `×${n}`;
}

function BboxOverlay({ results, natSize, imgBoxSize, svgHoveredIdx, highlightKey, onHover, hideLabels }: BboxProps) {
  // Calculate actual content area within the img element box (object-contain letterboxing)
  const natAspect = natSize.w / natSize.h;
  const boxAspect = imgBoxSize.w / imgBoxSize.h;
  let contentW: number, contentH: number, offsetX: number, offsetY: number;
  if (natAspect >= boxAspect) {
    contentW = imgBoxSize.w;
    contentH = imgBoxSize.w / natAspect;
    offsetX = 0;
    offsetY = (imgBoxSize.h - contentH) / 2;
  } else {
    contentH = imgBoxSize.h;
    contentW = imgBoxSize.h * natAspect;
    offsetX = (imgBoxSize.w - contentW) / 2;
    offsetY = 0;
  }
  const scaleX = contentW / natSize.w;
  const scaleY = contentH / natSize.h;

  const anyActive = svgHoveredIdx !== null || highlightKey !== null;

  return (
    <svg className="absolute pointer-events-none" style={{ left: offsetX, top: offsetY, width: contentW, height: contentH }} viewBox={`0 0 ${contentW} ${contentH}`}>
      {results.map((r, i) => {
        const x = r.cell.x * scaleX;
        const y = r.cell.y * scaleY;
        const w = r.cell.w * scaleX;
        const h = r.cell.h * scaleY;

        const isSvgHovered = i === svgHoveredIdx;
        const isKeyHighlighted = highlightKey !== null && r.icon?.inventoryKey === highlightKey;
        const isActive = isSvgHovered || isKeyHighlighted;

        const color = r.icon ? (r.similarity >= 0.6 ? '#4ade80' : r.similarity >= 0.5 ? '#facc15' : '#f87171') : '#f87171';
        const opacity = anyActive ? (isActive ? 1 : 0.2) : 0.65;
        const strokeWidth = isActive ? 2.5 : 1.5;

        // Similarity label — flush outside top-left corner of bbox
        const simStr = `${(r.similarity * 100).toFixed(0)}%`;
        const simLabelW = simStr.length * 5.5 + 7;
        const simRectY = y - 13;

        // Quantity label with icon — flush inside top-right corner of bbox
        const qtyStr = r.quantity > 0 ? formatQty(r.quantity) : null;
        const iconSize = 9;
        const hasIcon = !!r.icon?.dataUrl;
        const qtyTextW = qtyStr ? qtyStr.length * 5.5 : 0;
        const qtyLabelW = qtyStr ? (hasIcon ? iconSize + 3 + qtyTextW + 8 : qtyTextW + 8) : 0;
        const qtyRectX = x + w - qtyLabelW;

        return (
          <g key={i} style={{ pointerEvents: 'all', cursor: 'pointer' }} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            <rect x={x} y={y} width={w} height={h} fill={isActive ? `${color}18` : 'transparent'} stroke={color} strokeWidth={strokeWidth} opacity={opacity} rx={2} />

            {/* Similarity label — outside top-left, flush against bbox */}
            {!hideLabels && (
              <>
                <rect x={x} y={simRectY} width={simLabelW} height={13} fill="rgba(0,0,0,0.72)" rx={2} opacity={opacity} />
                <text x={x + 3} y={simRectY + 10} fontSize={9} fill={color} fontWeight="bold" opacity={opacity}>
                  {simStr}
                </text>
              </>
            )}

            {/* Quantity label — inside top-right, flush against bbox */}
            {qtyStr && !hideLabels && (
              <>
                <rect x={qtyRectX} y={y} width={qtyLabelW} height={13} fill="rgba(0,0,0,0.72)" rx={2} opacity={opacity} />
                {hasIcon && r.icon && <image href={r.icon.dataUrl} x={qtyRectX + 3} y={y + 2} width={iconSize} height={iconSize} opacity={opacity} />}
                <text x={hasIcon ? qtyRectX + 3 + iconSize + 2 : qtyRectX + 3} y={y + 10} fontSize={9} fill="white" fontWeight="bold" opacity={opacity}>
                  {qtyStr}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Per-image item list ──────────────────────────────────────────── */

interface PerImageItemListProps {
  results: ScanResult[];
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  activeKey: string | null;
  onEdit: (key: string, value: number) => void;
  onConfirm: (key: string) => void;
  onUnconfirm: (key: string) => void;
  onHoverKey: (key: string | null) => void;
  onConfirmAll: () => void;
  onNext?: () => void;
}

function confidenceColor(s: number): string {
  if (s >= 0.6) return 'text-green-400';
  if (s >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

/** Sort scan results in reading order (top→bottom, left→right) using cell bbox positions. */
function sortByGridPosition(items: ScanResult[]): ScanResult[] {
  if (items.length < 2) return items;

  const withCenter = items.map((r) => ({
    r,
    cx: r.cell.x + r.cell.w / 2,
    cy: r.cell.y + r.cell.h / 2,
  }));

  const heights = items.map((r) => r.cell.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const rowTol = medianH * 0.55;

  withCenter.sort((a, b) => a.cy - b.cy);

  const rows: (typeof withCenter)[] = [];
  let cur: typeof withCenter = [];
  for (const item of withCenter) {
    if (cur.length === 0 || item.cy - cur[0].cy <= rowTol) {
      cur.push(item);
    } else {
      rows.push(cur);
      cur = [item];
    }
  }
  if (cur.length > 0) rows.push(cur);

  return rows.flatMap((row) => row.sort((a, b) => a.cx - b.cx).map((x) => x.r));
}

function PerImageItemList({ results, editedValues, confirmedItems, activeKey, onEdit, onConfirm, onUnconfirm, onHoverKey, onConfirmAll, onNext }: PerImageItemListProps) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  // Deduplicate recognized items by inventoryKey (keep highest similarity)
  const seen = new Map<string, ScanResult>();
  for (const r of results) {
    if (!r.icon) continue;
    const key = r.icon.inventoryKey;
    const existing = seen.get(key);
    if (!existing || r.similarity > existing.similarity) {
      seen.set(key, r);
    }
  }
  const items = sortByGridPosition(Array.from(seen.values()));
  const unconfirmedCount = items.filter((r) => r.icon && !confirmedItems[r.icon.inventoryKey]).length;

  if (items.length === 0 && !onNext) return null;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 p-2 sm:p-3">
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <p className="text-xs text-neutral-500">{items.length > 0 ? t('itemCountRecognized', { count: items.length, plural: items.length !== 1 ? 's' : '' }) : t('noItemsRecognized')}</p>
        <div className="flex items-center gap-1.5">
          {unconfirmedCount > 0 && onNext ? (
            <>
              <button
                onClick={() => {
                  onConfirmAll();
                  onNext();
                }}
                className="px-2.5 py-0.5 text-xs font-semibold text-neutral-900 hover:opacity-90 flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
              >
                <FaCheck className="text-[10px]" />
                {t('confirmAllNext')}
                <FaChevronRight className="text-[10px]" />
              </button>
              <button
                onClick={onNext}
                className="px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400 flex items-center gap-1"
              >
                {t('next')}
                <FaChevronRight className="text-[10px]" />
              </button>
            </>
          ) : unconfirmedCount > 0 ? (
            <button
              onClick={onConfirmAll}
              className="px-2.5 py-0.5 text-xs font-semibold text-neutral-900 hover:opacity-90 flex items-center gap-1"
              style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
            >
              <FaCheck className="text-[10px]" />
              {t('confirmAll')}
            </button>
          ) : onNext ? (
            <button onClick={onNext} className="px-2.5 py-0.5 text-xs font-semibold text-neutral-900 hover:opacity-90 flex items-center gap-1" style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}>
              {t('next')}
              <FaChevronRight className="text-[10px]" />
            </button>
          ) : null}
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((r) => {
            if (!r.icon) return null;
            const key = r.icon.inventoryKey;
            const confirmed = confirmedItems[key] ?? false;
            const qty = editedValues[key] ?? r.quantity;
            const isHighlighted = activeKey === key;

            return (
              <div
                key={key}
                onMouseEnter={() => onHoverKey(key)}
                onMouseLeave={() => onHoverKey(null)}
                onClick={() => onHoverKey(activeKey === key ? null : key)}
                className={[
                  'flex items-center gap-2 px-1.5 py-1 sm:px-2 sm:py-1.5 transition-colors cursor-pointer border-l-2',
                  confirmed
                    ? 'border-l-green-400 dark:border-l-green-500'
                    : isHighlighted
                      ? 'bg-sky-50 dark:bg-sky-900/30 ring-1 ring-inset ring-sky-400/50 dark:ring-sky-700/50 border-l-transparent'
                      : 'border-l-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800/50',
                ].join(' ')}
              >
                <ScannerItemIcon inventoryKey={key} amount={0} size={7} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-800 dark:text-neutral-200 truncate leading-tight">{resolveIconName(r.icon, i18n.language)}</p>
                  <p className={`text-xs font-mono ${confidenceColor(r.similarity)}`}>{(r.similarity * 100).toFixed(0)}%</p>
                </div>
                {confirmed ? (
                  <div className="flex items-center gap-1.5 text-green-400">
                    <FaCheck className="text-xs" />
                    <span className="text-xs font-mono">{qty.toLocaleString()}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnconfirm(key);
                      }}
                      className="ml-0.5 rounded p-0.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title={t('cancelTitle')}
                    >
                      <FaTimes className="text-[10px]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <CustomNumberInput
                      // type="number"
                      min={0}
                      value={qty}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onEdit(key, Math.max(0, e || 0))}
                      className="w-20 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-0.5 text-right text-neutral-800 dark:text-neutral-200 text-xs focus:border-sky-500 focus:outline-none"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfirm(key);
                      }}
                      className="shrink-0 px-2 py-0.5 text-xs font-semibold text-neutral-900 transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
                    >
                      {t('okButton')}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Hovered item detail panel ────────────────────────────────────── */

function HoveredItemInfo({ result }: { result: ScanResult }) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  return (
    <div className="mt-1.5 flex items-center gap-2 border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 sm:px-3 sm:py-2">
      {result.icon ? (
        <>
          <ScannerItemIcon inventoryKey={result.icon.inventoryKey} amount={0} size={8} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{resolveIconName(result.icon, i18n.language)}</p>
            <p className="text-xs text-neutral-500 font-mono">
              {result.icon.inventoryKey}
              <span className={`ml-2 ${confidenceColor(result.similarity)}`}>
                {(result.similarity * 100).toFixed(1)}% {t('confidence')}
              </span>
              {result.quantity > 0 && (
                <span className="ml-2 text-neutral-600 dark:text-neutral-400">
                  {t('quantity')} {result.quantity.toLocaleString()}
                </span>
              )}
            </p>
          </div>
        </>
      ) : (
        <div className="text-sm text-neutral-500">
          {t('unknownItem')}
          <span className="ml-2 text-red-500 dark:text-red-400 font-mono text-xs">
            {(result.similarity * 100).toFixed(1)}% {t('belowThreshold')}
          </span>
        </div>
      )}
    </div>
  );
}
