// app/components/planner/StudentGrowth/GiftStudentSheet.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RiHeartLine } from 'react-icons/ri';

import type { EventData, IconData } from '~/types/plannerData';
import { ItemIconView } from '../item/ItemIconView';
import { StudentPortraitAvatar, StudentSheetModal } from './StudentSheetModal';
import { filterGiftStudentsForDisplay, type GiftStudentEntry } from '~/utils/student/giftStudents';

// --- Shared Types ---

export interface GiftEntry {
  id: string;
  type: string;
  rarity: number;
  affectionPoints: number;
  preferenceLevel: number;
}

// --- Shared Helper ---

export const getPreferenceIcon = (preferenceLevel: number, rarity: number): string => {
  let lv = preferenceLevel;
  if (rarity === 3 && lv === 1) lv = 2;
  if (lv >= 4) return '/img/Cafe_Interaction_Gift_04.webp';
  if (lv === 3) return '/img/Cafe_Interaction_Gift_03.webp';
  if (lv === 2) return '/img/Cafe_Interaction_Gift_02.webp';
  return '/img/Cafe_Interaction_Gift_01.webp';
};

// --- Shared Component: grouped-by-affection avatar list, no modal chrome — used both inside
// GiftStudentSheet's popup and embedded directly in other panels (e.g. the inventory item sheet). ---

export function GiftAffectionGroups({ students, emptyMessage }: { students: GiftStudentEntry[]; emptyMessage?: string }) {
  const { t } = useTranslation('planner');

  const grouped = useMemo(() => {
    const map = new Map<number, GiftStudentEntry[]>();
    for (const s of students) {
      if (!map.has(s.affectionPoints)) map.set(s.affectionPoints, []);
      map.get(s.affectionPoints)?.push(s);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [students]);

  if (grouped.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">{emptyMessage ?? t('affectionTab.giftIndex.noStudents')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([exp, group]) => (
        <div key={exp}>
          <div className="flex items-center gap-1.5 mb-2">
            <img src={getPreferenceIcon(group[0].preferenceLevel, 2)} className="w-4 h-4" alt="" />
            <span className="text-xs font-black text-pink-500 dark:text-pink-400 tabular-nums">+{exp} EXP</span>
            <span className="text-[10px] text-neutral-400 ml-auto">
              {group.length}
              {t('affectionTab.units.students')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.map((s) => (
              <StudentPortraitAvatar key={s.id} studentId={Number(s.id)} name={s.name} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Shared Component: full popup (used by ItemIcon when clicking a gift icon) ---

export const GiftStudentSheet = ({
  gift,
  students,
  eventData,
  iconData,
  onClose,
}: {
  gift: GiftEntry;
  students: GiftStudentEntry[];
  eventData: EventData;
  iconData: IconData;
  onClose: () => void;
}) => {
  const { t } = useTranslation('planner');
  const prefIcon = getPreferenceIcon(gift.preferenceLevel, gift.rarity);

  const filteredStudents = useMemo(() => filterGiftStudentsForDisplay(students, gift.rarity), [students, gift.rarity]);

  return (
    <StudentSheetModal
      onClose={onClose}
      icon={
        <>
          <ItemIconView type="Item" itemId={gift.id} amount={0} size={11} eventData={eventData} iconData={iconData} />
          <div className="absolute bottom-0 right-0 p-0.5">
            <img src={prefIcon} alt="" className="w-4 h-4 object-cover" />
          </div>
        </>
      }
      title={
        <>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
            <RiHeartLine size={11} />
            {t('affectionTab.giftIndex.studentsWhoLike')}
          </p>
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 tabular-nums">
            {filteredStudents.length}
            {t('affectionTab.units.students')}
          </p>
        </>
      }
    >
      <GiftAffectionGroups students={filteredStudents} />
    </StudentSheetModal>
  );
};
