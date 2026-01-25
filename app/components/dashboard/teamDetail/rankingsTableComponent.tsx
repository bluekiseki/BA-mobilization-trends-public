import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { isTotalAssault, type PortraitData, type ReportEntryRank, type StudentData } from '../common';
import { formatTimeToTimestamp } from '~/utils/time';
import type { RankRange } from './rankFilter';
import type { GameServer, RaidInfo } from '~/types/data';
import { StudentIcon } from '../studentIcon';
import { getDifficultyFromScoreAndBoss } from '~/components/Difficulty';
import { Pagination } from '../pagination';

export const RankCard: React.FC<{
  entry: ReportEntryRank;
  studentData: StudentData;
  portraitData: PortraitData;
  // rank: number;
  raid: RaidInfo;
  server: GameServer;
}> = ({ entry, studentData, portraitData, raid, server }) => {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg p-2 sm:p-0.75 shadow-md border border-neutral-200 dark:border-neutral-700 hover:border-teal-500 transition-colors sm:flex sm:items-center">
      {/* RANK & SCORE Section */}
      {/* This section becomes the left column on large screens */}
      <div
        className="
                flex justify-between items-center pb-3 mb-2 border-b px-3
                border-neutral-200 dark:border-neutral-700
                sm:flex-col sm:items-start sm:justify-center sm:border-b-0 sm:border-r
                sm:pr-2 sm:mr-2 sm:py-0.5 sm:mb-0 sm:self-stretch sm:w-48 sm:shrink-0
            "
      >
        {/* <div>
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs">RANK{isTotalAssault(raid) ? '' : ' #'+entry.r}</span>
                    <p className="text-m font-bold text-neutral-900 dark:text-white">{entry.typeRanking}</p>
                </div> */}
        {/* Add margin top on large screens for spacing */}
        <div className="text-right sm:text-left sm:mt-0.25 grid grid-cols-[auto_1fr] gap-x-3 items-center">
          <span className="text-neutral-500 dark:text-neutral-400 text-xs pb-0.5">
            {getDifficultyFromScoreAndBoss(entry.s, server, raid.Id).toUpperCase()}
            <br />
            {isTotalAssault(raid) ? '' : ' #' + entry.r}
          </span>
          <p className="text-xl font-bold text-neutral-900 dark:text-white">{entry.typeRanking}</p>
        </div>
        <div className="text-right sm:text-left sm:mt-0.25 grid grid-cols-[auto_1fr] gap-x-3 items-center">
          {/* <div> */}
          <span className="text-neutral-500 dark:text-neutral-400 text-xs">SCORE </span>
          <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{entry.s.toLocaleString()}</span>
          {/* </div>
                    <div> */}
          <span className="text-neutral-500 dark:text-neutral-400 text-xs">TIME </span>
          <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{formatTimeToTimestamp(calculateTimeFromScore(entry.s, raid.Boss, server, raid.Id) || 0)}</span>
          {/* </div> */}
        </div>
      </div>

      {/* Character Icons Section */}
      {/* This section becomes the main content area on the right */}
      <div className="space-y-1 flex flex-col items-center w-full sm:w-auto sm:flex-1 gap-y-3  sm:py-4">
        {entry?.t?.map((team, i) => (
          <div key={i} className="flex flex-row items-center justify-center w-full gap-x-2">
            {team.m.map((c, j) => (
              <StudentIcon key={`${i}-m-${c?.id}-${j}`} character={c} student={studentData[c?.id]} portraitData={portraitData} />
            ))}
            <div className="shrink-0 text-2xl mx-0 sm:mx-1 text-neutral-400 dark:text-neutral-500">|</div>
            {team.s.map((c, j) => (
              <StudentIcon key={`${i}-s-${c?.id}-${j}`} character={c} student={studentData[c?.id]} portraitData={portraitData} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const RankingsTableComponent: React.FC<{
  detailedFilteredData: ReportEntryRank[];
  currentPage: number;
  itemsPerPage: number;
  studentData: StudentData;
  portraitData: PortraitData;
  paginatedData: ReportEntryRank[];
  handlePageChange: (page: number) => void;
  showRank: boolean;
  activeRange: RankRange;
  raidInfo: RaidInfo;
  server: GameServer;
  handleItemsPerPageChange: (size: number) => void;
  handleLoadMore: () => void;
  handleScrollToTop: () => void;
}> = ({
  detailedFilteredData,
  currentPage,
  itemsPerPage,
  studentData,
  portraitData,
  paginatedData,
  showRank,
  activeRange,
  raidInfo,
  server,
  handlePageChange,
  handleItemsPerPageChange,
  handleLoadMore,
  handleScrollToTop,
}) => (
  <>
    <Pagination
      currentPage={currentPage}
      totalItems={detailedFilteredData.length}
      itemsPerPage={itemsPerPage}
      showmoreBtn={false}
      onPageChange={handlePageChange}
      onItemsPerPageChange={handleItemsPerPageChange}
      onLoadMore={handleLoadMore}
      onScrollToTop={handleScrollToTop}
    />
    <div className="grid grid-cols-1 gap-4">
      {paginatedData.length > 0 ? (
        paginatedData.map((entry, i) => (
          <RankCard
            key={entry.r}
            entry={entry}
            studentData={studentData}
            portraitData={portraitData}
            // rank = { i+1 + (currentPage-1)*itemsPerPage+ activeRange.min - 1}
            raid={raidInfo}
            server={server}
          />
        ))
      ) : (
        <p className="text-center text-gray-500 pt-10">No data</p>
      )}
    </div>
    <Pagination
      currentPage={currentPage}
      totalItems={detailedFilteredData.length}
      itemsPerPage={itemsPerPage}
      showmoreBtn={true}
      onPageChange={handlePageChange}
      onItemsPerPageChange={handleItemsPerPageChange}
      onLoadMore={handleLoadMore}
      onScrollToTop={handleScrollToTop}
    />
  </>
);
