import type { FC } from 'react';
import type { PortraitData, ReportEntry, ReportEntryRank, StudentData } from '../dashboard/common';
import type { GameServer, RaidInfo } from '~/types/data';
import { RankCard } from '../dashboard/teamDetail/rankingsTableComponent';

interface RankingListProps {
  title: string;
  data: ReportEntry[];
  studentData: StudentData;
  portraitData: PortraitData;
  raidInfo: RaidInfo;
  server: GameServer;
}

export const RankingList: FC<RankingListProps> = ({ title, data, studentData, portraitData, raidInfo, server }) => {
  return (
    <>
      <h3 className="font-semibold text-lg mb-4">{title}</h3>
      <div className="space-y-4">
        {data.length > 0 ? (
          data.map((entry) => <RankCard key={entry.r} entry={entry as ReportEntryRank} studentData={studentData} portraitData={portraitData} raid={raidInfo} server={server} />)
        ) : (
          <p className="text-center text-gray-500">No Data</p>
        )}
      </div>
    </>
  );
};
