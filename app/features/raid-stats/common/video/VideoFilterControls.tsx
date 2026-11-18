import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { StudentFilterBar } from '../../dashboard/StudentFilterBar';
import type { VideoFilterState, VideoSort } from './videoFilters';

const sorts: VideoSort[] = ['score_desc', 'score_asc', 'upload_desc', 'upload_asc'];
const inputClass = 'min-h-11 sm:min-h-7 sm:text-sm min-w-0 w-full border border-neutral-300 bg-white px-2 text-base text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100';

export function VideoQuickControls({
  difficulty,
  sortBy,
  difficulties,
  onDifficultyChange,
  onSortChange,
}: {
  difficulty: string;
  sortBy: VideoSort;
  difficulties: string[];
  onDifficultyChange: (value: string) => void;
  onSortChange: (value: VideoSort) => void;
}) {
  const { t } = useTranslation(['dashboard', 'mypage']);
  const { t: tg } = useTranslation('game');
  const { t: tr } = useTranslation('raidInfo');
  return (
    <>
      <select aria-label={tg('difficulty')} value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)} className={`${inputClass} sm:w-40`}>
        {difficulties.map((value) => (
          <option key={value} value={value}>
            {value === 'All' ? tr('allDifficulties') : tr(value, value)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('mypage:raids.filters.sort')}
        value={sortBy}
        onChange={(event) => {
          const value = sorts.find((sort) => sort === event.target.value);
          if (value) onSortChange(value);
        }}
        className={`${inputClass} sm:w-44 max-[359px]:col-span-2 max-[359px]:row-start-2`}
      >
        {sorts.map((value) => (
          <option key={value} value={value}>
            {t(`videos_sort_${value}`)}
          </option>
        ))}
      </select>
    </>
  );
}

export function VideoAdvancedFilters({
  filters,
  isGrandAssault,
  onChange,
  studentNames,
  searchFn,
  usageCounts,
  resultsPresentation = 'dropdown',
  quickControls,
  serverControl,
}: {
  filters: VideoFilterState;
  isGrandAssault: boolean;
  onChange: (patch: Partial<VideoFilterState>) => void;
  studentNames: Map<number, string>;
  searchFn: (query: string, excludedIds: Set<number>) => Array<[number, string]>;
  usageCounts: Map<number, number>;
  resultsPresentation?: 'dropdown' | 'inline';
  quickControls?: ReactNode;
  serverControl?: ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  const { t: tu } = useTranslation('ui');
  const minId = useId();
  const maxId = useId();
  const toggles = [
    ['tlOnly', 'videos_filter_tl'],
    ['targetTypeOnly', 'videos_filter_target_type'],
    ['partyInfoOnly', 'videos_filter_party_info'],
  ] as const;
  return (
    <div className="space-y-4 sm:space-y-2">
      <div className="space-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:space-y-0">
        {serverControl}
        {quickControls && <div className="flex shrink-0 gap-2">{quickControls}</div>}
        <fieldset>
          <legend className="mb-2 font-medium text-neutral-700 dark:text-neutral-200 sm:float-left sm:mb-0 sm:mr-2 sm:leading-7">{t('byScore')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-2">
            <div>
              <label htmlFor={minId} className="mb-1 block sm:sr-only text-xs text-neutral-500 dark:text-neutral-400">
                {t('videos_score_min_placeholder')}
              </label>
              <CustomNumberInput
                id={minId}
                value={filters.scoreMin}
                onChange={(scoreMin) => onChange({ scoreMin })}
                placeholder={t('videos_score_min_placeholder')}
                className={`${inputClass} sm:w-24`}
              />
            </div>
            <div>
              <label htmlFor={maxId} className="mb-1 block sm:sr-only text-xs text-neutral-500 dark:text-neutral-400">
                {tu('max')}
              </label>
              <CustomNumberInput id={maxId} value={filters.scoreMax} onChange={(scoreMax) => onChange({ scoreMax })} placeholder={tu('max')} className={`${inputClass} sm:w-24`} />
            </div>
          </div>
        </fieldset>
        <div className="grid gap-1 sm:flex sm:flex-wrap sm:gap-x-4 sm:self-end">
          {toggles
            .filter(([key]) => key !== 'targetTypeOnly' || isGrandAssault)
            .map(([key, label]) => (
              <label key={key} className="flex min-h-11 sm:min-h-7 cursor-pointer items-center gap-2 text-neutral-700 dark:text-neutral-200">
                <input type="checkbox" className="h-4 w-4" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />
                {t(label)}
              </label>
            ))}
        </div>
      </div>
      <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700 sm:pt-2">
        <StudentFilterBar
          filter={filters.students}
          onChange={(students) => onChange({ students })}
          studentNames={studentNames}
          searchFn={searchFn}
          usageCounts={usageCounts}
          resultsPresentation={resultsPresentation}
        />
      </div>
    </div>
  );
}
