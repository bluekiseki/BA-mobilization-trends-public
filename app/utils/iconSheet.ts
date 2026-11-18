import type { CSSProperties } from 'react';
import type { CollectedLink } from '~/types/link';
import { cdn } from './cdn';

/** `student_hd` is the 2x student sheet on its own, for places that need it on every device (large icons). */
export type IconSheetName = 'student' | 'student_hd' | 'buff';

/** Packed icon metadata served at w/icons/{name}.json. */
export interface IconSheetIndex {
  cell: [number, number];
  columns: number;
  size: [number, number];
  items: Record<string, [number, number]>;
}

export interface IconSheet {
  index: IconSheetIndex;
  url: string;
}

const HD_SHEET_MEDIA = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

/** Large screens with a mouse also load the 2x student sheet (student_hd); phones and tablets keep the small one. */
function hasHdSheet(name: IconSheetName): boolean {
  return name === 'student' && typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(HD_SHEET_MEDIA).matches;
}

/** <link rel="preload"> entries for the student sheet, mirroring what startLoad fetches so the requests start from the HTML head. */
export function studentSheetPreloadLinks(): CollectedLink[] {
  const links: CollectedLink[] = [];
  for (const [file, media, imagePriority] of [
    ['student', undefined, undefined],
    ['student_hd', HD_SHEET_MEDIA, 'low'],
  ] as const) {
    links.push({ rel: 'preload', href: cdn(`/w/icons/${file}.json`), as: 'fetch', crossOrigin: 'anonymous', media });
    links.push({ rel: 'preload', href: cdn(`/w/icons/${file}.webp`), as: 'image', media, fetchPriority: imagePriority });
  }
  return links;
}

async function fetchSheet(file: string, priority: 'auto' | 'low' = 'auto'): Promise<IconSheet> {
  const res = await fetch(cdn(`/w/icons/${file}.json`), { priority });
  if (!res.ok) throw new Error(`icon sheet index ${file}: ${res.status}`);
  const index: IconSheetIndex = await res.json();
  return { index, url: cdn(`/w/icons/${file}.webp`) };
}

// Kept for the whole session: a referenced, decoded bitmap is less likely to be dropped from memory,
// which would leave the CSS backgrounds transparent for a moment after navigating back to a page.
// Keyed by file so a failed load's retry (see `forget` in getSheetLoad) replaces its own slot
// instead of accumulating a new decoded bitmap on every retry.
const retainedImages = new Map<string, HTMLImageElement>();

/** Resolves once the browser has the sheet image, so the sheet can be swapped in without a blank frame. */
async function fetchSheetWithImage(file: string, priority: 'auto' | 'low' = 'auto'): Promise<IconSheet> {
  const sheet = await fetchSheet(file, priority);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`icon sheet image ${file}`));
    img.fetchPriority = priority;
    img.src = sheet.url;
    retainedImages.set(file, img);
  });
  return sheet;
}

// The sharpest sheet resolved so far, readable synchronously so a remounted icon paints on its first render.
const loadedSheets = new Map<IconSheetName, IconSheet>();

function remember(name: IconSheetName, sheet: IconSheet) {
  const known = loadedSheets.get(name);
  if (!known || sheet.index.cell[0] >= known.index.cell[0]) loadedSheets.set(name, sheet);
}

export function getLoadedIconSheet(name: IconSheetName): IconSheet | null {
  return loadedSheets.get(name) ?? null;
}

interface SheetLoad {
  /** Whichever sheet is ready first. */
  first: Promise<IconSheet>;
  /** The best sheet for this device; the same as `first` when there is only one. */
  final: Promise<IconSheet>;
}

const sheetLoads = new Map<IconSheetName, SheetLoad>();

function startLoad(name: IconSheetName): SheetLoad {
  if (hasHdSheet(name)) {
    // Request both at once; the low fetch priority on the big one keeps it from competing with the small sheet for bandwidth.
    const small = fetchSheetWithImage(name);
    const hd = fetchSheetWithImage(`${name}_hd`, 'low');
    return { first: Promise.any([small, hd]), final: hd.catch(() => small) };
  }
  const only = fetchSheet(name);
  return { first: only, final: only };
}

/** One fetch per sheet per page load, shared by every consumer. A plain sheet's image is loaded by the browser as a CSS background. */
function getSheetLoad(name: IconSheetName): SheetLoad {
  let load = sheetLoads.get(name);
  if (!load) {
    load = startLoad(name);
    const forget = () => sheetLoads.delete(name); // allow a retry on the next call
    load.final.then((sheet) => remember(name, sheet), forget);
    load.first.then((sheet) => remember(name, sheet), forget);
    sheetLoads.set(name, load);
  }
  return load;
}

/** The first usable sheet. */
export function loadIconSheet(name: IconSheetName): Promise<IconSheet> {
  return getSheetLoad(name).first;
}

/** The sharpest sheet for this device (the HD one on PC), falling back to the small one if it fails. */
export function loadFinalIconSheet(name: IconSheetName): Promise<IconSheet> {
  return getSheetLoad(name).final;
}

/**
 * Background style that shows one icon of the sheet, whatever the element size is.
 * Percent-based, so a `w-full h-full` square box scales the icon without knowing its pixel size.
 * Returns null when the key is not on the sheet.
 */
export function iconSheetStyle(sheet: IconSheet, key: string | number): CSSProperties | null {
  const { cell, columns, size, items } = sheet.index;
  const pos = items[String(key)];
  if (!pos) return null;
  const rows = size[1] / cell[1];
  // background-position % is relative to (sheet - element); the single-cell sheet edge case has no offset.
  const px = size[0] === cell[0] ? 0 : (pos[0] / (size[0] - cell[0])) * 100;
  const py = size[1] === cell[1] ? 0 : (pos[1] / (size[1] - cell[1])) * 100;
  return {
    backgroundImage: `url(${sheet.url})`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${px}% ${py}%`,
    backgroundRepeat: 'no-repeat',
  };
}
