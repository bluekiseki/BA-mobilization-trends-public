import { type FC, useMemo, useState } from 'react';
import type { LastData, LastERaidData, LastRaidData } from '~/types/livetype';
import type { GameServer, RaidInfo } from '~/types/data';
import type { PortraitData, ReportEntry, StudentData } from '~/components/dashboard/common';
import { TotalRankingList } from '~/components/live/TotalRankingList';
import { RankingList } from '~/components/live/RankingList';
import { type_translation } from '../raid/raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import React from 'react';

interface Top10RankingsProps {
  readonly isRaid: boolean;
  readonly lastData: LastData;
  readonly raidInfos: RaidInfo[];
  readonly server: GameServer;
  readonly studentData: StudentData;
  readonly portraitData: PortraitData;
}
type Top10Tab = 'total' | 'boss1' | 'boss2' | 'boss3';

export const Top10Rankings: FC<Top10RankingsProps> = ({ isRaid, lastData, raidInfos, server, studentData, portraitData }) => {
  // console.log('[Top10Rankings] ', { isRaid, lastData, raidInfos, server, studentData, portraitData });
  const [activeTab, setActiveTab] = useState<Top10Tab>('total');
  // const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_ui, i18n } = useTranslation('ui');
  const locale = i18n.language as Locale;

  const TABS: { id: Top10Tab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [{ id: 'total', name: t_ui('totalScore') }]
        : [
            { id: 'total', name: t_ui('totalScore') },
            {
              id: 'boss1',
              name: type_translation[raidInfos?.[0]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation[raidInfos?.[1]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation[raidInfos?.[2]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 3',
            },
          ],
    [raidInfos],
  );

  const totalTop10DataForDisplay = useMemo(() => {
    if (!lastData) return [];

    if (isRaid) {
      return [];
    } else {
      const lastEraidData = lastData.data as LastERaidData;

      // 1. Summing the scores of the three bosses for each user (rank)
      const scoreMap = new Map<number, { score: number; count: number }>();
      const { boss1, boss2, boss3 } = lastEraidData.total;

      const processRanks = (entries: ReportEntry[]) => {
        for (const entry of entries) {
          const existing = scoreMap.get(entry.r) || { score: 0, count: 0 };
          scoreMap.set(entry.r, {
            score: existing.score + entry.s,
            count: existing.count + 1,
          });
        }
      };

      processRanks(boss1.d);
      processRanks(boss2.d);
      processRanks(boss3.d);
      // 2. Only users who have ranks in all three boss attributes are filtered, sorted based on the total score, and new rankings are given
      const calculatedTotalRanks: {
        r: number;
        s: number;
        originalRank: number;
      }[] = [];
      for (const [originalRank, { score, count }] of scoreMap.entries()) {
        if (count === 3) {
          calculatedTotalRanks.push({ r: 0, s: score, originalRank });
        }
      }

      calculatedTotalRanks.sort((a, b) => b.s - a.s);
      calculatedTotalRanks.forEach((entry, index) => {
        entry.r = index + 1;
      });

      // 3. Create a final object by finding detailed data for each boss corresponding to the calculated aggregate ranking Top 10
      return calculatedTotalRanks.slice(0, 10).map((totalEntry) => {
        const originalRank = totalEntry.originalRank;

        // Find detailed party information for each boss using the original rank (userid)
        const findEntry = (bossData: ReportEntry[]) => bossData.find((e) => e.r === originalRank);

        return {
          rank: totalEntry.r,
          totalScore: totalEntry.s,
          boss1: findEntry(lastEraidData.total.boss1.d),
          boss2: findEntry(lastEraidData.total.boss2.d),
          boss3: findEntry(lastEraidData.total.boss3.d),
        };
      });
    }
  }, [lastData]);

  return (
    <>
      <div className="flex flex-wrap justify-between items-center pb-3 mb-4 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-2xl font-bold">TOP 10</h2>
        <nav className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-3 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {!isRaid && activeTab === 'total' ? (
        <TotalRankingList title={`${t_ui('totalScore')} Top 10`} data={totalTop10DataForDisplay} raidInfos={raidInfos} server={server} studentData={studentData} portraitData={portraitData} />
      ) : (
        <RankingList
          title={`${TABS.find((t) => t.id === activeTab)?.name} Top 10`}
          data={
            isRaid || activeTab === 'total' ? (lastData.data as LastRaidData).boss.d.slice(0, 10).map((v) => ({ ...v, typeRanking: v.r })) : (lastData.data as LastERaidData)[activeTab].d.slice(0, 10)
          }
          // raidInfo={raidInfos.find(r => r.Id.toString().endsWith(activeTab.slice(-1)))!}
          raidInfo={isRaid ? raidInfos[0] : raidInfos[Number(activeTab.slice(-1)) - 1]}
          server={server}
          studentData={studentData}
          portraitData={portraitData}
        />
      )}
    </>
  );
};

export default React.memo(Top10Rankings);
