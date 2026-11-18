import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SearchableDropdown } from '~/components/common/SearchableDropdown';
import { SheetIcon } from '~/components/common/SheetIcon';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import { studentSearchScore } from '~/features/students/logic/studentSearch';
import { studentPath, type StudentTab } from '~/features/students/logic/studentTab';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import type { StudentData } from '~/types/plannerData';

// Jump to another student from the detail page. The catalog is only fetched once the input is focused.
export function StudentQuickSearch({ locale, tab, listState }: { locale: Locale; tab: StudentTab; listState: unknown }) {
  const { t } = useTranslation('students');
  const navigate = useNavigate();
  const matcher = useSearchMatcher(locale);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<StudentData | null>(null);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (!wanted || catalog) return;
    let cancelled = false;
    void fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((res): Promise<StudentData> => {
        if (!res.ok) throw new Error(`students catalog: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [wanted, catalog, locale]);

  const q = query.trim();
  const results =
    !q || !catalog
      ? []
      : Object.values(catalog)
          .map((student) => ({ student, score: studentSearchScore(student, q, matcher) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map(({ student }) => student);

  return (
    <div onFocus={() => setWanted(true)} className="min-w-0 flex-1 sm:w-64 sm:flex-none">
      <SearchableDropdown
        value={query}
        onChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        isOpen={open && !!q}
        onOpenChange={setOpen}
        placeholder={t('quickSearch')}
        inputClassName="w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
        listboxId="student-quick-search"
        noResultsText={catalog ? t('empty') : t('skillFilterLoading')}
        items={results.map((student) => ({
          id: String(student.Id),
          content: (
            <>
              <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                <SheetIcon sheet="student" id={student.Id} alt="" />
              </span>
              <span className="truncate">{student.Name}</span>
            </>
          ),
        }))}
        onSelectIndex={(index) => {
          const student = results[index];
          if (!student) return;
          setQuery('');
          setOpen(false);
          void navigate(localeLink(locale, studentPath(student.Id, tab)), { state: listState });
        }}
      />
    </div>
  );
}
