// app/components/planner/StudentGrowth/FurnitureStudentSheet.tsx
import { useTranslation } from 'react-i18next';
import { RiSofaLine } from 'react-icons/ri';

import type { EventData, IconData, StudentPortraitData } from '~/types/plannerData';
import { ItemIconView } from '../item/ItemIconView';
import type { FurnitureStudentEntry } from '../../utils/student/furnitureInteractionList';
import { StudentPortraitList, StudentSheetModal } from './StudentSheetModal';

export const FurnitureStudentSheet = ({
  furnitureId,
  students,
  studentPortraits,
  eventData,
  iconData,
  onClose,
}: {
  furnitureId: string;
  students: FurnitureStudentEntry[];
  studentPortraits?: StudentPortraitData;
  eventData: EventData;
  iconData: IconData;
  onClose: () => void;
}) => {
  const { t } = useTranslation('planner');

  return (
    <StudentSheetModal
      onClose={onClose}
      icon={<ItemIconView type="Furniture" itemId={furnitureId} amount={0} size={11} eventData={eventData} iconData={iconData} />}
      title={
        <p className="text-xs font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-1">
          <RiSofaLine size={12} />
          {t('affectionTab.furnitureIndex.studentsWhoInteract')}
        </p>
      }
    >
      <StudentPortraitList
        students={students.map((student) => ({ studentId: Number(student.id), name: student.name }))}
        studentPortraits={studentPortraits}
        emptyMessage={t('affectionTab.furnitureIndex.noStudents')}
      />
    </StudentSheetModal>
  );
};
