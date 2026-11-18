import { useState, useRef, useCallback, useEffect } from 'react';
import { FaChevronLeft, FaChevronRight, FaImage, FaCheck, FaTimes, FaTrash } from 'react-icons/fa';
import { FiChevronDown } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { ScanEntry, ScanResult } from '~/features/scanner/core/types';
import { makeInstanceKey } from '~/features/scanner/core/types';
import { resolveIconName } from '~/features/scanner/core/iconLoader';
import { ScannerItemIcon } from './ScannerItemIcon';
import { VideoOverlay } from './VideoOverlay';
import { OVERLAY_AMBER, OVERLAY_GREEN, OVERLAY_RED, SIMILARITY_FAIR, SIMILARITY_GOOD, formatQty, isConfidentVideoCell } from './overlayStyle';
import { CustomNumberInput } from '~/components/common/CustomInput';

interface Props {
  imageScanResults: ScanEntry[];
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  onEdit: (key: string, value: number) => void;
  onConfirm: (key: string) => void;
  onUnconfirm: (key: string) => void;
  onDeleteImage: (id: string) => void;
}

interface NatSize {
  w: number;
  h: number;
}

export function ScanOverlayViewer({ imageScanResults, editedValues, confirmedItems, onEdit, onConfirm, onUnconfirm, onDeleteImage }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const { t: t_planner } = useTranslation('planner');
  const [selectedImg, setSelectedImg] = useState(0);
  const [natSize, setNatSize] = useState<NatSize | null>(null);
  const [imgBoxSize, setImgBoxSize] = useState<NatSize | null>(null);
  const [svgHoveredIdx, setSvgHoveredIdx] = useState<number | null>(null);
  const [listHoveredIdx, setListHoveredIdx] = useState<number | null>(null);
  const [selectedResult, setSelectedResult] = useState<{ entryId: string; index: number } | null>(null);
  const [thumbnailsExpanded, setThumbnailsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [focus, setFocus] = useState<{ cellId: string; nonce: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const idx = Math.min(selectedImg, imageScanResults.length - 1);
  const current = imageScanResults[idx];

  const selectedIdx = selectedResult?.entryId === current?.id ? selectedResult.index : null;
  const activeIdx = listHoveredIdx ?? svgHoveredIdx ?? selectedIdx;

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
    setListHoveredIdx(null);
    setSelectedResult(null);
    setFocus(null);
  }

  if (imageScanResults.length === 0) return null;

  const recognized = current.results.filter((r) => r.icon);
  const unrecognized = current.results.filter((r) => !r.icon);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 border-b border-neutral-200 dark:border-neutral-700">
        <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          {current.kind === 'video' ? (
            t('videoPreview')
          ) : (
            <>
              <FaImage className="text-xs" />
              {t('screenshotPreview')}
            </>
          )}
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
              onDeleteImage(current.id);
              if (imageScanResults.length > 1 && idx > 0) switchImage(newIdx);
            }}
            className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
            title={t_planner('common.remove')}
            aria-label={t_planner('common.remove')}
          >
            <FaTrash className="text-xs" />
          </button>
        </div>
      </div>

      {/* Thumbnails */}
      {imageScanResults.length > 1 && (
        <div className="flex items-start gap-1 p-1.5 border-b border-neutral-200 dark:border-neutral-700">
          <div className={`flex flex-1 gap-1 ${thumbnailsExpanded ? 'flex-wrap' : 'overflow-x-auto'}`}>
            {imageScanResults.map((r, i) => (
              <div key={r.id} className="relative group shrink-0">
                <button
                  tabIndex={-1}
                  onClick={() => switchImage(i)}
                  className={[
                    'rounded border-2 overflow-hidden transition-colors',
                    i === idx ? 'border-blue-400 dark:border-blue-500' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500',
                  ].join(' ')}
                >
                  {r.kind === 'video' ? (
                    // #t=0.001 makes the browser paint the first frame as a thumbnail.
                    <video src={`${r.objectUrl}#t=0.001`} muted playsInline preload="metadata" className="h-12 w-auto object-contain pointer-events-none" />
                  ) : (
                    <img src={r.objectUrl} alt={r.fileName} className="h-12 w-auto object-contain" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newIdx = Math.max(0, i - 1);
                    onDeleteImage(r.id);
                    if (imageScanResults.length > 1 && i === idx && idx > 0) switchImage(newIdx);
                  }}
                  className="absolute top-0.5 right-0.5 p-1 rounded bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title={t_planner('common.remove')}
                  aria-label={t_planner('common.remove')}
                >
                  <FaTrash className="text-[10px]" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setThumbnailsExpanded((v) => !v)}
            title={thumbnailsExpanded ? t_planner('studentScanner.collapseList') : t_planner('studentScanner.expandList')}
            aria-label={thumbnailsExpanded ? t_planner('studentScanner.collapseList') : t_planner('studentScanner.expandList')}
            className="shrink-0 rounded border border-neutral-200 dark:border-neutral-700 p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <FiChevronDown className={`transition-transform ${thumbnailsExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {/* Media + overlay (image or video), and the per-entry item list. Video lays them out side by side on wide screens. */}
      <div>
        <div className={['p-2 sm:p-3', current.kind === 'video' ? 'relative sticky top-0 z-10 bg-white dark:bg-neutral-900' : ''].join(' ')}>
          <p className="text-xs text-neutral-500 font-mono mb-1.5 truncate" title={current.fileName}>
            {current.fileName}
          </p>

          {current.kind === 'video' ? (
            <VideoOverlay entry={current} confirmedItems={confirmedItems} activeIdx={activeIdx} onActiveChange={setSvgHoveredIdx} hideLabels={isMobile} focus={focus} />
          ) : (
            <div className="relative inline-block w-full">
              <img ref={imgRef} src={current.objectUrl} alt={current.fileName} onLoad={onImgLoad} className="w-full rounded object-contain max-h-96" />

              {natSize && imgBoxSize && (
                <BboxOverlay
                  results={current.results}
                  imageId={current.id}
                  natSize={natSize}
                  imgBoxSize={imgBoxSize}
                  svgHoveredIdx={svgHoveredIdx}
                  highlightIdx={activeIdx}
                  onHover={setSvgHoveredIdx}
                  hideLabels={isMobile}
                  confirmedItems={confirmedItems}
                />
              )}
            </div>
          )}

          {/* Reserve a detail row below the video so hover details never cover player controls or shift the video. */}
          {current.kind === 'video' && <div className="mt-1.5 h-14">{activeIdx !== null && current.results[activeIdx] && <HoveredItemInfo result={current.results[activeIdx]} />}</div>}
          {current.kind !== 'video' && svgHoveredIdx !== null && current.results[svgHoveredIdx] && (
            <div className="mt-1.5 h-14">
              <HoveredItemInfo result={current.results[svgHoveredIdx]} />
            </div>
          )}
        </div>

        {/* Per-entry item list */}
        <div className={current.kind === 'video' ? 'h-[55vh] overflow-hidden border-t border-neutral-200 dark:border-neutral-700' : undefined}>
          <PerImageItemList
            key={current.id}
            results={current.results}
            imageId={current.id}
            isVideo={current.kind === 'video'}
            editedValues={editedValues}
            confirmedItems={confirmedItems}
            activeIdx={activeIdx}
            onEdit={onEdit}
            onConfirm={onConfirm}
            onUnconfirm={onUnconfirm}
            onHoverIdx={setListHoveredIdx}
            onSelectRow={(index) => {
              if (current.kind === 'video') setSelectedResult({ entryId: current.id, index });
              const cellId = current.results[index]?.cellId;
              if (cellId) setFocus((prev) => ({ cellId, nonce: (prev?.nonce ?? 0) + 1 }));
            }}
            onConfirmAll={() => {
              current.results.forEach((r, i) => {
                const instanceKey = makeInstanceKey(current.id, i);
                // Video cells are only bulk-confirmed when their frames agreed; the rest need a manual look.
                const eligible = current.kind === 'video' ? isConfidentVideoCell(r) : !!r.icon;
                if (eligible && !confirmedItems[instanceKey]) onConfirm(instanceKey);
              });
            }}
            onNext={idx < imageScanResults.length - 1 ? () => switchImage(idx + 1) : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Bbox SVG Overlay ─────────────────────────────────────────────── */

interface BboxProps {
  results: ScanResult[];
  imageId: string;
  natSize: NatSize;
  imgBoxSize: NatSize;
  svgHoveredIdx: number | null;
  highlightIdx: number | null;
  onHover: (i: number | null) => void;
  hideLabels: boolean;
  confirmedItems: Record<string, boolean>;
}

function BboxOverlay({ results, imageId, natSize, imgBoxSize, svgHoveredIdx, highlightIdx, onHover, hideLabels, confirmedItems }: BboxProps) {
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

  const anyActive = svgHoveredIdx !== null || highlightIdx !== null;

  return (
    <svg className="absolute pointer-events-none" style={{ left: offsetX, top: offsetY, width: contentW, height: contentH }} viewBox={`0 0 ${contentW} ${contentH}`}>
      {results.map((r, i) => {
        const x = r.cell.x * scaleX;
        const y = r.cell.y * scaleY;
        const w = r.cell.w * scaleX;
        const h = r.cell.h * scaleY;

        const isSvgHovered = i === svgHoveredIdx;
        const isIdxHighlighted = highlightIdx === i;
        const isActive = isSvgHovered || isIdxHighlighted;
        const isConfirmed = !!r.icon && confirmedItems[makeInstanceKey(imageId, i)];

        const color = r.icon ? (r.similarity >= SIMILARITY_GOOD ? OVERLAY_GREEN : r.similarity >= SIMILARITY_FAIR ? OVERLAY_AMBER : OVERLAY_RED) : OVERLAY_RED;
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
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isActive ? `${color}18` : 'transparent'}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={isConfirmed ? '4 2' : undefined}
              opacity={opacity}
              rx={2}
            />

            {/* Confirmed badge — bottom-left corner, small green check */}
            {isConfirmed && !hideLabels && (
              <g opacity={opacity}>
                <circle cx={x + 7} cy={y + h - 7} r={6} fill="#4ade80" />
                <path d={`M${x + 4} ${y + h - 7} l2 2.5 l4 -5`} stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

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
  imageId: string;
  /** Video entries add a needs-review filter and paging, since a scan can hold hundreds of cells. */
  isVideo: boolean;
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  activeIdx: number | null;
  onEdit: (key: string, value: number) => void;
  onConfirm: (key: string) => void;
  onUnconfirm: (key: string) => void;
  onHoverIdx: (index: number | null) => void;
  /** Called when a row is clicked, so a video can seek to the cell. */
  onSelectRow: (index: number) => void;
  onConfirmAll: () => void;
  onNext?: () => void;
}

interface IndexedResult {
  r: ScanResult;
  index: number;
}

const VIDEO_PAGE_SIZE = 60;

function confidenceColor(s: number): string {
  if (s >= SIMILARITY_GOOD) return 'text-green-400';
  if (s >= SIMILARITY_FAIR) return 'text-amber-400';
  return 'text-red-400';
}

/** Sort scan results in reading order (top→bottom, left→right) using cell bbox positions. */
function sortByGridPosition(items: IndexedResult[]): IndexedResult[] {
  if (items.length < 2) return items;

  const withCenter = items.map((item) => ({
    item,
    cx: item.r.cell.x + item.r.cell.w / 2,
    cy: item.r.cell.y + item.r.cell.h / 2,
  }));

  const heights = items.map(({ r }) => r.cell.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const rowTol = medianH * 0.55;

  withCenter.sort((a, b) => a.cy - b.cy);

  const rows: (typeof withCenter)[] = [];
  let cur: typeof withCenter = [];
  for (const entry of withCenter) {
    if (cur.length === 0 || entry.cy - cur[0].cy <= rowTol) {
      cur.push(entry);
    } else {
      rows.push(cur);
      cur = [entry];
    }
  }
  if (cur.length > 0) rows.push(cur);

  return rows.flatMap((row) => row.sort((a, b) => a.cx - b.cx).map((x) => x.item));
}

function PerImageItemList({
  results,
  imageId,
  isVideo,
  editedValues,
  confirmedItems,
  activeIdx,
  onEdit,
  onConfirm,
  onUnconfirm,
  onHoverIdx,
  onSelectRow,
  onConfirmAll,
  onNext,
}: PerImageItemListProps) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const { t: t_ui } = useTranslation('ui');
  const [filter, setFilter] = useState<'needs' | 'all' | 'duplicates'>('needs');
  const [visibleCount, setVisibleCount] = useState(VIDEO_PAGE_SIZE);

  // Every detected cell gets its own row — two stacks of the same item are two distinct instances, not duplicates to collapse.
  const indexed: IndexedResult[] = results.map((r, index) => ({ r, index })).filter(({ r }) => r.icon);
  const sorted = sortByGridPosition(indexed);
  const isConfirmed = (index: number) => confirmedItems[makeInstanceKey(imageId, index)];
  // Review status depends only on the reading's confidence, so a cell stays in the tab (shown as confirmed) after the user confirms it.
  const needsReview = (r: ScanResult) => !isConfidentVideoCell(r);
  const needsCount = isVideo ? sorted.filter(({ r }) => needsReview(r)).length : 0;
  const pendingReviewCount = isVideo ? sorted.filter(({ r, index }) => needsReview(r) && !isConfirmed(index)).length : 0;
  const occurrences = new Map<string, number>();
  for (const { r } of sorted) {
    if (r.icon) occurrences.set(r.icon.inventoryKey, (occurrences.get(r.icon.inventoryKey) ?? 0) + 1);
  }
  const duplicateKeys = [...occurrences].filter(([, count]) => count > 1).map(([key]) => key);
  const duplicateOrder = new Map(duplicateKeys.map((key, index) => [key, index]));
  const filtered =
    isVideo && filter === 'needs'
      ? sorted.filter(({ r }) => needsReview(r))
      : isVideo && filter === 'duplicates'
        ? sorted
            .filter(({ r }) => r.icon && duplicateOrder.has(r.icon.inventoryKey))
            .sort((a, b) => (duplicateOrder.get(a.r.icon?.inventoryKey ?? '') ?? 0) - (duplicateOrder.get(b.r.icon?.inventoryKey ?? '') ?? 0))
        : sorted;
  const items = isVideo ? filtered.slice(0, visibleCount) : filtered;
  const recognizedCount = sorted.length;
  const unconfirmedCount = sorted.filter(({ r, index }) => r.icon && !isConfirmed(index) && (!isVideo || isConfidentVideoCell(r))).length;

  if (sorted.length === 0 && !onNext) return null;

  const primaryButton = 'px-2.5 py-0.5 text-xs font-semibold text-neutral-900 hover:opacity-90 flex items-center gap-1';
  const secondaryButton =
    'px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400 flex items-center gap-1';

  return (
    <div className={`border-t border-neutral-200 dark:border-neutral-700 p-2 sm:p-3 lg:border-t-0${isVideo ? ' flex h-full min-h-0 flex-col' : ''}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between mb-1.5 sm:mb-2 gap-2">
        {isVideo ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => {
                setFilter('needs');
                setVisibleCount(VIDEO_PAGE_SIZE);
              }}
              aria-pressed={filter === 'needs'}
              className={filter === 'needs' ? `${secondaryButton} border-neutral-500 text-neutral-800 dark:text-neutral-200` : secondaryButton}
            >
              {t('reviewNeeds', { count: needsCount })}
            </button>
            <button
              onClick={() => {
                setFilter('all');
                setVisibleCount(VIDEO_PAGE_SIZE);
              }}
              aria-pressed={filter === 'all'}
              className={filter === 'all' ? `${secondaryButton} border-neutral-500 text-neutral-800 dark:text-neutral-200` : secondaryButton}
            >
              {t('reviewAll', { count: sorted.length })}
            </button>
            <button
              onClick={() => {
                setFilter('duplicates');
                setVisibleCount(VIDEO_PAGE_SIZE);
              }}
              aria-pressed={filter === 'duplicates'}
              className={filter === 'duplicates' ? `${secondaryButton} border-neutral-500 text-neutral-800 dark:text-neutral-200` : secondaryButton}
            >
              {t('reviewDuplicates', { count: duplicateKeys.length })}
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">{recognizedCount > 0 ? t('itemCountRecognized', { count: recognizedCount, plural: recognizedCount !== 1 ? 's' : '' }) : t('noItemsRecognized')}</p>
        )}
        <div className="flex items-center gap-1.5">
          {isVideo ? (
            <>
              {unconfirmedCount > 0 && (
                <button onClick={onConfirmAll} className={primaryButton} style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}>
                  <FaCheck className="text-[10px]" />
                  {t('confirmAllConfident')}
                </button>
              )}
              {filter === 'needs' && pendingReviewCount > 0 && (
                // Confirms every cell still under review (not just the visible page), after the user has looked through the filter.
                <button onClick={() => sorted.forEach(({ r, index }) => needsReview(r) && !isConfirmed(index) && onConfirm(makeInstanceKey(imageId, index)))} className={secondaryButton}>
                  <FaCheck className="text-[10px]" />
                  {t('confirmNeedsReview', { count: pendingReviewCount })}
                </button>
              )}
              {onNext && (
                <button onClick={onNext} className={secondaryButton}>
                  {t('next')}
                  <FaChevronRight className="text-[10px]" />
                </button>
              )}
            </>
          ) : unconfirmedCount > 0 && onNext ? (
            <>
              <button
                onClick={() => {
                  onConfirmAll();
                  onNext();
                }}
                className={primaryButton}
                style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
              >
                <FaCheck className="text-[10px]" />
                {t('confirmAllNext')}
                <FaChevronRight className="text-[10px]" />
              </button>
              <button onClick={onNext} className={secondaryButton}>
                {t('next')}
                <FaChevronRight className="text-[10px]" />
              </button>
            </>
          ) : unconfirmedCount > 0 ? (
            <button onClick={onConfirmAll} className={primaryButton} style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}>
              <FaCheck className="text-[10px]" />
              {t('confirmAll')}
            </button>
          ) : onNext ? (
            <button onClick={onNext} className={primaryButton} style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}>
              {t('next')}
              <FaChevronRight className="text-[10px]" />
            </button>
          ) : null}
        </div>
      </div>

      {isVideo && filter === 'duplicates' && <p className="mb-2 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{t(duplicateKeys.length > 0 ? 'duplicatesHint' : 'noDuplicates')}</p>}

      {items.length > 0 && (
        <div
          className={
            isVideo
              ? 'grid min-h-0 flex-1 grid-cols-1 content-start gap-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
              : 'grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }
        >
          {items.map(({ r, index }) => {
            const instanceKey = makeInstanceKey(imageId, index);
            const confirmed = confirmedItems[instanceKey] ?? false;
            const qty = editedValues[instanceKey] ?? r.quantity;
            const isHighlighted = activeIdx === index;
            const icon = r.icon;
            const rowClass = [
              'flex items-center gap-2 px-1.5 py-1 sm:px-2 sm:py-1.5 transition-colors cursor-pointer', // border-l-2',
              // confirmed ? 'border-l-green-400 dark:border-l-green-500' : 'border-l-transparent',
              isHighlighted ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-400/50 dark:ring-blue-700/50' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/50',
            ].join(' ');
            const rowHandlers = {
              onMouseEnter: () => onHoverIdx(index),
              onMouseLeave: () => onHoverIdx(null),
              onClick: () => {
                onSelectRow(index);
              },
            };

            if (!icon) return null;

            const name = resolveIconName(icon, i18n.language);
            return (
              <div key={instanceKey} className={rowClass} {...rowHandlers}>
                <ScannerItemIcon inventoryKey={icon.inventoryKey} amount={0} size={7} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-800 dark:text-neutral-200 truncate leading-tight" title={name}>
                    {name}
                  </p>
                  <p className={`text-xs font-mono ${confidenceColor(r.similarity)}`}>{(r.similarity * 100).toFixed(0)}%</p>
                </div>
                {confirmed ? (
                  <div className="flex items-center gap-1.5">
                    <FaCheck className="text-xs text-green-500 dark:text-green-400" />
                    <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">{qty.toLocaleString()}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnconfirm(instanceKey);
                      }}
                      className="ml-0.5 rounded p-0.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title={t_ui('cancel')}
                    >
                      <FaTimes className="text-[10px]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <CustomNumberInput
                      min={0}
                      value={qty}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onEdit(instanceKey, Math.max(0, e || 0))}
                      className="w-20 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-0.5 text-right text-neutral-800 dark:text-neutral-200 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfirm(instanceKey);
                      }}
                      className="shrink-0 px-2 py-0.5 text-xs font-semibold text-neutral-900 transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
                    >
                      {t_ui('confirm')}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isVideo && filtered.length > visibleCount && (
        <button onClick={() => setVisibleCount((n) => n + VIDEO_PAGE_SIZE)} className={`${secondaryButton} mt-2`}>
          {t('showMore', { count: filtered.length - visibleCount })}
        </button>
      )}
    </div>
  );
}

/* ── Hovered item detail panel ────────────────────────────────────── */

function HoveredItemInfo({ result }: { result: ScanResult }) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  return (
    <div className="flex h-full items-center gap-2 border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-2.5 sm:px-3">
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
                  <span className={`ml-1 ${confidenceColor(result.quantityConfidence)}`}>
                    ({(result.quantityConfidence * 100).toFixed(1)}% {t('qtyConfidence')})
                  </span>
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
