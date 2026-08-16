import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StudentIcon } from '~/components/dashboard/studentIcon';
import { SearchableDropdown } from '~/components/SearchableDropdown';
import type { Character, PortraitData } from '~/components/dashboard/common';
import type { Student } from '~/types/plannerData';
import type { RaidHistoryStudent } from '~/types/raidHistory';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

interface RaidStudentPickerProps {
  students: Record<string, Student>;
  portraitData: PortraitData;
  locale: Locale;
  onSelect: (student: RaidHistoryStudent) => void;
}

export function RaidStudentPicker({ students, portraitData, locale, onSelect }: RaidStudentPickerProps) {
  const { t: tm } = useTranslation('mypage');
  const { t: td } = useTranslation('dashboard');
  const { t: tp } = useTranslation('planner');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const selectedStudent = selectedStudentId ? students[String(selectedStudentId)] : undefined;
  const [star, setStar] = useState(3);
  const [weaponStar, setWeaponStar] = useState(0);
  const matcher = useSearchMatcher(locale);

  const filteredStudents = useMemo(() => {
    const searchText = query.trim().toLowerCase();
    return Object.entries(students)
      .filter(([, student]) => {
        if (!searchText) return true;
        return matcher(student.Name, searchText) || matcher(student.FamilyName ?? '', searchText) || student.SearchTags.some((tag) => matcher(tag, searchText));
      })
      .sort(([, a], [, b]) => a.Name.localeCompare(b.Name))
      .slice(0, 40);
  }, [matcher, query, students]);

  const selectStudent = (studentId: number, student: Student) => {
    setSelectedStudentId(studentId);
    setStar(student.StarGrade);
    setWeaponStar(0);
    setQuery(student.Name);
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      <SearchableDropdown
        value={query}
        onChange={setQuery}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placeholder={tp('ui.searchStudentPlaceholder')}
        inputClassName="w-full rounded border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-blue-900"
        className="relative"
        itemCount={filteredStudents.length}
        onSelectIndex={(index) => {
          const item = filteredStudents[index];
          if (!item) return;
          selectStudent(Number(item[0]), item[1]);
        }}
      >
        {(highlightedIndex, onHighlight) => (
          <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded border border-neutral-200 bg-white text-sm dark:border-neutral-700 dark:bg-neutral-900">
            {filteredStudents.length > 0 ? (
              filteredStudents.map(([id, student], index) => {
                const studentId = Number(id);
                const character: Character = { id: studentId, level: 0, star: student.StarGrade, hasWeapon: false, weaponStar: 0, isAssist: false };
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => selectStudent(studentId, student)}
                      onMouseEnter={() => onHighlight(index)}
                      data-index={index}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${index === highlightedIndex ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                    >
                      <div className="w-10 shrink-0">
                        <StudentIcon character={character} student={student} portraitData={portraitData} />
                      </div>
                      <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-100" title={student.Name}>
                        {student.Name}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-2 text-neutral-500 dark:text-neutral-400">{td('noResults')}</li>
            )}
          </ul>
        )}
      </SearchableDropdown>
      {selectedStudentId && selectedStudent && (
        <div className="space-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-12 shrink-0">
              <StudentIcon character={{ id: selectedStudentId, level: 0, star, hasWeapon: weaponStar > 0, weaponStar, isAssist: false }} student={selectedStudent} portraitData={portraitData} />
            </div>
            <div className="min-w-0 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={selectedStudent.Name}>
              {selectedStudent.Name}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{tm('raids.slotPicker.starGrade')}</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStar(value)}
                  className={`h-8 flex-1 rounded border text-xs font-semibold ${star === value ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{tp('common.uniqueWeapon')}</div>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWeaponStar(value)}
                  className={`h-8 flex-1 rounded border text-xs font-semibold ${weaponStar === value ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect({ id: selectedStudentId, star, hasWeapon: weaponStar > 0, weaponStar })}
            className="w-full rounded bg-ba-btn-blue px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark"
          >
            {tm('raids.modal.clearTimePlaceholder')}
          </button>
        </div>
      )}
    </div>
  );
}
