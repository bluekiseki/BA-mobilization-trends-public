import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Student } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import { useSearchMatcher } from '~/utils/useSearchMatcher';

interface StudentSearchDropdownProps {
  students: Record<number, Student>;
  selectedStudentId: number | null;
  setSelectedStudentId: (id: number) => void;
}

function StudentSearchDropdown({ students, selectedStudentId, setSelectedStudentId }: StudentSearchDropdownProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedStudent = selectedStudentId ? students[selectedStudentId] : null;
  const { t, i18n } = useTranslation('charts', { keyPrefix: 'heatmap.control' });
  const { t: t_student } = useTranslation('charts', {
    keyPrefix: 'ranking.control',
  });

  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);

  useEffect(() => {
    if (selectedStudent) {
      setSearchTerm(selectedStudent.Name);
    } else {
      setSearchTerm('');
    }
  }, [selectedStudent]);

  const filteredStudents = Object.entries(students).filter(([, student]) => {
    const searchText = searchTerm.toLowerCase();
    const nameMatch = matcher(student.Name, searchText);
    const tagsMatch = student.SearchTags.some((tag) => matcher(tag, searchText));
    const schoolMatch = matcher(student.School, searchText);
    const familyNameMatch = matcher(student.FamilyName || '', searchText);
    const roleString = String(t_student(`tactic_role_${student.TacticRole}` as any));
    const roleMatch = matcher(roleString, searchText);
    const squadTypeString = String(t_student(`squad_type_${student.SquadType.toLowerCase()}` as any));
    const squadTypeMatch = matcher(squadTypeString, searchText);

    return nameMatch || tagsMatch || schoolMatch || roleMatch || squadTypeMatch || familyNameMatch;
  });

  const handleSelectStudent = (id: number) => {
    setSelectedStudentId(id);
    setShowDropdown(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <label htmlFor="student-search" className="block font-semibold text-black dark:text-white mb-1 transition-colors duration-300">
        {t('selectStudent')}
      </label>

      <div className="relative">
        <input
          id="student-search"
          type="text"
          placeholder={t('studentSearchPlaceholder')}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full px-4 py-1 text-base border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 dark:bg-neutral-700 dark:text-white dark:placeholder-neutral-400"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg className={`h-5 w-5 text-neutral-400 dark:text-neutral-500 transform transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {showDropdown && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg max-h-60 overflow-auto transition-colors duration-300">
          {filteredStudents.length > 0 ? (
            filteredStudents.map(([id, student]) => (
              <li
                key={id}
                onClick={() => handleSelectStudent(parseInt(id))}
                className="px-4 py-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-150 flex items-center"
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: {
                      Explosion: '#b62915',
                      Pierce: '#bc8800',
                      Mystic: '#206d9b',
                      Sonic: '#9a46a8',
                    }[student.BulletType],
                  }}
                >
                  <img src={`data:image/webp;base64,${student.Portrait}`} alt={`${student.Name}'s icon`} width={40} height={40} className="rounded-full" />
                </div>

                <div className="flex-1 min-w-0 ml-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-800 dark:text-white truncate transition-colors duration-300">{student.Name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-semibold rounded-full px-2 py-0.5 ${student.SquadType === 'Main' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}
                      >
                        {/* {student.SquadType} */}
                        {t_student(`squad_type_${student.SquadType.toLowerCase()}` as any) as any}
                      </span>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400 font-medium transition-colors duration-300">
                        {/* {student.TacticRole} */}
                        {t_student(`tactic_role_${student.TacticRole}` as any) as any}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 transition-colors duration-300">
                    <span className="mr-2 text-blue-500 dark:text-blue-400">{student.School}</span>
                    <span className="bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 rounded-full px-2 py-0.5 text-xs font-medium">{student.Position}</span>
                    {student.SearchTags.map((tag) => (
                      <span key={tag} className="inline-block bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 rounded-full px-2 py-0.5 text-xs font-medium mr-1">
                        {tag}
                      </span>
                    ))}

                    {student.FamilyName && (
                      <span className="inline-block bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 rounded-full px-2 py-0.5 text-xs font-medium mr-1">
                        {student.FamilyName}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="px-4 py-2 text-neutral-500 dark:text-neutral-400">No results found.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default StudentSearchDropdown;
