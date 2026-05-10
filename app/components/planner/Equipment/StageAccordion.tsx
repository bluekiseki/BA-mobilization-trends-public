import { useMemo, useState } from 'react';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { NumberInput } from '../common/NumberInput';
import { EquipmentItemIcon, type ResolvedStage } from './common';
import { blueprintIdToType } from '~/utils/blueprintUtils';
import { FaChevronRight, FaRedo } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface StageAccordionProps {
  type: 'Normal' | 'Hard';
  stages: ResolvedStage[];
  itemFilter: Set<string>;
  isSortedDesc: boolean;
  runCounts: Record<number, number>;
  onRunCountChange: (id: number, count: number) => void;
  onReset: () => void;
  farmingDays: number;
  needsMap: Record<string, number>;
  eventDataForIcon: EventData;
  iconData: IconData;
  iconInfoData: IconInfos;
  studentFilter?: Set<number>;
}

export const StageAccordion: React.FC<StageAccordionProps> = ({
  type,
  stages,
  itemFilter,
  isSortedDesc,
  runCounts,
  onRunCountChange,
  onReset,
  farmingDays,
  needsMap,
  eventDataForIcon,
  iconData,
  iconInfoData,
  studentFilter,
}) => {
  const { t } = useTranslation('planner');
  const maxRuns = type === 'Hard' ? farmingDays * 3 : 9999;
  const [closedChapters, setClosedChapters] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    let s = stages.filter((st) => st.type === type && Object.keys(st.drops).length > 0);
    if (itemFilter.size > 0) s = s.filter((st) => Object.keys(st.drops).some((k) => itemFilter.has(k)));
    if (studentFilter && studentFilter.size > 0) {
      s = s.filter((st) =>
        Object.keys(st.drops).some((key) => {
          const [dt, id] = key.split('_');
          return dt === 'Item' && studentFilter.has(Number(id));
        }),
      );
    }
    return isSortedDesc ? [...s].sort((a, b) => b.id - a.id) : [...s].sort((a, b) => a.id - b.id);
  }, [stages, type, itemFilter, studentFilter, isSortedDesc]);

  const byChapter = useMemo(() => {
    const map = new Map<number, ResolvedStage[]>();
    for (const stage of filtered) {
      if (!map.has(stage.chapter)) map.set(stage.chapter, []);
      map.get(stage.chapter)!.push(stage);
    }
    return Array.from(map.entries()).sort((a, b) => (isSortedDesc ? b[0] - a[0] : a[0] - b[0]));
  }, [filtered, isSortedDesc]);

  const toggleChapter = (ch: number) =>
    setClosedChapters((prev) => {
      const n = new Set(prev);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });

  if (filtered.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{t('equipment.noStagesFound')}</p>;
  }

  return (
    <div>
      <div className="flex justify-between items-center px-3 py-1.5 border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{filtered.length} stages</span>
        <button onClick={onReset} className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
          <FaRedo size={9} />
          {t(type === 'Hard' ? 'equipment.resetHard' : 'equipment.resetNormal')}
        </button>
      </div>

      {byChapter.map(([chapter, chStages]) => {
        const isOpen = !closedChapters.has(chapter);
        const chRuns = chStages.reduce((sum, s) => sum + (runCounts[s.id] || 0), 0);
        const chAp = chStages.reduce((sum, s) => sum + (runCounts[s.id] || 0) * s.ap, 0);

        return (
          <div key={chapter} className="border-b border-gray-100 dark:border-neutral-800 last:border-b-0">
            <button
              onClick={() => toggleChapter(chapter)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-neutral-800/60 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors text-left sticky top-0 z-10"
            >
              <FaChevronRight size={9} className={`text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
              <span className="font-mono text-xs font-bold text-gray-700 dark:text-gray-200">
                {type === 'Hard' ? 'H' : ''}
                {chapter} {t('equipment.stageArea')}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{chStages.length}</span>
              {chRuns > 0 && (
                <span className="ml-auto flex gap-2.5 text-[11px] font-mono">
                  <span className="font-bold text-blue-500 dark:text-blue-400">×{chRuns}</span>
                  <span className="text-gray-400 dark:text-gray-500">{chAp.toLocaleString()} AP</span>
                </span>
              )}
            </button>

            {isOpen &&
              chStages.map((stage) => {
                const runs = runCounts[stage.id] || 0;
                const hasDemanded = Object.keys(stage.drops).some((k) => (needsMap[k] || 0) > 0);
                return (
                  <div
                    key={stage.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-50 dark:border-neutral-800/60 last:border-b-0 transition-colors ${
                      runs > 0 ? 'bg-blue-50/50 dark:bg-blue-900/10' : !hasDemanded ? 'opacity-40 hover:opacity-80' : 'hover:bg-gray-50 dark:hover:bg-neutral-800/30'
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 shrink-0 w-9">
                      {stage.chapter}-{stage.stageNum}
                    </span>

                    <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                      {Object.entries(stage.drops)
                        .sort(([a], [b]) => {
                          const aIsBp = Number(a.split('_')[1]) in blueprintIdToType ? 1 : 0;
                          const bIsBp = Number(b.split('_')[1]) in blueprintIdToType ? 1 : 0;
                          return aIsBp - bIsBp;
                        })
                        .map(([key, dropRate]) => {
                          const [itemType, itemId] = key.split('_');
                          const demanded = (needsMap[key] || 0) > 0;
                          return (
                            <span
                              key={key}
                              className={`flex items-center rounded border ${
                                demanded ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-neutral-700'
                              }`}
                            >
                              <EquipmentItemIcon type={itemType as keyof IconInfos} itemId={itemId} amount={dropRate} size={11} eventData={eventDataForIcon} iconData={iconData} />
                            </span>
                          );
                        })}
                    </div>

                    <span className="hidden sm:block font-mono text-[11px] text-gray-400 dark:text-gray-500 shrink-0 w-9 text-right">{stage.ap}</span>
                    <span className={`hidden sm:block font-mono text-xs font-bold shrink-0 w-8 text-right ${runs > 0 ? 'text-blue-500 dark:text-blue-400' : 'text-gray-300 dark:text-neutral-700'}`}>
                      {runs > 0 ? `×${runs}` : '—'}
                    </span>
                    <div className="w-16 shrink-0">
                      <NumberInput value={runs} onChange={(val) => onRunCountChange(stage.id, val || 0)} min={0} max={maxRuns} narrowButtonType="plus_only" />
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
};
