import type { GachaGroupInfo, IconInfo, IconInfos } from '~/types/plannerData';
import { ItemIcon, type ItemIconProps } from '../common/Icon';

export const blueprintToEqipIcon = (bluePrintId: number) => {
  return bluePrintId % 10000;
};

export const getEquipmentTierLabel = (itemInfo: IconInfo | undefined): string | null => {
  if (!itemInfo?.Icon) return null;
  const match = itemInfo.Icon.match(/Tier(\d+)/);
  if (match && match[1]) {
    return `${match[1]}T`;
  }
  return null;
};

export const EquipmentItemIcon = ({ type, itemId, amount, size, eventData, iconData, label, labelColor = 'bg-gray-700' }: ItemIconProps) => {
  if (type == 'Equipment') {
    const itemInfo = eventData.icons[type][itemId];
    const tierLabel = getEquipmentTierLabel(itemInfo);
    const eqipitemId = String(blueprintToEqipIcon(Number(itemId)));
    return <ItemIcon type="Equipment" itemId={eqipitemId} amount={amount} size={size} eventData={eventData} iconData={iconData} label={tierLabel} labelColor="bg-teal-700 dark:bg-teal-800" />;
  }

  return <ItemIcon type={type} itemId={itemId} amount={amount} size={size} eventData={eventData} iconData={iconData} label={label} labelColor={labelColor} />;
};

export interface ResolvedStage {
  id: number;
  type: 'Normal' | 'Hard';
  name: string;
  chapter: number;
  stageNum: number;
  ap: number;
  drops: Record<string, number>;
}

export const resolveGachaGroup = (gachaId: number, iconInfoData: IconInfos, visited: Set<number> = new Set()): Record<string, number> => {
  const drops: Record<string, number> = {};
  if (visited.has(gachaId)) {
    return drops;
  }
  visited.add(gachaId);
  const gachaGroup: GachaGroupInfo | undefined = iconInfoData.GachaGroup?.[gachaId.toString()];
  if (!gachaGroup) {
    return drops;
  }
  const elements = [...(gachaGroup.GachaElement || []), ...(gachaGroup.GachaElementRecursive || [])];
  const totalProb = elements.reduce((sum, el) => sum + el.Prob, 0);
  if (totalProb === 0) {
    return drops;
  }
  for (const element of elements) {
    const relativeProb = element.Prob / totalProb;
    const amount = element.ParcelAmountMin ? (element.ParcelAmountMin + element.ParcelAmountMax) / 2 : 1;
    const type = element.ParcelTypeStr;
    const id = element.ParcelId;
    const key = `${type}_${id}`;
    if (type === 'Equipment') {
      drops[key] = (drops[key] || 0) + relativeProb * amount;
    } else if (type === 'GachaGroup') {
      const nestedDrops = resolveGachaGroup(id, iconInfoData, new Set(visited));
      for (const [nestedKey, nestedProb] of Object.entries(nestedDrops)) {
        drops[nestedKey] = (drops[nestedKey] || 0) + relativeProb * nestedProb;
      }
    }
  }
  return drops;
};
