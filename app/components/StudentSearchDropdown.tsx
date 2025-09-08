import React, { useState, useRef, useEffect } from 'react';
import { Student } from '../types/data';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

// interface StudentsMap {
//   [id: number]: Student;
// }

interface StudentSearchDropdownProps {
  students: Record<number, Student>;
  selectedStudentId: number;
  setSelectedStudentId: (id: number) => void;
}

function StudentSearchDropdown({ students, selectedStudentId, setSelectedStudentId }: StudentSearchDropdownProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedStudent = students[selectedStudentId] || null;
  const t = useTranslations('charts.heatmap.control')
  const t_student = useTranslations('charts.ranking.control')

  // Set searchTerm only when a component is first rendered or the selected student changes
  useEffect(() => {
    if (selectedStudent) {
      setSearchTerm(selectedStudent.Name);
    } else {
      setSearchTerm('');
    }
  }, [selectedStudent]);

  const filteredStudents = Object.entries(students).filter(([, student]) => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const nameMatch = student.Name.toLowerCase().includes(lowerCaseSearchTerm);
    const tagsMatch = student.SearchTags.some(tag => tag.toLowerCase().includes(lowerCaseSearchTerm));
    const schoolMatch = student.School.toLowerCase().includes(lowerCaseSearchTerm);
    const roleMatch = student.TacticRole.toLowerCase().includes(lowerCaseSearchTerm);
    const squadTypeMatch = student.SquadType.toLowerCase().includes(lowerCaseSearchTerm);

    return nameMatch || tagsMatch || schoolMatch || roleMatch || squadTypeMatch;
  });

  const handleSelectStudent = (id: number) => {
    setSelectedStudentId(id);
    // SearchTerm is automatically updated by 'useEffect' when selecting a student
    // Close drop-down immediately
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
      <label htmlFor="student-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-300">
        {t('selectStudent')}
      </label>

      <div className="relative">
        <input
          id="student-search"
          type="text"
          placeholder="Enter student name, role, school, or squad type"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
            // setSelectedStudentId(null);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full px-4 py-1 text-base border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className={`h-5 w-5 text-gray-400 dark:text-gray-500 transform transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {showDropdown && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto transition-colors duration-300">
          {filteredStudents.length > 0 ? (
            filteredStudents.map(([id, student]) => (
              <li
                key={id}
                onClick={() => handleSelectStudent(parseInt(id))}
                className="px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center"              >
                <div
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: ({
                      Explosion: "#b62915",
                      Pierce: '#bc8800',
                      Mystic: '#206d9b',
                      Sonic: '#9a46a8',
                    }[student.BulletType]),
                  }}
                >
                  <Image
                    src={`data:image/webp;base64,${student.Portrait}`}
                    alt={`${student.Name}'s icon`}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                </div>

                <div className="flex-1 min-w-0 ml-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800 dark:text-white truncate transition-colors duration-300">{student.Name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${student.SquadType === 'Main' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                        {/* {student.SquadType} */}
                        {t_student(`squad_type_${student.SquadType.toLowerCase()}`)}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-medium transition-colors duration-300">
                        {/* {student.TacticRole} */}
                        {t_student(`tactic_role_${student.TacticRole}`)}
                        </span>
                    </div>
                  </div>

                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
                    <span className="mr-2 text-blue-500 dark:text-blue-400">{student.School}</span>
                    <span className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-full px-2 py-0.5 text-xs font-medium">{student.Position}</span>
                    {student.SearchTags.map(tag => (
                      <span key={tag} className="inline-block bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-full px-2 py-0.5 text-xs font-medium mr-1">{tag}</span>
                    ))}
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="px-4 py-2 text-gray-500 dark:text-gray-400">No results found.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default StudentSearchDropdown;