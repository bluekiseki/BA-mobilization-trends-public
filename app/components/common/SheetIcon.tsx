import { useEffect, useState } from 'react';
import { getLoadedIconSheet, iconSheetStyle, loadFinalIconSheet, loadIconSheet, type IconSheet, type IconSheetName } from '~/utils/iconSheet';

/** Loads a sprite sheet once (shared across the page) and returns it, or null while loading / on failure. */
export function useIconSheet(name: IconSheetName): IconSheet | null {
  const [sheet, setSheet] = useState<IconSheet | null>(() => getLoadedIconSheet(name));
  useEffect(() => {
    let alive = true;
    // Show the first sheet that arrives, then swap to the sharper one when it is ready (same sheet on phones)
    const show = (s: IconSheet) => {
      if (alive) setSheet(s);
    };
    loadIconSheet(name).then(show, () => undefined); // the caller shows its fallback
    loadFinalIconSheet(name).then(show, () => undefined);
    return () => {
      alive = false;
    };
  }, [name]);
  return sheet;
}

interface SheetIconProps {
  sheet: IconSheetName;
  id: string | number;
  alt: string;
  className?: string;
  /** Extra inline style (e.g. a mask), merged over the sprite background. */
  style?: React.CSSProperties;
  /** Rendered while the sheet loads or when the id is not on the sheet. */
  fallback?: React.ReactNode;
}

/** One icon out of a sprite sheet. Fills its parent like `<img className="w-full h-full object-cover">` did. */
export function SheetIcon({ sheet: name, id, alt, className = 'w-full h-full', style: extraStyle, fallback = null }: SheetIconProps) {
  const sheet = useIconSheet(name);
  const style = sheet ? iconSheetStyle(sheet, id) : null;
  if (!style) return <>{fallback}</>;
  return <span role="img" aria-label={alt} className={`block ${className}`} style={{ ...style, ...extraStyle }} />;
}

interface SheetSvgIconProps {
  sheet: IconSheetName;
  id: string | number;
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath?: string;
  preserveAspectRatio?: string;
  /**
   * Id of an <image> already in the document (see `SheetImageDef`) to reference with <use>
   * instead of rendering this instance's own <image>. Pass this when a parent renders many
   * `SheetSvgIcon`s off the same sheet (e.g. a treemap's leaves) — one decoded/rescaled bitmap
   * shared via <use>, instead of each instance decoding and rescaling its own copy.
   * Omit it for a one-off icon; a plain <image> is simplest there.
   */
  sharedDefId?: string;
}

/**
 * Renders the <image> that `sharedDefId` on `SheetSvgIcon` points at. The caller mounts exactly
 * one of these for a given sheet (e.g. once per treemap) and passes the same id down to every
 * `SheetSvgIcon` instance that should share it.
 */
export function SheetImageDef({ sheet: name, id }: { sheet: IconSheetName; id: string }) {
  const sheet = useIconSheet(name);
  if (!sheet) return null;
  return <image id={id} href={sheet.url} width={sheet.index.size[0]} height={sheet.index.size[1]} />;
}

/** One sprite-sheet icon inside an SVG: a nested <svg> whose viewBox crops the shared sheet image. Renders nothing until the sheet is loaded. */
export function SheetSvgIcon({ sheet: name, id, x, y, width, height, clipPath, preserveAspectRatio, sharedDefId }: SheetSvgIconProps) {
  const sheet = useIconSheet(name);
  const pos = sheet?.index.items[String(id)];
  if (!sheet || !pos) return null;
  const [cw, ch] = sheet.index.cell;
  return (
    // The clip sits on a wrapper: on the nested <svg> itself it would resolve in the viewBox coordinate system.
    <g clipPath={clipPath}>
      <svg x={x} y={y} width={width} height={height} viewBox={`${pos[0]} ${pos[1]} ${cw} ${ch}`} preserveAspectRatio={preserveAspectRatio} overflow="hidden">
        {sharedDefId ? <use href={`#${sharedDefId}`} /> : <image href={sheet.url} width={sheet.index.size[0]} height={sheet.index.size[1]} />}
      </svg>
    </g>
  );
}
