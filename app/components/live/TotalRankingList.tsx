import type { FC } from 'react';
import type { PortraitData, ReportEntry, StudentData } from '~/components/dashboard/common';
import type { GameServer, RaidInfo } from '~/types/data';
import { StudentIcon } from '../dashboard/studentIcon';
import { formatTimeToTimestamp } from '~/utils/time';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { getDifficultyFromScoreAndBoss } from '../Difficulty';
import { type_translation } from '../raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

// --- Type Definitions ---
interface TotalRankEntry {
  rank: number;
  totalScore: number;
  boss1?: ReportEntry;
  boss2?: ReportEntry;
  boss3?: ReportEntry;
}

interface TotalRankingListProps {
  title: string;
  data: TotalRankEntry[];
  raidInfos: RaidInfo[];
  server: string;
  studentData: StudentData;
  portraitData: PortraitData;
}

// --- Individual Boss Party Component ---
const BossTeamDetails: FC<{
  entry?: ReportEntry;
  bossName: string;
  raidInfo: RaidInfo; // Pass the specific RaidInfo for this boss
  server: GameServer;
  studentData: StudentData;
  portraitData: PortraitData;
}> = ({ entry, bossName, raidInfo, server, studentData, portraitData }) => {
  if (!entry || !raidInfo) return null;

  const { i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;

  return (
    <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg">
      <div className="flex justify-between items-start mb-2">
        {/* Boss Name & Difficulty */}
        <div>
          <h4 className="font-bold text-blue-600 dark:text-blue-400">{type_translation[bossName as keyof typeof type_translation][getLocaleShortName(locale)]}</h4>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{getDifficultyFromScoreAndBoss(entry.s, server, raidInfo.Id).toUpperCase()}</span>
        </div>
        {/* Score & Time */}
        <div className="text-right">
          <p className="text-sm font-semibold">{entry.s.toLocaleString()}</p>
          <p className="text-xs text-sky-600 dark:text-sky-400">{formatTimeToTimestamp(calculateTimeFromScore(entry.s, raidInfo.Boss, server, raidInfo.Id) || 0)}</p>
        </div>
      </div>
      <div className="space-y-2">
        {/* Team mapping (no changes here) */}
        {entry?.t?.map((team, i) => (
          <div key={i} className="flex flex-row items-center justify-center w-full gap-x-1.5">
            {team.m.map((c, j) => (
              <StudentIcon
                key={`${i}-m-${c?.id}-${j}`}
                character={c} // Pass the full character object
                student={studentData[c?.id]}
                portraitData={portraitData}
              />
            ))}
            <div className="shrink-0 text-xl mx-0.5 text-neutral-400 dark:text-neutral-500">|</div>
            {team.s.map((c, j) => (
              <StudentIcon
                key={`${i}-s-${c?.id}-${j}`}
                character={c} // Pass the full character object
                student={studentData[c?.id]}
                portraitData={portraitData}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main Card Component for a Single Rank ---
const TotalRankCard: FC<{
  entry: TotalRankEntry;
  raidInfos: RaidInfo[];
  studentData: StudentData;
  portraitData: PortraitData;
}> = ({ entry, raidInfos, studentData, portraitData }) => {
  return (
    <div className=" py-4">
      {/* Overall Rank and Score */}
      <div className="flex justify-between items-center pb-3 mb-3 border-b border-neutral-200 dark:border-neutral-700">
        <div>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">RANK</span>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{entry.rank}</p>
        </div>
        <div className="text-right">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">TOTAL SCORE</span>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{entry.totalScore.toLocaleString()}</p>
        </div>
      </div>
      {/* Detailed Party Info for Each Boss */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BossTeamDetails entry={entry.boss1} bossName={raidInfos[0]?.Type || 'Boss 1'} studentData={studentData} portraitData={portraitData} server={'jp'} raidInfo={raidInfos[0]} />
        <BossTeamDetails entry={entry.boss2} bossName={raidInfos[1]?.Type || 'Boss 2'} studentData={studentData} portraitData={portraitData} server={'jp'} raidInfo={raidInfos[1]} />
        <BossTeamDetails entry={entry.boss3} bossName={raidInfos[2]?.Type || 'Boss 3'} studentData={studentData} portraitData={portraitData} server={'jp'} raidInfo={raidInfos[2]} />
      </div>
    </div>
  );
};

// --- Final List Component ---
export const TotalRankingList: FC<TotalRankingListProps> = ({ title, data, raidInfos, studentData, portraitData }) => {
  return (
    <>
      <h3 className="font-semibold text-lg mb-4">{title}</h3>
      <div className="space-y-4">
        {data.map((entry) => (
          <TotalRankCard key={entry.rank} entry={entry} raidInfos={raidInfos} studentData={studentData} portraitData={portraitData} />
        ))}
      </div>
    </>
  );
};
