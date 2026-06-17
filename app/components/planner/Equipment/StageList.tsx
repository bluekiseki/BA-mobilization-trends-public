import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { NumberInput } from '../common/NumberInput';
import { EquipmentItemIcon, type ResolvedStage } from './common';
import { useEffect, useMemo, useState } from 'react';
import { FaRedo } from 'react-icons/fa';
// useTranslation import
import { useTranslation } from 'react-i18next';

export interface PaginationControlsProps {
  currentPage: number;
  maxPage: number;
  setCurrentPage: (page: number) => void;
  chaptersPerPage: number;
}

export interface PaginatedStageListProps {
  title: string;
  type: 'Normal' | 'Hard';
  allStages: ResolvedStage[]; // List of all parsed stages
  itemFilter: Set<string>; //  for filtering
  isSortedDesc: boolean; //  for sorting
  isItemFilterActive: boolean; // Determine paging method
  runCounts: Record<number, number>;
  onRunCountChange: (id: number, count: number) => void;
  onReset: () => void;
  resetButtonClass: string;

  farmingDays: number;
  eventDataForIcon: EventData;
  iconData: IconData;
  iconInfoData: IconInfos;
  studentFilter?: Set<number>; // Hard exclusive: elephant student ID filter
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({ currentPage, maxPage, setCurrentPage, chaptersPerPage: _chaptersPerPage }) => {
  // Use useTranslation hook
  // const { t } = useTranslation("planner");
  const pageNumbers = Array.from({ length: maxPage }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap justify-center items-center gap-1 py-1">
      <button
        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-2 py-0.5 text-sm font-semibold rounded disabled:opacity-50 bg-neutral-200 dark:bg-neutral-700"
      >
        &lt;
      </button>
      {pageNumbers.map((num) => (
        <button
          key={num}
          onClick={() => setCurrentPage(num)}
          className={`px-2 py-0.5 text-xs font-semibold rounded ${currentPage === num ? 'bg-blue-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
        >
          {num}
        </button>
      ))}
      <button
        onClick={() => setCurrentPage(Math.min(maxPage, currentPage + 1))}
        disabled={currentPage === maxPage}
        className="px-2 py-0.5 text-sm font-semibold rounded disabled:opacity-50 bg-neutral-200 dark:bg-neutral-700"
      >
        &gt;
      </button>
    </div>
  );
};

export const PaginatedStageList: React.FC<PaginatedStageListProps> = ({
  title,
  type,
  allStages,
  itemFilter,
  isSortedDesc,
  isItemFilterActive,
  runCounts,
  onRunCountChange,
  onReset,
  resetButtonClass,
  farmingDays,
  eventDataForIcon,
  iconData,
  iconInfoData: _iconInfoData,
  studentFilter,
}) => {
  // Use useTranslation hook
  const { t } = useTranslation('planner');

  // --- Internal Pagination Logic ---
  const [currentPage, setCurrentPage] = useState(1);
  const chaptersPerPage = 3;
  const ITEMS_PER_PAGE_WHEN_FILTERED = 20;

  // 1. Filtering and Sorting (Performed by child, not parent)
  const filteredAndSortedStages = useMemo(() => {
    // 1. Type Filter (Hard/Normal) and remove stages with no drops
    let stages = allStages.filter((s) => s.type === type && Object.keys(s.drops).length > 0);

    // 2. Currency Filter
    if (itemFilter.size > 0) {
      stages = stages.filter((stage) => Object.keys(stage.drops).some((dropKey) => itemFilter.has(dropKey)));
    }

    // 3. Student Elephant Filter (Hard exclusive)
    if (studentFilter && studentFilter.size > 0) {
      stages = stages.filter((stage) =>
        Object.keys(stage.drops).some((key) => {
          const [dropType, idStr] = key.split('_');
          if (dropType !== 'Item') return false;
          const id = Number(idStr);
          return id >= 10000 && id <= 29999 && studentFilter.has(id);
        }),
      );
    }

    // 4. Sorting
    if (isSortedDesc) {
      return stages.sort((a, b) => b.id - a.id); // Descending
    }
    return stages.sort((a, b) => a.id - b.id); // Ascending (Default)
  }, [allStages, type, itemFilter, isSortedDesc, studentFilter]);

  // 2. Calculate Max Pages
  const maxPage = useMemo(() => {
    if (isItemFilterActive) {
      // When Currency Filter on: 20 items per page
      return Math.max(1, Math.ceil(filteredAndSortedStages.length / ITEMS_PER_PAGE_WHEN_FILTERED));
    }
    // Default: Chapter based
    // Prevent maxChapter from becoming -Infinity when filteredAndSortedStages is empty
    const maxChapter = filteredAndSortedStages.length > 0 ? Math.max(1, ...filteredAndSortedStages.map((s) => s.chapter)) : 1;
    return Math.max(1, Math.ceil(maxChapter / chaptersPerPage));
  }, [filteredAndSortedStages, isItemFilterActive, chaptersPerPage]);

  // 3. Stages to display on current page
  const paginatedStages = useMemo(() => {
    if (isItemFilterActive) {
      // When Currency Filter on: slice to 20 items per page
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE_WHEN_FILTERED;
      const endIndex = startIndex + ITEMS_PER_PAGE_WHEN_FILTERED;
      return filteredAndSortedStages.slice(startIndex, endIndex);
    } else {
      // Default state: Filter by chapter
      const startChapter = (currentPage - 1) * chaptersPerPage + 1;
      const endChapter = currentPage * chaptersPerPage;
      return filteredAndSortedStages.filter((s) => s.chapter >= startChapter && s.chapter <= endChapter);
    }
  }, [filteredAndSortedStages, isItemFilterActive, currentPage, chaptersPerPage]);

  // 4. Reset page number when filter/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredAndSortedStages, isItemFilterActive]); // Go to page 1 if filtered/sorted list changes

  const maxRuns = type === 'Hard' ? farmingDays * 3 : 9999;

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-base font-bold dark:text-neutral-200">
          {title} {type === 'Hard' && `(${t('common.max', 'Max')} ×${farmingDays * 3})`}
        </h2>
        <button onClick={onReset} className={resetButtonClass}>
          <FaRedo size={10} /> {t(type === 'Hard' ? 'equipment.resetHard' : 'equipment.resetNormal')}
        </button>
      </div>

      <PaginationControls currentPage={currentPage} maxPage={maxPage} setCurrentPage={setCurrentPage} chaptersPerPage={chaptersPerPage} />

      <div className="border-t dark:border-neutral-700">
        {paginatedStages.map((stage, index) => (
          <div key={stage.id} className={`flex flex-row items-start gap-2 px-1 py-1.5 ${index > 0 ? 'border-t dark:border-neutral-700' : ''}`}>
            <span className="font-bold text-neutral-800 dark:text-neutral-200 shrink-0 w-9 text-sm pt-0.5">
              {stage.chapter}-{stage.stageNum}
            </span>
            <div className="flex-1 flex flex-wrap gap-1">
              {Object.keys(stage.drops).map((key) => {
                const itemType = key.split('_')[0] as keyof IconInfos;
                const itemId = key.split('_')[1];
                return <EquipmentItemIcon key={key} type={itemType} itemId={itemId} amount={stage.drops[key]} size={11} eventData={eventDataForIcon} iconData={iconData} />;
              })}
            </div>
            <div className="w-20 shrink-0">
              <NumberInput value={runCounts[stage.id] || 0} onChange={(val) => onRunCountChange(stage.id, val || 0)} min={0} max={maxRuns} />
            </div>
          </div>
        ))}
        {paginatedStages.length === 0 && <p className="py-3 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('equipment.noStagesFound')}</p>}
      </div>

      <PaginationControls currentPage={currentPage} maxPage={maxPage} setCurrentPage={setCurrentPage} chaptersPerPage={chaptersPerPage} />
    </div>
  );
};
