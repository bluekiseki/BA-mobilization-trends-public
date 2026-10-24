import type { FC } from 'react';
import type { PortraitData, ReportEntry, ReportEntryRank, ReportStudentData } from '../../../types/raidReport';
import type { GameServer, RaidInfo } from '~/types/data';
import { RankCard } from '../common/rankingsTableComponent';

interface RankingListProps {
  title: string;
  data: ReportEntry[];
  studentData: ReportStudentData;
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
          <p className="text-center text-neutral-500">No Data</p>
        )}
      </div>
    </>
  );
};
