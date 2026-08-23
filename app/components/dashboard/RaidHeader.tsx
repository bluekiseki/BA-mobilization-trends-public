// app/components/dashboard/RaidHeader.tsx

import { useTranslation } from 'react-i18next';
import type { GameServer, RaidInfo } from '~/types/data';
import type { ReportEntry } from './common';
import { TerrainIconGameStyle, type Terrain } from '../raid/teran';
import { getMostDifficultLevel, type_translation, typecolor } from '../raid/raidToString';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { DownloadButton } from './DownloadButton';
import { YouTubeSearchGenerator } from './YouTubeSearchGenerator';

interface RaidHeaderProps {
  raidInfo: RaidInfo;
  server: GameServer;
  isGrandAssault: boolean;
  allData?: ReportEntry[]; // Data to be passed to DownloadButton
  showType?: boolean;
}
export default function RaidHeader({ raidInfo, server, isGrandAssault, allData, showType }: RaidHeaderProps) {
  const { i18n } = useTranslation('common');
  const { t: t_g } = useTranslation('game');
  const raidTypeLabel = isGrandAssault ? t_g('eraid') : t_g('raid');

  return (
    <header className="w-full">
      <div className=" rounded-xl p-6 text-center">
        <div className="flex justify-center items-center gap-2 mb-6">
          <span className="inline-block px-3 py-1 text-s font-semibold text-black bg-ba-btn-blue rounded-full">{raidTypeLabel.replace(/Assault/gi, '').trim()}</span>
          <span className="inline-block px-3 py-0.5 text-s font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">
            <span className="relative top-1">
              <TerrainIconGameStyle terrain={raidInfo.Location as Terrain} size={'1.5em'} />
            </span>
          </span>
          <span className="inline-block px-3 py-1 text-s font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">{getMostDifficultLevel(raidInfo)}</span>
          {/* <span className="inline-block px-3 py-1 text-s font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">
                        {server.toUpperCase()}
                    </span> */}
          {allData && (
            <span className="hidden sm:inline-block px-3 py-1 text-s font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">
              <DownloadButton data={allData} filename={`${raidInfo.Id}-${raidInfo.Boss}-${raidInfo.Type || 'Total'}.csv`} />
            </span>
          )}

          <YouTubeSearchGenerator raidInfo={raidInfo} showType={showType || false} />
        </div>

        <h1 className="text-4xl font-extrabold text-neutral-900 dark:text-white">
          {/* <span className='text-sm font-medium -mr-1 relative -top-4 text-neutral-400'>S{raidInfo.Id.slice(1)}</span>  */}
          {raidInfo.Boss}
        </h1>

        {showType && raidInfo.Type && (
          <p className="text-2xl font-bold mt-2" style={{ color: typecolor[raidInfo.Type] }}>
            {type_translation[raidInfo.Type][getLocaleShortName(i18n.language as Locale)]}
          </p>
        )}

        <p className="text-sm mt-4 font-medium text-neutral-500 dark:text-neutral-400">
          {server.toUpperCase()} / S{raidInfo.Id.slice(1)} / <time dateTime={raidInfo.Date}>{raidInfo.Date}</time>
        </p>
      </div>
    </header>
  );
}
