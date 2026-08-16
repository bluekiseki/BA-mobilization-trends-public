import { RaidStudentPicker } from './RaidStudentPicker';
import { useTranslation } from 'react-i18next';
import type { PortraitData } from '~/components/dashboard/common';
import type { RaidHistoryStudent } from '~/types/raidHistory';
import type { Student } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { HiOutlineXMark } from 'react-icons/hi2';

interface StudentPickerBottomSheetProps {
  isOpen: boolean;
  students: Record<string, Student>;
  portraitData: PortraitData;
  locale: Locale;
  onSelect: (student: RaidHistoryStudent) => void;
  onClose: () => void;
}

export function StudentPickerBottomSheet({ isOpen, students, portraitData, locale, onSelect, onClose }: StudentPickerBottomSheetProps) {
  const { t: tc } = useTranslation('common');
  const { t: tch } = useTranslation('charts');
  if (!isOpen) return null;

  return (
    <>
      {/* Background overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 transition-opacity" onClick={onClose} role="presentation" />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] rounded-t-lg bg-white dark:bg-neutral-950 shadow-lg overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{tch('heatmap.control.selectStudent')}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800" aria-label={tc('close')}>
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <RaidStudentPicker
            students={students}
            portraitData={portraitData}
            locale={locale}
            onSelect={(student) => {
              onSelect(student);
              onClose();
            }}
          />
        </div>
      </div>
    </>
  );
}
