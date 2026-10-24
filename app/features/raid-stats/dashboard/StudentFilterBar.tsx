import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { SearchableDropdown } from '~/components/common/SearchableDropdown';
import type { PortraitData } from '../../../types/raidReport';
import { createStudentFilter, type StudentFilterState } from './studentFilter';

interface StudentFilterBarProps {
  filter: StudentFilterState;
  onChange: (filter: StudentFilterState) => void;
  studentNames: Map<number, string>;
  portraitData?: PortraitData;
  searchFn: (query: string, excludedIds: Set<number>) => Array<[number, string]>;
  usageCounts?: Map<number, number>;
  filteredCount?: number;
  totalCount?: number;
  resultsPresentation?: 'dropdown' | 'inline';
  /** Match dense control panels (e.g. composition chart) instead of using touch-sized controls on mobile */
  compact?: boolean;
}

export function StudentFilterBar({
  filter,
  onChange,
  studentNames,
  portraitData,
  searchFn,
  usageCounts,
  filteredCount,
  totalCount,
  resultsPresentation = 'dropdown',
  compact = false,
}: StudentFilterBarProps) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const listboxId = useId();
  const hintId = useId();
  const searchRef = useRef<HTMLDivElement>(null);
  const [addMode, setAddMode] = useState<'exclude' | 'include'>('exclude');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inline = resultsPresentation === 'inline';
  const touchHeight = compact ? 'min-h-7' : 'min-h-11 sm:min-h-7';
  const results = useMemo(() => searchFn(search, new Set([...filter.excludeIds, ...filter.includeIds])), [searchFn, search, filter.excludeIds, filter.includeIds]);
  const hasFilter = filter.excludeIds.length > 0 || filter.includeIds.length > 0;

  function addStudent(id: number) {
    const excludeIds = filter.excludeIds.filter((value) => value !== id);
    const includeIds = filter.includeIds.filter((value) => value !== id);
    const nextExcludeIds = addMode === 'exclude' ? [...excludeIds, id] : excludeIds;
    onChange({ excludeIds: nextExcludeIds, includeIds: addMode === 'include' ? [...includeIds, id] : includeIds, allowAssist: nextExcludeIds.length > 0 && filter.allowAssist });
    setSearch('');
    setOpen(inline);
    if (inline) searchRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }

  return (
    <div className={inline ? 'space-y-3' : 'flex flex-wrap items-center gap-x-3 gap-y-2'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-neutral-700 dark:text-neutral-200 ${compact ? '' : 'font-medium'}`}>
          {t('composition.mopup_filter')}
          {hasFilter && filteredCount !== undefined && totalCount !== undefined && (
            <span className="ml-2 text-xs font-mono text-neutral-500">
              {filteredCount}/{totalCount}
            </span>
          )}
        </span>
        {hasFilter && (
          <button type="button" onClick={() => onChange(createStudentFilter())} className={`${touchHeight} px-2 text-sm text-neutral-600 dark:text-neutral-300`}>
            {t_ui('reset')}
          </button>
        )}
      </div>
      {(['exclude', 'include'] as const).map((mode) => {
        const ids = mode === 'exclude' ? filter.excludeIds : filter.includeIds;
        if (ids.length === 0) return null;
        return (
          <div key={mode} className={`flex flex-wrap items-center gap-2 ${inline ? '' : 'order-3 w-full'}`}>
            <span className="text-xs text-neutral-600 dark:text-neutral-300">{mode === 'exclude' ? t('tagHardExclude') : t_ui('include')}:</span>
            {ids.map((id) => {
              const name = studentNames.get(id) ?? String(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`${name}, ${mode === 'exclude' ? t('tagHardExclude') : t_ui('include')}, ${t_ui('delete')}`}
                  onClick={() => {
                    const remaining = ids.filter((value) => value !== id);
                    onChange(mode === 'exclude' ? { ...filter, excludeIds: remaining, allowAssist: remaining.length > 0 && filter.allowAssist } : { ...filter, includeIds: remaining });
                  }}
                  className={`flex ${touchHeight} items-center gap-1.5 rounded-full border px-2 text-xs ${mode === 'exclude' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300' : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300'}`}
                >
                  {portraitData?.[id] && <img className="h-6 w-6 rounded-full object-cover" src={`data:image/webp;base64,${portraitData[id]}`} alt="" />}
                  <span>{name}</span>
                  <FiX size={14} />
                </button>
              );
            })}
          </div>
        );
      })}
      <div className={inline ? 'space-y-3' : 'contents'}>
        <div className={inline ? undefined : 'order-2'}>
          <label
            title={t('composition.allow_assist_hint')}
            className={`flex ${touchHeight} items-center gap-2 text-sm ${filter.excludeIds.length === 0 ? 'text-neutral-500 dark:text-neutral-400' : 'cursor-pointer text-neutral-800 dark:text-neutral-100'}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={filter.allowAssist}
              disabled={filter.excludeIds.length === 0}
              aria-describedby={hintId}
              onChange={(event) => onChange({ ...filter, allowAssist: event.target.checked })}
            />
            {t('composition.allow_assist')}
          </label>
          <p id={hintId} className={inline ? 'text-xs text-neutral-500 dark:text-neutral-400' : 'sr-only'}>
            {t('composition.allow_assist_hint')}
          </p>
        </div>
        <div className={`flex gap-2 ${inline ? 'flex-col' : 'order-1 flex-wrap items-center'}`}>
          <div className={`flex shrink-0 ${compact ? 'border border-neutral-200 dark:border-neutral-700' : ''}`}>
            {(['exclude', 'include'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={addMode === mode}
                onClick={() => setAddMode(mode)}
                className={
                  compact
                    ? `flex-1 whitespace-nowrap border-r px-3 py-1.5 text-xs font-medium last:border-r-0 border-neutral-200 dark:border-neutral-700 ${addMode === mode ? 'bg-ba-btn-blue text-black' : 'cursor-pointer bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}`
                    : `min-h-11 sm:min-h-7 flex-1 whitespace-nowrap border px-3 text-sm ${addMode === mode ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-950' : 'border-neutral-300 bg-ba-btn-gray text-neutral-950 dark:border-neutral-600'}`
                }
              >
                {mode === 'exclude' ? t('tagHardExclude') : t_ui('include')}
              </button>
            ))}
          </div>
          <div ref={searchRef} className={inline ? 'w-full' : compact ? 'min-w-0 flex-1 sm:w-64 sm:flex-none' : 'w-64'}>
            <SearchableDropdown
              value={search}
              onChange={setSearch}
              isOpen={open}
              onOpenChange={setOpen}
              placeholder={t('searchStudentByName')}
              listboxId={listboxId}
              onSelectIndex={(index) => addStudent(results[index][0])}
              resultsPresentation={resultsPresentation}
              noResultsText={t_ui('noSearchResults')}
              loadMoreText={t_ui('loadMore')}
              itemClassName="flex min-h-11 sm:min-h-7 w-full items-center gap-2 px-2 py-2 sm:py-1 text-left text-sm text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-700"
              items={results.map(([id, name]) => ({
                id: String(id),
                content: (
                  <>
                    {portraitData?.[id] && <img className="h-7 w-7 sm:h-6 sm:w-6 shrink-0 rounded-full object-cover" src={`data:image/webp;base64,${portraitData[id]}`} alt="" />}
                    <span className="min-w-0 flex-1 truncate" title={name}>
                      {name}
                    </span>
                    {usageCounts && <span className="shrink-0 font-mono text-xs text-neutral-500 dark:text-neutral-400">{usageCounts.get(id) || ''}</span>}
                  </>
                ),
              }))}
              inputClassName={
                compact
                  ? 'w-full border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
                  : 'min-h-11 sm:min-h-7 w-full border border-neutral-300 bg-white px-3 text-base sm:text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100'
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
