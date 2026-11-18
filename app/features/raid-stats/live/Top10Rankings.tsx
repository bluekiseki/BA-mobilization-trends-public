import { type FC, useMemo, useState } from 'react';
import type { LastData, LastERaidData, LastRaidData } from '~/features/raid-stats/live/livetype';
import type { GameServer, RaidInfo } from '~/types/data';
import type { ReportEntry, ReportEntryRank, ReportStudentData } from '~/types/raidReport';
import { TotalRankingList } from '~/features/raid-stats/live/TotalRankingList';
import { RankingList } from '~/features/raid-stats/live/RankingList';
import { RankCard } from '~/features/raid-stats/common/rankingsTableComponent';
import { type_translation_tab } from '../../../components/raid/raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { difficultyInfo, getDifficultyFromScoreAndBoss, type DifficultyName } from '~/components/raid/Difficulty';
import React from 'react';

interface Top10RankingsProps {
  readonly isRaid: boolean;
  readonly lastData: LastData;
  readonly raidInfos: RaidInfo[];
  readonly server: GameServer;
  readonly studentData: ReportStudentData;
}
type Top10Tab = 'total' | 'boss1' | 'boss2' | 'boss3';

export const Top10Rankings: FC<Top10RankingsProps> = ({ isRaid, lastData, raidInfos, server, studentData }) => {
  // console.log('[Top10Rankings] ', { isRaid, lastData, raidInfos, server, studentData });
  const [activeTab, setActiveTab] = useState<Top10Tab>('total');
  // const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_ui, i18n } = useTranslation('ui');
  const { t: t_dash } = useTranslation('dashboard');
  const { t: t_raid } = useTranslation('raidInfo');
  const locale = i18n.language as Locale;

  const TABS: { id: Top10Tab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [{ id: 'total', name: t_ui('totalScore') }]
        : [
            { id: 'total', name: t_ui('totalScore') },
            {
              id: 'boss1',
              name: type_translation_tab[raidInfos?.[0]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation_tab[raidInfos?.[1]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation_tab[raidInfos?.[2]?.Type as keyof typeof type_translation_tab][getLocaleShortName(locale)] || 'Boss 3',
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
      // 2. Keep only users present in all three boss lists, ordered by their in-game total rank.
      // The in-game rank is preserved as-is (never renumbered) so it matches the game; a hidden
      // abnormal record simply drops out, leaving a gap at the top of the list.
      const calculatedTotalRanks: {
        s: number;
        originalRank: number;
      }[] = [];
      for (const [originalRank, { score, count }] of scoreMap.entries()) {
        if (count === 3) {
          calculatedTotalRanks.push({ s: score, originalRank });
        }
      }

      calculatedTotalRanks.sort((a, b) => a.originalRank - b.originalRank);

      // 3. Create a final object by finding detailed data for each boss corresponding to the aggregate ranking Top 10
      return calculatedTotalRanks.slice(0, 10).map((totalEntry) => {
        const originalRank = totalEntry.originalRank;

        // Find detailed party information for each boss using the original rank (userid)
        const findEntry = (bossData: ReportEntry[]) => bossData.find((e) => e.r === originalRank);

        return {
          rank: originalRank,
          totalScore: totalEntry.s,
          boss1: findEntry(lastEraidData.total.boss1.d),
          boss2: findEntry(lastEraidData.total.boss2.d),
          boss3: findEntry(lastEraidData.total.boss3.d),
        };
      });
    }
  }, [lastData]);

  const activeRaidInfo = isRaid ? raidInfos[0] : raidInfos[Number(activeTab.slice(-1)) - 1];

  // Top parties per difficulty, for difficulties whose first clear lands within the platinum
  // range (top 20000). Shown as extra cards below the Top 10, each under a "{difficulty} Max
  // Score" header. For each difficulty we surface the run of consecutive-rank entries that
  // carry party info (`t`), starting from that difficulty's highest-scoring party entry —
  // not just the #1 — so a suspected cheater sitting at the top of a difficulty doesn't
  // hide the genuine top party right behind them.
  const difficultyBests = useMemo<{ difficulty: DifficultyName; entries: ReportEntryRank[] }[]>(() => {
    if (!lastData) return [];
    // The e-raid combined-score tab is bucketed by bracket combinations (TTT/TTI/...), not a
    // single difficulty, so there is no meaningful per-difficulty best here.
    if (!isRaid && activeTab === 'total') return [];

    const useRaidShape = isRaid || activeTab === 'total';
    const activeList: ReportEntry[] = useRaidShape ? (lastData.data as LastRaidData).boss.d : (lastData.data as LastERaidData)[activeTab].d;
    const tierCounts: Partial<Record<DifficultyName, number>> = useRaidShape ? (lastData.data as LastRaidData).tier : ((lastData.data as LastERaidData).tier[activeTab] ?? {});
    const raidId = activeRaidInfo?.Id;
    if (!activeList || !raidId) return [];

    const top10 = activeList.slice(0, 10);
    const top10Ranks = new Set(top10.map((e) => e.r));
    const top10Diffs = new Set(top10.map((e) => getDifficultyFromScoreAndBoss(e.s, server, raidId)));

    // Start rank of a difficulty = 1 + total clears of every higher difficulty (from `tier`).
    const startRank = new Map<DifficultyName, number>();
    let cumulative = 0;
    for (const { name } of difficultyInfo) {
      startRank.set(name, cumulative + 1);
      cumulative += tierCounts[name] ?? 0;
    }
    const platinumDiffs = new Set(difficultyInfo.filter(({ name }) => (startRank.get(name) ?? Infinity) <= 20000).map((x) => x.name));
    // Show the absolute overall rank, not the rank within the difficulty.
    const withRank = (e: ReportEntry): ReportEntryRank => ({ ...e, typeRanking: e.r });

    const seen = new Set<DifficultyName>();
    const result: { difficulty: DifficultyName; entries: ReportEntryRank[] }[] = [];
    for (let i = 0; i < activeList.length; i++) {
      const e = activeList[i];
      if (!e.t?.length || top10Ranks.has(e.r)) continue;
      const d = getDifficultyFromScoreAndBoss(e.s, server, raidId);
      if (seen.has(d) || top10Diffs.has(d) || !platinumDiffs.has(d)) continue;
      seen.add(d);

      const entries: ReportEntryRank[] = [withRank(e)];
      for (let j = i + 1; j < activeList.length; j++) {
        const nx = activeList[j];
        if (!nx.t?.length || nx.r !== entries[entries.length - 1].r + 1) break;
        if (getDifficultyFromScoreAndBoss(nx.s, server, raidId) !== d) break;
        entries.push(withRank(nx));
      }
      result.push({ difficulty: d, entries });
    }

    const order = difficultyInfo.map((x) => x.name);
    result.sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));
    return result;
  }, [lastData, activeTab, isRaid]);

  return (
    <>
      <div className="flex flex-wrap justify-between items-center pb-3 mb-4 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-2xl font-bold">TOP 10</h2>
        <nav className="flex flex-wrap gap-2 dark:border-neutral-700">
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
        <TotalRankingList title={`${t_ui('totalScore')} Top 10`} data={totalTop10DataForDisplay} raidInfos={raidInfos} server={server} studentData={studentData} />
      ) : (
        <>
          <RankingList
            title={`${TABS.find((t) => t.id === activeTab)?.name} Top 10`}
            data={
              isRaid || activeTab === 'total'
                ? (lastData.data as LastRaidData).boss.d.slice(0, 10).map((v) => ({ ...v, typeRanking: v.r }))
                : (lastData.data as LastERaidData)[activeTab].d.slice(0, 10)
            }
            raidInfo={activeRaidInfo}
            server={server}
            studentData={studentData}
          />

          {difficultyBests.length > 0 && (
            <div className="space-y-4 mt-6">
              {difficultyBests.map(({ difficulty, entries }) => (
                <div key={difficulty} className="space-y-2">
                  <h4 className="font-semibold text-lg">
                    {t_raid(difficulty)} {t_dash('maxScore')}
                  </h4>
                  {entries.map((entry) => (
                    <RankCard key={entry.r} entry={entry} studentData={studentData} raid={activeRaidInfo} server={server} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default React.memo(Top10Rankings);
