// app/components/planner/StudentGrowth/GiftStudentSheet.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { RiHeartLine } from 'react-icons/ri';

import type { EventData, IconData, StudentData } from '~/types/plannerData';
import { ItemIcon } from '../common/Icon';
import { getGiftAffectionList } from './giftAffectionList';

// --- Shared Types ---

export interface GiftEntry {
  id: string;
  type: string;
  rarity: number;
  affectionPoints: number;
  preferenceLevel: number;
}

export interface GiftStudentEntry {
  id: string;
  name: string;
  preferenceLevel: number;
  affectionPoints: number;
  rarity: number;
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

const giftMapCache = new WeakMap<object, WeakMap<object, Record<string, GiftStudentEntry[]>>>();

export const buildGiftToStudentsMap = (allStudents: StudentData | undefined, eventData: EventData): Record<string, GiftStudentEntry[]> => {
  if (!allStudents || !eventData) return {};

  if (!giftMapCache.has(allStudents)) giftMapCache.set(allStudents, new WeakMap());
  const innerCache = giftMapCache.get(allStudents);
  if (!innerCache) return {};
  const cached = innerCache.get(eventData);
  if (cached) return cached;

  const map: Record<string, GiftStudentEntry[]> = {};

  Object.entries(allStudents).forEach(([studentId, student]) => {
    const gifts = getGiftAffectionList(student, eventData);
    gifts.forEach((gift) => {
      if (gift.affectionPoints <= 20) return;
      if (!map[gift.id]) map[gift.id] = [];
      map[gift.id].push({
        id: studentId,
        name: student.Name,
        preferenceLevel: gift.preferenceLevel,
        affectionPoints: gift.affectionPoints,
        rarity: gift.rarity,
      });
    });
  });

  Object.values(map).forEach((students) => students.sort((a, b) => b.affectionPoints - a.affectionPoints || a.name.localeCompare(b.name)));

  innerCache.set(eventData, map);
  return map;
};

// --- Shared filter (rarity-3 gifts cap affection at 120, so a student already there gets no
// further benefit and shouldn't be listed) ---

export function filterGiftStudentsForDisplay(students: GiftStudentEntry[], rarity: number): GiftStudentEntry[] {
  return students.filter((s) => !(rarity === 3 && s.affectionPoints === 120));
}

// --- Shared Component: grouped-by-affection avatar list, no modal chrome — used both inside
// GiftStudentSheet's popup and embedded directly in other panels (e.g. the inventory item sheet). ---

export function GiftAffectionGroups({ students, studentPortraits, emptyMessage }: { students: GiftStudentEntry[]; studentPortraits?: Record<number, string>; emptyMessage?: string }) {
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
              <Tooltip key={s.id} placement="top" overlay={<span className="text-xs font-medium">{s.name}</span>} mouseEnterDelay={0.1}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 ring-2 ring-white dark:ring-neutral-800 cursor-pointer">
                  {studentPortraits?.[Number(s.id)] ? (
                    <img src={`data:image/webp;base64,${studentPortraits[Number(s.id)]}`} className="w-full h-full object-cover" alt={s.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-500">{s.name[0]}</div>
                  )}
                </div>
              </Tooltip>
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
  studentPortraits,
  eventData,
  iconData,
  onClose,
}: {
  gift: GiftEntry;
  students: GiftStudentEntry[];
  studentPortraits?: Record<number, string>;
  eventData: EventData;
  iconData: IconData;
  onClose: () => void;
}) => {
  const { t } = useTranslation('planner');
  const prefIcon = getPreferenceIcon(gift.preferenceLevel, gift.rarity);

  const filteredStudents = useMemo(() => filterGiftStudentsForDisplay(students, gift.rarity), [students, gift.rarity]);

  return (
    <div className="fixed inset-0 z-51 flex items-end sm:items-center justify-center" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full sm:w-80 max-h-[70vh] sm:max-h-120 bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-8 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <div className="relative w-10 h-10 bg-neutral-50 dark:bg-neutral-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <ItemIcon type="Item" itemId={gift.id} amount={0} size={11} eventData={eventData} iconData={iconData} />
            <div className="absolute bottom-0 right-0 p-0.5">
              <img src={prefIcon} alt="" className="w-4 h-4 object-cover" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
              <RiHeartLine size={11} />
              {t('affectionTab.giftIndex.studentsWhoLike')}
            </p>
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 tabular-nums">
              {filteredStudents.length}
              {t('affectionTab.units.students')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors shrink-0 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Group by Affection Level */}
        <div className="overflow-y-auto custom-scrollbar px-3 py-3">
          <GiftAffectionGroups students={filteredStudents} studentPortraits={studentPortraits} />
        </div>
      </div>
    </div>
  );
};
