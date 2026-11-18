// app/components/planner/common/Icon.tsx
import { useMemo, useState } from 'react';
import type { IconInfo, StudentData } from '~/types/plannerData';
import { ItemIconView, type ItemIconBaseProps } from './ItemIconView';
import { GiftStudentSheet, type GiftEntry } from '../student/GiftStudentSheet';
import { buildGiftToStudentsMap } from '../../utils/student/giftStudents';
import { FurnitureStudentSheet } from '../student/FurnitureStudentSheet';
import { buildFurnitureToStudentsMap } from '../../utils/student/furnitureInteractionList';
import { OpartStudentSheet } from '../student/OpartStudentSheet';
import { getStudentsUsingMaterial } from '~/utils/calculatedGrowthNeeds';
import { getShopItemType } from '~/utils/itemType';

export interface ItemIconProps extends ItemIconBaseProps {
  allStudents?: StudentData;
}

/** Item icon that opens the gift / furniture / opart student sheets when student data is supplied. */
export const ItemIcon = ({ allStudents, ...iconProps }: ItemIconProps) => {
  const { type, itemId, eventData, iconData } = iconProps;
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [selectedOpartId, setSelectedOpartId] = useState<string | null>(null);

  const itemInfo = (eventData.icons[type as keyof typeof eventData.icons] as Record<string, IconInfo> | undefined)?.[itemId];

  const isGift = (itemInfo as IconInfo)?.ItemCategory === 6 && type === 'Item';
  const giftToStudentsMap = useMemo(() => buildGiftToStudentsMap(allStudents, eventData), [allStudents, eventData]);

  const isFurniture = type === 'Furniture';
  const furnitureToStudentsMap = useMemo(() => buildFurnitureToStudentsMap(allStudents), [allStudents]);

  const isOpart = type === 'Item' && getShopItemType('Item', Number(itemId), itemInfo) === 'Opart';
  // Computed only while the sheet is open, so plain icons don't scan the whole roster.
  const opartStudents = useMemo(() => {
    if (!allStudents || selectedOpartId !== itemId) return [];
    return getStudentsUsingMaterial(Number(itemId), allStudents)
      .map((id) => ({ studentId: id, name: allStudents[id]?.Name ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStudents, selectedOpartId, itemId]);

  const onActivate = () => {
    if (isGift && allStudents) setSelectedGiftId(itemId);
    else if (isFurniture && allStudents) setSelectedFurnitureId(itemId);
    else if (isOpart && allStudents) setSelectedOpartId(itemId);
  };

  return (
    <ItemIconView {...iconProps} interactive={(isGift || isFurniture || isOpart) && !!allStudents} onActivate={onActivate}>
      {isGift &&
        selectedGiftId === itemId &&
        allStudents &&
        (() => {
          const gift: GiftEntry = {
            id: itemId,
            type: 'Item',
            rarity: (itemInfo as IconInfo)?.Rarity || 0,
            affectionPoints: (itemInfo as IconInfo & { AffectionExp?: number })?.AffectionExp || 0,
            preferenceLevel: 0,
          };
          const students = giftToStudentsMap[itemId] ?? [];
          return <GiftStudentSheet gift={gift} students={students} eventData={eventData} iconData={iconData} onClose={() => setSelectedGiftId(null)} />;
        })()}

      {isFurniture && selectedFurnitureId === itemId && allStudents && (
        <FurnitureStudentSheet furnitureId={itemId} students={furnitureToStudentsMap[itemId] ?? []} eventData={eventData} iconData={iconData} onClose={() => setSelectedFurnitureId(null)} />
      )}

      {isOpart && selectedOpartId === itemId && allStudents && (
        <OpartStudentSheet itemId={itemId} students={opartStudents} eventData={eventData} iconData={iconData} onClose={() => setSelectedOpartId(null)} />
      )}
    </ItemIconView>
  );
};
