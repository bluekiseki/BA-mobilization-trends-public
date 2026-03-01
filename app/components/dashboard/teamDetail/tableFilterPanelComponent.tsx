import type { Student } from '~/types/data';
import { InclusionUsage, type ExcludableStudentCondition, type IncludableStudentCondition, type PortraitData, type StudentData, type TableFilters, type UsageStats } from '../common';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarRating } from '~/components/StarRatingProps';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

const StudentDropdownItem: React.FC<{
  studentId: number;
  student: Student;
  usageStats: UsageStats;
  isExpanded: boolean;
  type: 'includable' | 'excludable';
  portraitData: PortraitData;
  onToggleExpand: () => void;
  onAdd: (condition: IncludableStudentCondition | ExcludableStudentCondition) => void;
}> = ({ studentId, student, usageStats, isExpanded, type, portraitData, onToggleExpand, onAdd }) => {
  const [selectedStars, setSelectedStars] = useState<Set<number>>(new Set());
  const { t: t_c } = useTranslation('common');
  const { t } = useTranslation('dashboard');

  const [mustBeIncluded, setMustBeIncluded] = useState(true);
  const [usage, setUsage] = useState<InclusionUsage>(InclusionUsage.Any);
  const [isHardExclude, setIsHardExclude] = useState(true);

  const availableStars = useMemo(() => {
    if (type === 'excludable') return [];
    const stats = usageStats.get(studentId)?.stars;
    if (!stats) return [];
    const groupedStars = new Map<number, { normal: number; assist: number }>();
    for (const [star, count] of stats.entries()) {
      const absStar = Math.abs(star);
      if (!groupedStars.has(absStar)) {
        groupedStars.set(absStar, { normal: 0, assist: 0 });
      }
      const current = groupedStars.get(absStar)!;
      if (star > 0) current.normal += count;
      else current.assist += count;
    }
    return Array.from(groupedStars.entries()).sort((a, b) => b[0] - a[0]);
  }, [studentId, usageStats, type]);

  useEffect(() => {
    if (isExpanded && type === 'includable') {
      setSelectedStars(new Set(availableStars.map((s) => s[0])));
    }
  }, [isExpanded, availableStars, type]);

  const handleStarToggle = (absStar: number) => {
    const newSet = new Set(selectedStars);
    if (newSet.has(absStar)) newSet.delete(absStar);
    else newSet.add(absStar);
    setSelectedStars(newSet);
  };

  const handleSelectAllStars = () => {
    if (selectedStars.size === availableStars.length) setSelectedStars(new Set());
    else setSelectedStars(new Set(availableStars.map((s) => s[0])));
  };

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'includable') {
      if (selectedStars.size > 0) {
        const finalStarValues = Array.from(selectedStars);
        onAdd({
          id: studentId,
          starValues: finalStarValues,
          mustBeIncluded,
          usage,
        });
      }
    } else {
      onAdd({ id: studentId, isHardExclude });
    }
  };

  const handleDetailClick = (e: React.MouseEvent) => e.stopPropagation();

  const isApplyDisabled = type === 'includable' && selectedStars.size === 0;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700">
      <div onClick={onToggleExpand} className="p-2 hover:bg-teal-500/20 dark:hover:bg-teal-500/50 cursor-pointer flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img className="h-6 w-6 rounded-full object-cover" src={`data:image/webp;base64,${portraitData[studentId]}`} alt={`${student.Name} portrait`} />
          <span className="font-bold text-neutral-800 dark:text-neutral-100">{student.Name}</span>
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {usageStats.get(studentId)?.total || 0}
          {t_c('times')}
        </span>
      </div>
      {isExpanded && (
        <div className="p-2 bg-neutral-100 dark:bg-neutral-900/70" onClick={handleDetailClick}>
          {type === 'includable' && (
            <>
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-neutral-900 dark:text-white font-bold">{t('selectStar')}</h4>
                <label className="text-neutral-700 dark:text-white text-sm">
                  <input type="checkbox" checked={selectedStars.size > 0 && selectedStars.size === availableStars.length} onChange={handleSelectAllStars} className="mr-1" />
                  {t_c('selectAll')}
                </label>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-2 text-sm">
                {availableStars.map(([absStar, counts]) => (
                  <label key={absStar} className="flex items-center text-neutral-700 dark:text-white cursor-pointer">
                    <input type="checkbox" checked={selectedStars.has(absStar)} onChange={() => handleStarToggle(absStar)} className="mr-2" />
                    <StarRating n={absStar} />
                    <span className="ml-2 text-xs">
                      ({counts.normal > 0 && `${t('normal')}: ${counts.normal}`}
                      {counts.normal > 0 && counts.assist > 0 && ' / '}
                      {counts.assist > 0 && `${t('assist')}: ${counts.assist}`})
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {type === 'includable' && (
            <div className="mt-2 pt-2 border-t border-neutral-300 dark:border-neutral-600 space-y-2 text-sm">
              <label className="flex items-center text-neutral-700 dark:text-white">
                <input type="checkbox" checked={mustBeIncluded} onChange={(e) => setMustBeIncluded(e.target.checked)} className="mr-2" />
                {t('mustBeIncluded')}
              </label>
              <div className="text-neutral-700 dark:text-white">
                <span className="font-semibold">{t('usageCount')}:</span>
                <div className="flex justify-around mt-1">
                  <label>
                    <input type="radio" name={`usage-${studentId}`} checked={usage === InclusionUsage.Any} onChange={() => setUsage(InclusionUsage.Any)} className="mr-1" />
                    {t('usageAny')}
                  </label>
                  <label>
                    <input type="radio" name={`usage-${studentId}`} checked={usage === InclusionUsage.Assist} onChange={() => setUsage(InclusionUsage.Assist)} className="mr-1" />
                    {t('usageAssist')}
                  </label>
                  <label>
                    <input type="radio" name={`usage-${studentId}`} checked={usage === InclusionUsage.Twice} onChange={() => setUsage(InclusionUsage.Twice)} className="mr-1" />
                    {t('usageTwice')}
                  </label>
                </div>
              </div>
            </div>
          )}
          {type === 'excludable' && (
            <div className={`mt-2 space-y-2 text-sm`}>
              <div className="text-neutral-700 dark:text-white">
                <div className="flex justify-around mt-1">
                  <label>
                    <input type="radio" name={`exclude-${studentId}`} checked={isHardExclude} onChange={() => setIsHardExclude(true)} className="mr-1" />
                    {t('hardExclude')}
                  </label>
                  <label>
                    <input type="radio" name={`exclude-${studentId}`} checked={!isHardExclude} onChange={() => setIsHardExclude(false)} className="mr-1" />
                    {t('allowOnce')}
                  </label>
                </div>
              </div>
            </div>
          )}

          <button onClick={handleApply} disabled={isApplyDisabled} className="w-full bg-bluearchive-botton-blue hover:bg-sky-500 text-black p-1 mt-2 rounded disabled:opacity-50">
            {t_c('confirm')}
          </button>
        </div>
      )}
    </div>
  );
};

const FilterConditionBuilder: React.FC<{
  studentData: StudentData;
  usageStats: UsageStats;
  onAdd: (condition: IncludableStudentCondition | ExcludableStudentCondition) => void;
  type: 'includable' | 'excludable';
  placeholderText: string;
  portraitData: PortraitData;
}> = ({ studentData, usageStats, onAdd, type, placeholderText, portraitData }) => {
  const [searchText, setSearchText] = useState('');
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;

  const matcher = useSearchMatcher(locale);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  const studentOptions = useMemo(() => {
    const sortFn = ([keyA]: [string, Student], [keyB]: [string, Student]) => {
      const statA = usageStats.get(Number(keyA))?.total || 0;
      const statB = usageStats.get(Number(keyB))?.total || 0;
      return statB - statA;
    };

    if (!searchText) return Object.entries(studentData).sort(sortFn);

    return Object.entries(studentData)
      .filter(([, s]) => {
        return matcher(s.Name, searchText) || s.SearchTags.some((tag) => matcher(tag, searchText));
      })
      .sort(sortFn);
  }, [studentData, searchText, usageStats, matcher]); //

  const handleAddCondition = (condition: IncludableStudentCondition | ExcludableStudentCondition) => {
    onAdd(condition);
    setSearchText('');
    setDropdownOpen(false);
    setExpandedId(null);
  };

  const handleToggleExpand = (id: number) => setExpandedId((prevId) => (prevId === id ? null : id));

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        placeholder={placeholderText}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        onFocus={() => setDropdownOpen(true)}
        className="w-full rounded-md border border-neutral-300 bg-white p-2 text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white dark:placeholder:text-neutral-400"
      />
      {isDropdownOpen && (
        <div className="absolute z-10 mt-1 w-full max-h-83 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
          {studentOptions.length > 0 ? (
            studentOptions
              .slice(0, 50)
              .map(([id, s]) => (
                <StudentDropdownItem
                  key={Number(id)}
                  student={s}
                  studentId={Number(id)}
                  usageStats={usageStats}
                  isExpanded={expandedId === Number(id)}
                  type={type}
                  portraitData={portraitData}
                  onToggleExpand={() => handleToggleExpand(Number(id))}
                  onAdd={handleAddCondition}
                />
              ))
          ) : (
            <div className="p-2 text-neutral-500 dark:text-neutral-400">{t('noResults')}</div>
          )}
        </div>
      )}
    </div>
  );
};

export const TableFilterPanelComponent: React.FC<{
  tableFilters: TableFilters;
  handleTableFilterChange: (filters: TableFilters) => void;
  studentData: StudentData;
  usageStats: UsageStats;
  portraitData: PortraitData;
}> = ({ tableFilters, handleTableFilterChange, studentData, usageStats, portraitData }) => {
  const { t } = useTranslation('dashboard');

  const updateFilters = (newFilters: Partial<TableFilters>) => {
    const updated = { ...tableFilters, ...newFilters };
    handleTableFilterChange(updated);
  };

  const addCondition = (type: 'includable' | 'excludable', cond: IncludableStudentCondition | ExcludableStudentCondition) => {
    const currentConditions = tableFilters[type];
    if (!currentConditions.find((c) => c.id === cond.id)) {
      if (type === 'includable') {
        updateFilters({
          includable: [...tableFilters.includable, cond as IncludableStudentCondition],
        });
      } else {
        updateFilters({
          excludable: [...tableFilters.excludable, cond as ExcludableStudentCondition],
        });
      }
    }
  };

  const removeCondition = (type: 'includable' | 'excludable', id: number) => {
    if (type === 'includable') {
      updateFilters({
        includable: tableFilters.includable.filter((c) => c.id !== id),
      });
    } else {
      updateFilters({
        excludable: tableFilters.excludable.filter((c) => c.id !== id),
      });
    }
  };

  const ConditionTag: React.FC<{
    cond: IncludableStudentCondition | ExcludableStudentCondition;
    onRemove: () => void;
  }> = ({ cond, onRemove }) => {
    const getIncludableTagText = (c: IncludableStudentCondition) => {
      let tags = [];
      if (c.mustBeIncluded) tags.push(t('tagMustInclude'));
      if (c.usage === InclusionUsage.Assist) tags.push(t('tagUsageAssist'));
      else if (c.usage === InclusionUsage.Twice) tags.push(t('tagUsageTwice'));
      return tags.join(' ');
    };

    const getExcludableTagText = (c: ExcludableStudentCondition) => {
      return c.isHardExclude ? t('tagHardExclude') : t('tagAllowOnce');
    };

    return (
      <div className="bg-neutral-200 text-neutral-700 dark:bg-neutral-600 dark:text-white px-1 pr-2 py-1 rounded-full flex items-center space-x-2 text-sm">
        <img className="h-6 w-6 rounded-full object-cover" src={`data:image/webp;base64,${portraitData[cond.id]}`} alt={`${studentData[cond.id]?.Name} portrait`} />
        <span className="flex items-center">
          {studentData[cond.id]?.Name}
          {'starValues' in cond && cond.starValues.length > 0 && (
            <span className="mx-1 flex flex-row">
              {cond.starValues.map((n, i) => (
                <StarRating key={i} n={n} />
              ))}
            </span>
          )}
          {'mustBeIncluded' in cond ? (
            <span className="text-sky-700 dark:text-sky-300 font-semibold">{getIncludableTagText(cond)}</span>
          ) : (
            <span className="text-red-600 dark:text-red-400 font-semibold ml-1">{getExcludableTagText(cond as ExcludableStudentCondition)}</span>
          )}
        </span>
        <button onClick={onRemove} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold">
          X
        </button>
      </div>
    );
  };

  return (
    <div data-component-name="TableFilterPanelComponent" className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
      <div className="space-y-3">
        <h3 className="font-bold text-lg text-sky-600 dark:text-sky-300">{t('includableStudentTitle')}</h3>
        <FilterConditionBuilder
          studentData={studentData}
          usageStats={usageStats}
          onAdd={(c) => addCondition('includable', c)}
          type="includable"
          placeholderText={t('searchStudentByName')}
          portraitData={portraitData}
        />
        <div className="flex flex-wrap gap-2 pt-2 min-h-[42px]">
          {tableFilters.includable.map((c) => (
            <ConditionTag key={c.id} cond={c} onRemove={() => removeCondition('includable', c.id)} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-lg text-red-500 dark:text-red-400">{t('excludableStudentTitle')}</h3>
        <FilterConditionBuilder
          studentData={studentData}
          usageStats={usageStats}
          onAdd={(c) => addCondition('excludable', c)}
          type="excludable"
          placeholderText={t('searchStudentByName')}
          portraitData={portraitData}
        />
        <div className="flex flex-wrap gap-2 pt-2 min-h-[42px]">
          {tableFilters.excludable.map((c) => (
            <ConditionTag key={c.id} cond={c} onRemove={() => removeCondition('excludable', c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};
