import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CampaignData, CampaignStage, IconInfos } from '~/types/plannerData';
import type { StageFarmingPlan } from '~/types/resourcePlan';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import { resolveGachaGroup } from '~/components/planner/Equipment/common';
import { normalizeBluprintToEquipment } from '~/utils/blueprintUtils';
import { normalizeStageLabel } from '~/utils/campaignUtils';
import { NumberInput } from '~/components/planner/common/NumberInput';

interface StageFarmingPanelProps {
  selectedItemKey: string;
  campaigns: { kr: CampaignData; jp: CampaignData } | null;
  server: 'kr' | 'jp';
  stageFarmingPlans: Record<string, StageFarmingPlan>;
  rangeMin?: string;
  rangeMax?: string;
  renderItemIcon?: (key: string, size: number, amount: number) => React.ReactNode;
  stageFilter?: Set<string>;
  iconInfoData: IconInfos | null;
}

interface AvailableStage {
  stageId: string;
  stage: CampaignStage;
}

type StageRowProps = Pick<StageFarmingPanelProps, 'rangeMin' | 'rangeMax' | 'renderItemIcon' | 'iconInfoData'> & {
  stageId: string;
  stage: CampaignStage;
  plan: StageFarmingPlan | undefined;
};

function StageRow({ stageId, stage, plan, rangeMin, rangeMax, renderItemIcon, iconInfoData }: StageRowProps) {
  const { t } = useTranslation('resources');
  const { addStageFarmingPlan, setStageFarmingRunsRange } = useResourcePlanStore();
  const [count, setCount] = useState(0);

  const plannedRuns = plan ? Object.values(plan.dailyRuns).reduce((a, b) => a + b, 0) : 0;
  const effectiveStart = rangeMin ?? rangeMax;
  const effectiveEnd = rangeMax ?? rangeMin;
  const isHard = stage.Name.toLowerCase().includes('hard');

  const mergedRewards = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const reward of stage.Reward.map((v) => {
      if (v.StageRewardParcelTypeStr == 'Equipment') {
        return { ...v, StageRewardId: normalizeBluprintToEquipment(v.StageRewardId) };
      }
      return { ...v };
    })) {
      const prob = reward.StageRewardProb / 10000;
      const amount = reward.StageRewardAmount;
      const type = reward.StageRewardParcelTypeStr;
      const id = reward.StageRewardId;
      if (type === 'GachaGroup' && iconInfoData) {
        const gr = resolveGachaGroup(id, iconInfoData);
        // console.log('resolveGachaGroup', {id, iconInfoData, gr})
        for (const [k, p] of Object.entries(gr)) {
          acc[k] = (acc[k] || 0) + prob * p;
        }
      } else {
        const key = `${type}_${id}`;
        acc[key] = (acc[key] || 0) + prob * amount;
      }
    }
    return acc;
  }, [stage.Reward, iconInfoData]);

  // console.log('mergedRewards',mergedRewards, stage.Reward)
  const handleApply = () => {
    const runs = Math.max(0, Math.min(6, count));
    if (!effectiveStart || !effectiveEnd) return;

    if (!plan && runs > 0) {
      addStageFarmingPlan(stageId, { dailyRuns: {} });
    }

    if (runs > 0) {
      setStageFarmingRunsRange(stageId, effectiveStart, effectiveEnd, runs);
      setCount(0);
    }
  };

  const handleRemove = () => {
    if (!effectiveStart || !effectiveEnd) return;
    setStageFarmingRunsRange(stageId, effectiveStart, effectiveEnd, 0);
    setCount(0);
  };

  return (
    <div className="px-3 py-2 space-y-2 text-xs border-b border-neutral-100 dark:border-neutral-800 last:border-b-0">
      <div>
        <div className="font-medium text-neutral-700 dark:text-neutral-200 truncate" title={stage.Name}>
          {normalizeStageLabel(stage.Name) ?? stage.Name}
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          <div>AP: {stage.AP}</div>
          <div className="flex items-center gap-1 mt-0.5">{Object.entries(mergedRewards).map(([itemKey, expectedAmount]) => renderItemIcon?.(itemKey, 10, expectedAmount))}</div>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="w-28">
            <NumberInput value={count} onChange={setCount} min={0} max={6} narrowButtonType="plus_only" />
          </div>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{t('stageFarming.runsPerDay')}</span>
          <button
            onClick={handleApply}
            disabled={!effectiveStart || !effectiveEnd}
            className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('stageFarming.apply')}
          </button>
          {isHard && (
            <button
              onClick={() => setCount(3)}
              disabled={!effectiveStart || !effectiveEnd}
              className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              3
            </button>
          )}
          <button
            onClick={() => setCount(6)}
            disabled={!effectiveStart || !effectiveEnd}
            className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            M
          </button>
          {plan && (
            <button
              onClick={handleRemove}
              className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-semibold transition-colors"
            >
              {t('stageFarming.remove')}
            </button>
          )}
          {plannedRuns > 0 && <span className="ml-auto text-[10px] text-neutral-600 dark:text-neutral-300">{t('stageFarming.runsScheduled', { count: plannedRuns })}</span>}
        </div>
      </div>
    </div>
  );
}

export default function StageFarmingPanel({ selectedItemKey, campaigns, server, stageFarmingPlans, rangeMin, rangeMax, renderItemIcon, stageFilter, iconInfoData }: StageFarmingPanelProps) {
  const availableStages = useMemo((): AvailableStage[] => {
    if (!campaigns) return [];

    const campaignData = campaigns[server];
    const stages: AvailableStage[] = [];

    for (const [stageId, stage] of Object.entries(campaignData)) {
      const reward = stage.Reward.map((v) => {
        if (v.StageRewardParcelTypeStr == 'Equipment') {
          return { ...v, StageRewardId: normalizeBluprintToEquipment(v.StageRewardId) };
        }
        return { ...v };
      }).find((r) => `${r.StageRewardParcelTypeStr}_${r.StageRewardId}` === selectedItemKey);
      if (!reward) continue;
      if (stageFilter && !stageFilter.has(stageId)) continue;

      stages.push({ stageId, stage });
    }

    return stages.sort((a, b) => Number(a.stageId) - Number(b.stageId));
  }, [selectedItemKey, campaigns, server, stageFilter]);

  if (availableStages.length === 0) return null;

  return (
    <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
      {availableStages.map(({ stageId, stage }) => {
        const plan = stageFarmingPlans[stageId];

        return <StageRow key={stageId} stageId={stageId} stage={stage} plan={plan} rangeMin={rangeMin} rangeMax={rangeMax} renderItemIcon={renderItemIcon} iconInfoData={iconInfoData} />;
      })}
    </div>
  );
}
