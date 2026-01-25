// app/components/dashboard/OverviewDashboardUI.tsx
import type { FullData, GameServer, RaidInfo } from '~/types/data';
import GrandAssaultTotalScoreAnalysis from './overview/DifficultyCombinationChart';
import ConcentricDonutChart from './overview/ConcentricDonutChart';
import RaidClearStatusGraph from './overview/RaidClearStatusGraph';
import { RecordLookup } from './overview/RecordLookup';
import { Card } from './card';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

interface OverviewDashboardUIProp {
  activeTab: string;
  raidInfos: RaidInfo[];
  fullData: FullData;
  server: GameServer;
  overviewLoading: boolean;
  setOverviewLoading: (overviewLoading: boolean) => void;
}

// overviewLoading: topOverviewLoading, setOverviewLoading: SetTopOverviewLoading
const OverviewDashboardUI = ({ activeTab, raidInfos, fullData, server }: OverviewDashboardUIProp) => {
  const { t } = useTranslation('dashboard');
  const { t: t_c } = useTranslation('common');

  const id = raidInfos[0].Id;
  const isGrandAssault = raidInfos.length > 1;
  const currentRaidInfo = isGrandAssault ? raidInfos.find((r) => r.Type === activeTab) || raidInfos[0] : raidInfos[0];

  const [isCalculating, setIsCalculating] = useState(false);

  const [scores, setScores] = useState<Int32Array>(() => new Int32Array());

  useEffect(() => {
    setIsCalculating(true);
    // console.log('OverviewDashboardUI Effect: Start Calculating', { activeTab });

    const timerId = setTimeout(() => {
      if (!fullData) {
        setScores(new Int32Array());
        setIsCalculating(false);
        return;
      }

      let newScores: Int32Array;

      if (isGrandAssault) {
        if (activeTab === 'TotalType') {
          // console.log('OverviewDashboardUI -> GA Total', activeTab);
          newScores = fullData.rank ?? new Int32Array();
        } else {
          const armorTypeIndex = raidInfos.findIndex((info) => info.Type === activeTab);

          // rank_1, rank_2, rank_3 ...
          const keyNumber = armorTypeIndex + 1;
          const key = `rank_${keyNumber}` as keyof FullData;
          // console.log('OverviewDashboardUI -> GA Armor', key);
          newScores = (fullData[key] as Int32Array | undefined) ?? new Int32Array();
        }
      } else {
        // Total Assault
        newScores = fullData.rank_default ?? fullData.rank ?? new Int32Array();
      }

      setScores(newScores);

      // Change 'Inside' loading status to false because calculation is complete
      setIsCalculating(false);
      // console.log('OverviewDashboardUI Effect: Finish Calculating');
    }, 0); // 0ms
    // Remove timer when component unmount or dependency changes
    return () => clearTimeout(timerId);
  }, [activeTab, fullData, isGrandAssault, raidInfos]);

  if (isCalculating) {
    return (
      <>
        <div className="min-h-[250px] flex justify-center items-center text-2xl cursor-progress">{t_c('loading_txt')}</div>
      </>
    );
  }

  // console.log('OverviewDashboardUI return', scores,fullData, currentRaidInfo)

  return (
    <>
      {isGrandAssault && activeTab === 'All' ? (
        <>
          <Card title={t('recordLookup')} className="space-y-4" height="h-20">
            <RecordLookup scores={fullData.rank} raidInfo={raidInfos[0]} server={server} isTotalChart={true} />
          </Card>
          <GrandAssaultTotalScoreAnalysis fullData={fullData} raidInfos={raidInfos} tierCounter={fullData.tier_counter} boss={raidInfos[0].Boss} server={server} id={id} />
        </>
      ) : (
        // RAID
        <>
          <Card title={t('recordLookup')} className="space-y-4" height="h-20">
            <RecordLookup scores={scores} raidInfo={raidInfos[0]} server={server} isTotalChart={false} />
          </Card>
          <Card title={t('donutChartTitle')} className="space-y-4">
            <ConcentricDonutChart key={`${activeTab}-donut`} scores={scores} tierCounter={fullData.tier_counter} boss={currentRaidInfo.Boss} server={server} id={currentRaidInfo.Id} />
          </Card>

          <Card title={t('histogramTitle')} defaultExpanded={true} className="space-y-4">
            <RaidClearStatusGraph key={activeTab} scores={scores} tierCounter={fullData.tier_counter} boss={currentRaidInfo.Boss} server={server} id={currentRaidInfo.Id} />
            <hr className="border-neutral-300 dark:border-neutral-700 my-10 transition-colors duration-300" />
          </Card>
        </>
      )}
    </>
  );
};

export default OverviewDashboardUI;
