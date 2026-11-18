import { useEffect, useMemo, useState } from 'react';
import type { ReportStudentData } from '../../../../types/raidReport';
import type { Student } from '~/types/data';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, SUPORTED_SHORT_LOCALES, type Locale } from '~/utils/i18n/config';
import { useDataCacheJson } from '~/hooks/useDataCacheJson';
import { bossConcepts, buildTitleDictionary, glossaryConcepts, segmentTitle, studentConcepts, type StudentsByLocale, type TitleDictionary } from './titleTranslation';

/** Builds the title dictionary once all locales' student names are loaded. */
export function useTitleDictionary(studentData: ReportStudentData, locale: Locale): TitleDictionary | null {
  const target = getLocaleShortName(locale);
  const fetchStudents = useDataCacheJson<Record<string, Student>>();
  const [otherStudents, setOtherStudents] = useState<StudentsByLocale | null>(null);

  useEffect(() => {
    let cancelled = false;
    const others = SUPORTED_SHORT_LOCALES.filter((l) => l !== target);
    Promise.all(others.map((l) => fetchStudents(cdn(`/w/v2/${l}.students.bin`)).then((data) => [l, data] as const)))
      .then((entries) => {
        if (!cancelled) setOtherStudents(Object.fromEntries(entries));
      })
      .catch((err: unknown) => console.error('Failed to load student names for title translation:', err));
    return () => {
      cancelled = true;
    };
  }, [target, fetchStudents]);

  return useMemo(() => {
    if (!otherStudents || Object.keys(studentData).length === 0) return null;
    const students: StudentsByLocale = { ...otherStudents, [target]: studentData };
    return buildTitleDictionary([...glossaryConcepts(), ...bossConcepts(), ...studentConcepts(students)], target);
  }, [otherStudents, studentData, target]);
}

/** A video title with translated terms; each original term is shown above its translation as ruby text. */
export function VideoTitle({ title, dict, className }: { title: string; dict: TitleDictionary | null; className: string }) {
  const segments = useMemo(() => (dict ? segmentTitle(title, dict) : [title]), [title, dict]);
  const translated = segments.some((s) => typeof s !== 'string');
  return (
    <p className={`text-[11px] text-neutral-600 dark:text-neutral-300 hover:underline ${className} ${translated ? 'leading-normal' : 'leading-tight'}`}>
      {segments.map((s, i) =>
        typeof s === 'string' ? (
          s
        ) : (
          <ruby key={i}>
            {s.dst}
            <rt className="text-[8px] text-neutral-400 dark:text-neutral-500">{s.src}</rt>
          </ruby>
        ),
      )}
    </p>
  );
}
