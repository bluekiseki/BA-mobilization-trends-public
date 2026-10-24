import type { IconData } from '~/types/plannerData';
import type { IconEntry } from './types';
import { cdn } from '~/utils/cdn';
import { fetchJsonWithProgress, type DownloadProgress } from '../../../utils/fetchWithProgress';

export function resolveIconName(entry: IconEntry, lang: string): string {
  const loc = entry.localizeEtc;
  if (lang.startsWith('ko')) return loc.NameKr || loc.NameEn;
  if (lang.startsWith('ja')) return loc.NameJp || loc.NameEn;
  if (lang.startsWith('zh')) return loc.NameTw || loc.NameJp || loc.NameEn;
  return loc.NameEn || loc.NameJp;
}

interface RawItem {
  Id: number;
  ItemCategory?: number;
  Rarity?: number;
  LocalizeEtc: { NameEn: string; NameJp: string; NameTw?: string; NameKr?: string };
  TagsStr?: string[];
}

type RawIconInfo = Record<string, Record<string, RawItem>>;

// Module-level cache — available after loadIcons() resolves
let _rawIconInfo: RawIconInfo = {};
let _rawIconImg: IconData = {};
type LoadedIcons = { icons: IconEntry[]; iconMap: Map<string, IconEntry> };
let cachedIcons: LoadedIcons | null = null;
let iconsPromise: Promise<LoadedIcons> | null = null;
let lastProgress: DownloadProgress | null = null;
const progressListeners = new Set<(progress: DownloadProgress) => void>();

export function isIconsLoaded(): boolean {
  return cachedIcons !== null;
}

/** Shares metadata downloads independently of model sessions, including concurrent callers. */
export async function loadIcons(onProgress?: (progress: DownloadProgress) => void): Promise<LoadedIcons> {
  if (cachedIcons) return cachedIcons;
  if (onProgress) {
    progressListeners.add(onProgress);
    if (lastProgress) onProgress(lastProgress);
  }
  iconsPromise ??= loadIconData((progress) => {
    lastProgress = progress;
    for (const listener of progressListeners) listener(progress);
  })
    .then((result) => {
      cachedIcons = result;
      return result;
    })
    .catch((error: unknown) => {
      iconsPromise = null;
      lastProgress = null;
      throw error;
    });
  try {
    return await iconsPromise;
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
}

/** Raw icon_info.json data (for use with ItemIcon's eventData prop) */
export function getRawIconInfo(): RawIconInfo {
  return _rawIconInfo;
}
/** Raw icon_img.json data (for use with ItemIcon's iconData prop) */
export function getRawIconImg(): IconData {
  return _rawIconImg;
}

async function loadIconData(onProgress: (progress: DownloadProgress) => void): Promise<LoadedIcons> {
  // Both files stream in parallel; report their combined byte progress as one stream.
  const parts: Record<'info' | 'img', DownloadProgress> = { info: { loaded: 0, total: null }, img: { loaded: 0, total: null } };
  const emitCombined = () => {
    const total = parts.info.total !== null && parts.img.total !== null ? parts.info.total + parts.img.total : null;
    onProgress({ loaded: parts.info.loaded + parts.img.loaded, total });
  };
  [_rawIconInfo, _rawIconImg] = await Promise.all([
    fetchJsonWithProgress<RawIconInfo>(cdn('/ew/icon_info.json'), (p) => {
      parts.info = p;
      emitCombined();
    }),
    fetchJsonWithProgress<IconData>(cdn('/ew/icon_img.json'), (p) => {
      parts.img = p;
      emitCombined();
    }),
  ]);

  const icons: IconEntry[] = [];

  for (const [category, items] of Object.entries(_rawIconInfo)) {
    const imgCategory = _rawIconImg[category] ?? {};
    for (const [, item] of Object.entries(items)) {
      const id = item.Id;
      const inventoryKey = `${category}_${id}`;
      const isGift = item.ItemCategory === 6;
      const raw = imgCategory[String(id)] ?? '';
      const dataUrl = raw ? `data:image/webp;base64,${raw}` : '';

      icons.push({
        inventoryKey,
        name: item.LocalizeEtc.NameEn,
        localizeEtc: {
          NameEn: item.LocalizeEtc.NameEn ?? '',
          NameKr: item.LocalizeEtc.NameKr ?? '',
          NameJp: item.LocalizeEtc.NameJp ?? '',
          NameTw: item.LocalizeEtc.NameTw,
        },
        dataUrl,
        isGift,
        numericId: String(id),
      });
    }
  }

  const iconMap = new Map(icons.map((ic) => [ic.inventoryKey, ic]));
  return { icons, iconMap };
}
