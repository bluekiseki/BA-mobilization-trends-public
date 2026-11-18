// app/components/planner/StudentGrowth/OpartStudentSheet.tsx
import { useTranslation } from 'react-i18next';

import type { EventData, IconData } from '~/types/plannerData';
import { ItemIconView } from '../item/ItemIconView';
import { StudentPortraitList, StudentSheetModal } from './StudentSheetModal';

export interface OpartStudentEntry {
  studentId: number;
  name: string;
}

// Students whose skill/potential growth consumes this Opart (used by ItemIcon when clicking an Opart icon).
export const OpartStudentSheet = ({
  itemId,
  students,
  eventData,
  iconData,
  onClose,
}: {
  itemId: string;
  students: OpartStudentEntry[];
  eventData: EventData;
  iconData: IconData;
  onClose: () => void;
}) => {
  const { t } = useTranslation('planner');

  return (
    <StudentSheetModal
      onClose={onClose}
      icon={<ItemIconView type="Item" itemId={itemId} amount={0} size={11} eventData={eventData} iconData={iconData} />}
      title={
        <>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t('inventory.neededForGrowthLabel')}</p>
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 tabular-nums">
            {students.length}
            {t('affectionTab.units.students')}
          </p>
        </>
      }
    >
      <StudentPortraitList students={students} emptyMessage={t('inventory.noUsersForGrowth')} />
    </StudentSheetModal>
  );
};
