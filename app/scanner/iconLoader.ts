import type { IconData } from '~/types/plannerData';
import type { IconEntry } from './types';
import { cdn } from '~/utils/cdn';

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

/** Raw icon_info.json data (for use with ItemIcon's eventData prop) */
export function getRawIconInfo(): RawIconInfo {
  return _rawIconInfo;
}
/** Raw icon_img.json data (for use with ItemIcon's iconData prop) */
export function getRawIconImg(): IconData {
  return _rawIconImg;
}

export async function loadIcons(): Promise<{ icons: IconEntry[]; iconMap: Map<string, IconEntry> }> {
  const [infoResp, imgResp] = await Promise.all([fetch(cdn('/ew/icon_info.json')), fetch(cdn('/ew/icon_img.json'))]);
  _rawIconInfo = await infoResp.json();
  _rawIconImg = await imgResp.json();

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
