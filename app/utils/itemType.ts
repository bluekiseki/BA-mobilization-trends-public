import type { GachaGroupInfo, IconInfo, IconInfos } from '~/types/plannerData';

export type ItemType = 'Furniture' | 'Credit' | 'ExpGrowth' | 'Material' | 'Favor' | 'Coin' | 'SecretStone' | 'Gem' | 'Equipment' | 'Opart' | 'TacticalBD' | 'TechNote' | 'AP';

export function splitItemKey(key: string): [string, string] | null {
  const i = key.lastIndexOf('_');
  return i < 0 ? null : [key.slice(0, i), key.slice(i + 1)];
}

export function getItemTypeFromKey(key: string, iconInfos: IconInfos | null): ItemType | null {
  const parts = splitItemKey(key);
  if (!parts) return null;
  const [type, id] = parts;
  const info = (iconInfos as Record<string, Record<string, IconInfo>> | null)?.[type]?.[id];
  return getShopItemType(type, Number(id), info);
}

export function getShopItemType(rewardType: string, rewardId: number, itemInfo?: IconInfo | GachaGroupInfo): ItemType | null {
  // Check type+id first before ItemCategory, so Currency items aren't misclassified
  if (rewardType === 'Furniture') return 'Furniture';
  if (rewardType === 'Equipment') return 'Equipment';
  if (rewardType === 'Currency') {
    if (rewardId === 1) return 'Credit';
    if (rewardId === 3) return 'Gem';
    if (rewardId === 5) return 'AP';
    return null;
  }

  if (itemInfo && !('ItemCategory' in itemInfo)) return 'Equipment'; // GachaGroupInfo

  if (itemInfo && typeof itemInfo.ItemCategory === 'number') {
    switch (itemInfo.ItemCategory) {
      case 0:
        return 'Coin';
      case 1:
        return 'ExpGrowth';
      case 2:
        return 'SecretStone';
      case 3:
        if (rewardId >= 100 && rewardId <= 299) return 'Opart';
        if (rewardId >= 3000 && rewardId <= 3999) return 'TacticalBD';
        if (rewardId >= 4000 && rewardId <= 4999) return 'TechNote';
        return 'Material';
      case 6:
        return 'Favor';
    }
  }
  return null;
}

// Priority items shown by default in EventMainPage gains overview
const OVERVIEW_PRIORITY_TYPES = new Set<ItemType>(['Gem', 'Credit', 'SecretStone', 'Favor', 'Opart', 'TechNote', 'TacticalBD']);

// These types are only shown when Rarity >= 3
const RARITY_GATED_TYPES = new Set<ItemType>(['Opart', 'TechNote', 'TacticalBD']);

function isEligma(type: string, id: string): boolean {
  return type === 'Item' && id === '23';
}

export function isOverviewPriorityItem(type: string, id: string, iconInfos: Record<string, Record<string, IconInfo>>): boolean {
  if (isEligma(type, id)) return true;
  const itemInfo = iconInfos[type]?.[id];
  const itemType = getShopItemType(type, Number(id), itemInfo);
  if (itemType === null || !OVERVIEW_PRIORITY_TYPES.has(itemType)) return false;
  if (RARITY_GATED_TYPES.has(itemType)) {
    return (itemInfo as IconInfo | undefined)?.Rarity === 3;
  }
  return true;
}

// Sort order for "show all" mode
const TYPE_SORT_ORDER: Partial<Record<ItemType, number>> = {
  Gem: 0,
  Credit: 1,
  SecretStone: 2,
  Favor: 4,
  Opart: 5,
  ExpGrowth: 6,
  Equipment: 7,
  Material: 8,
  TechNote: 9,
  TacticalBD: 10,
  Coin: 11,
  Furniture: 12,
};

export function getItemTypeOrder(type: string, id: string, iconInfos: Record<string, Record<string, IconInfo>>): number {
  if (isEligma(type, id)) return 3; // Between Favor and Opart in priority
  const itemInfo = iconInfos[type]?.[id];
  const itemType = getShopItemType(type, Number(id), itemInfo);
  return itemType !== null ? (TYPE_SORT_ORDER[itemType] ?? 99) : 99;
}
