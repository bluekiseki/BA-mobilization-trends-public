import type { Student } from '~/types/data';
import { InclusionUsage, type ExcludableStudentCondition, type IncludableStudentCondition, type PortraitData, type StudentData, type TableFilters, type UsageStats } from '../common';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarRating } from '~/components/StarRating';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';
import { FiCopy, FiCheck, FiCode, FiDownload, FiX, FiPlus, FiRotateCcw } from 'react-icons/fi';
import { CustomNumberInput } from '~/components/CustomInput';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { SearchableDropdown } from '~/components/SearchableDropdown';

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
  const { t: t_ui } = useTranslation('ui');
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
      const current = groupedStars.get(absStar);
      if (!current) continue;
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
      {isExpanded && availableStars && (
        <div className="p-2 bg-neutral-100 dark:bg-neutral-900/70" onClick={handleDetailClick}>
          {type === 'includable' && (
            <>
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-neutral-900 dark:text-white font-bold">{t('selectStar')}</h4>
                <label className="text-neutral-700 dark:text-white text-sm">
                  <input type="checkbox" checked={selectedStars.size > 0 && selectedStars.size === availableStars.length} onChange={handleSelectAllStars} className="mr-1" />
                  {t_ui('selectAll')}
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

          <button onClick={handleApply} disabled={isApplyDisabled} className="w-full bg-ba-btn-blue hover:bg-sky-500 text-black p-1 mt-2 rounded disabled:opacity-50">
            {t_ui('confirm')}
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
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;

  const matcher = useSearchMatcher(locale);

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
  }, [studentData, searchText, usageStats, matcher]);

  const handleAddCondition = (condition: IncludableStudentCondition | ExcludableStudentCondition) => {
    onAdd(condition);
    setSearchText('');
    setDropdownOpen(false);
    setExpandedId(null);
  };

  const handleToggleExpand = (id: number) => setExpandedId((prevId) => (prevId === id ? null : id));

  const visibleOptions = studentOptions.slice(0, 50);

  return (
    <SearchableDropdown
      value={searchText}
      onChange={setSearchText}
      isOpen={isDropdownOpen}
      onOpenChange={setDropdownOpen}
      placeholder={placeholderText}
      inputClassName="w-full rounded-md border border-neutral-300 bg-white p-2 text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white dark:placeholder:text-neutral-400"
      itemCount={visibleOptions.length}
      onSelectIndex={(i) => handleToggleExpand(Number(visibleOptions[i][0]))}
    >
      {(highlightedIndex, onHighlight) => (
        <div className="absolute z-10 mt-1 w-full max-h-83 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
          {visibleOptions.length > 0 ? (
            visibleOptions.map(([id, s], index) => (
              <div key={Number(id)} data-index={index} onMouseEnter={() => onHighlight(index)} className={index === highlightedIndex ? 'bg-teal-500/10 dark:bg-teal-500/20' : ''}>
                <StudentDropdownItem
                  student={s}
                  studentId={Number(id)}
                  usageStats={usageStats}
                  isExpanded={expandedId === Number(id)}
                  type={type}
                  portraitData={portraitData}
                  onToggleExpand={() => handleToggleExpand(Number(id))}
                  onAdd={handleAddCondition}
                />
              </div>
            ))
          ) : (
            <div className="p-2 text-neutral-500 dark:text-neutral-400">{t('noResults')}</div>
          )}
        </div>
      )}
    </SearchableDropdown>
  );
};

export const TableFilterPanelComponent: React.FC<{
  tableFilters: TableFilters;
  handleTableFilterChange: (filters: TableFilters) => void;
  studentData: StudentData;
  usageStats: UsageStats;
  portraitData: PortraitData;
  partyCountMin?: number;
  partyCountMax?: number;
}> = ({ tableFilters, handleTableFilterChange, studentData, usageStats, portraitData, partyCountMin = 1, partyCountMax = 99 }) => {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const { growthPlans } = useGlobalStore();
  const [viewMode, setViewMode] = useState<'gui' | 'code'>('gui');
  const [codeText, setCodeText] = useState('');
  const [codeError, setCodeError] = useState('');
  const [copied, setCopied] = useState(false);

  const switchToCode = () => {
    setCodeText(JSON.stringify(tableFilters, null, 2));
    setCodeError('');
    setViewMode('code');
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleApplyCode = () => {
    try {
      const parsed = JSON.parse(codeText) as { includable: IncludableStudentCondition[]; excludable: ExcludableStudentCondition[] };
      if (!Array.isArray(parsed.includable) || !Array.isArray(parsed.excludable)) {
        setCodeError(t('filter_import_error'));
        return;
      }
      const validIncludable: IncludableStudentCondition[] = parsed.includable.filter((c) => typeof c.id === 'number' && Array.isArray(c.starValues) && typeof c.mustBeIncluded === 'boolean');
      const validExcludable: ExcludableStudentCondition[] = parsed.excludable.filter((c) => typeof c.id === 'number' && typeof c.isHardExclude === 'boolean');
      handleTableFilterChange({ includable: validIncludable, excludable: validExcludable });
      setViewMode('gui');
    } catch {
      setCodeError(t('filter_import_error'));
    }
  };

  const updateFilters = (newFilters: Partial<TableFilters>) => {
    const updated = { ...tableFilters, ...newFilters };
    handleTableFilterChange(updated);
  };

  const handleNumInput = (setter: (v: number) => void) => (e: number | null) => {
    const val = Number(e);
    if (!isNaN(val)) setter(val);
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

  const addAllMyStudentsAsAssist = () => {
    const myStudentIds = new Set(growthPlans.filter((plan) => plan.studentId !== null).map((plan) => plan.studentId as number));

    const alreadyAdded = new Set(tableFilters.excludable.map((c) => c.id));

    const allStudentIds = Object.keys(studentData).map((id) => Number(id));
    const toAdd = allStudentIds.filter((id) => !myStudentIds.has(id) && !alreadyAdded.has(id));

    if (toAdd.length === 0) return;

    const newConditions = toAdd.map((id) => ({
      id,
      isHardExclude: false,
    }));

    updateFilters({
      excludable: [...tableFilters.excludable, ...newConditions],
    });
  };

  const resetFilters = () => {
    updateFilters({
      includable: [],
      excludable: [],
    });
  };

  const ConditionTag: React.FC<{
    cond: IncludableStudentCondition | ExcludableStudentCondition;
    onRemove: () => void;
  }> = ({ cond, onRemove }) => {
    const getIncludableTagText = (c: IncludableStudentCondition) => {
      const tags: string[] = [];
      if (c.mustBeIncluded) tags.push(t_ui('required'));
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
            <span className="text-red-600 dark:text-red-400 font-semibold ml-1">{getExcludableTagText(cond)}</span>
          )}
        </span>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors">
          <FiX size={14} />
        </button>
      </div>
    );
  };

  return (
    <div data-component-name="TableFilterPanelComponent" className="flex flex-col gap-1 pb-4">
      {/* GUI mode */}
      {viewMode === 'gui' && (
        <>
          {/* Party count filter + code toggle row */}
          <div className="flex flex-wrap gap-x-2 sm:gap-x-4 gap-y-2 items-center pb-3 border-b border-neutral-200 dark:border-neutral-700 text-sm">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="tf-usePartyCount"
                checked={tableFilters.usePartyCount ?? false}
                onChange={(e) => updateFilters(e.target.checked ? { usePartyCount: true, minParty: partyCountMin, maxParty: partyCountMax } : { usePartyCount: false })}
              />
              <label htmlFor="tf-usePartyCount" className={`cursor-pointer ${tableFilters.usePartyCount ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400'}`}>
                {t('composition.total_parties')}:
              </label>
              <CustomNumberInput
                className="w-11 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-center text-xs disabled:opacity-40"
                disabled={!tableFilters.usePartyCount}
                value={tableFilters.minParty ?? partyCountMin}
                min={partyCountMin}
                max={partyCountMax}
                onChange={handleNumInput((v) => updateFilters({ minParty: v }))}
              />
              <span className="text-neutral-400">~</span>
              <CustomNumberInput
                className="w-11 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-center text-xs disabled:opacity-40"
                disabled={!tableFilters.usePartyCount}
                value={tableFilters.maxParty ?? partyCountMax}
                min={partyCountMin}
                max={partyCountMax}
                onChange={handleNumInput((v) => updateFilters({ maxParty: v }))}
              />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium cursor-pointer border shadow-sm transition-colors bg-ba-btn-gray text-neutral-600 border-neutral-300 hover:brightness-95 dark:bg-neutral-700 dark:text-neutral-300 dark:border-neutral-600"
              >
                <FiRotateCcw size={11} />
                {t_ui('reset')}
              </button>
              <label className="flex items-center gap-1.5 px-1 sm:px-2.5 py-1 text-xs font-medium cursor-pointer border shadow-sm transition-colors bg-ba-btn-gray text-neutral-600 border-neutral-300 hover:brightness-95 dark:bg-neutral-700 dark:text-neutral-300 dark:border-neutral-600">
                <input type="checkbox" onChange={switchToCode} className="hidden" />
                <FiCode size={11} />
                {t('filter_view_code')}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div className="flex flex-wrap gap-2 pt-2 min-h-10.5">
                {tableFilters.includable.map((c) => (
                  <ConditionTag key={c.id} cond={c} onRemove={() => removeCondition('includable', c.id)} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-red-500 dark:text-red-400">{t('excludableStudentTitle')}</h3>
                {growthPlans.length > 30 && (
                  <button
                    onClick={addAllMyStudentsAsAssist}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium border border-neutral-300 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                  >
                    <FiPlus size={12} />
                    {t('add_my_students')}
                  </button>
                )}
              </div>
              <FilterConditionBuilder
                studentData={studentData}
                usageStats={usageStats}
                onAdd={(c) => addCondition('excludable', c)}
                type="excludable"
                placeholderText={t('searchStudentByName')}
                portraitData={portraitData}
              />
              <div className="flex flex-wrap gap-2 pt-2 min-h-10.5">
                {tableFilters.excludable.map((c) => (
                  <ConditionTag key={c.id} cond={c} onRemove={() => removeCondition('excludable', c.id)} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Code mode */}
      {viewMode === 'code' && (
        <div className="flex flex-col gap-2">
          <textarea
            value={codeText}
            onChange={(e) => {
              setCodeText(e.target.value);
              setCodeError('');
            }}
            className="w-full h-48 p-3 text-xs font-mono border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-y focus:outline-none focus:border-sky-400"
            spellCheck={false}
          />
          {codeError && <p className="text-red-500 text-xs">{codeError}</p>}
          <div className="flex gap-2 items-center">
            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium cursor-pointer border shadow-sm transition-colors bg-ba-btn-blue text-black border-ba-btn-blue`}>
              <input type="checkbox" checked onChange={() => setViewMode('gui')} className="hidden" />
              <FiCode size={11} />
              {t('filter_view_code')}
            </label>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold transition-colors shadow-sm text-black ${copied ? 'bg-ba-btn-yellow' : 'bg-ba-btn-blue hover:brightness-110 active:brightness-95'}`}
            >
              {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
              {copied ? t('filter_copy_done') : t('filter_export')}
            </button>
            <button
              onClick={handleApplyCode}
              className="flex items-center gap-1.5 bg-ba-btn-gray hover:brightness-95 text-black px-4 py-1.5 text-xs font-bold transition-colors shadow-sm border border-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:border-neutral-600"
            >
              <FiDownload size={13} />
              {t_ui('apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
