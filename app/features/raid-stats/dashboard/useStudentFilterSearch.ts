import { useCallback, useMemo } from 'react';
import type { ReportStudentData } from '../../../types/raidReport';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

export function useStudentFilterSearch(studentData: ReportStudentData, locale: Locale, usageCounts: Map<number, number>) {
  const matcher = useSearchMatcher(locale);
  const studentNames = useMemo(() => new Map(Object.entries(studentData).map(([id, student]) => [Number(id), student.Name])), [studentData]);
  const searchFn = useCallback(
    (query: string, excludedIds: Set<number>): Array<[number, string]> => {
      const search = query.trim();
      return Object.entries(studentData)
        .filter(([id, student]) => !excludedIds.has(Number(id)) && (!search || matcher(student.Name, search) || student.SearchTags.some((tag) => matcher(tag, search))))
        .sort(([a], [b]) => (usageCounts.get(Number(b)) ?? 0) - (usageCounts.get(Number(a)) ?? 0))
        .slice(0, 50)
        .map(([id, student]) => [Number(id), student.Name]);
    },
    [studentData, matcher, usageCounts],
  );
  return { studentNames, searchFn };
}
