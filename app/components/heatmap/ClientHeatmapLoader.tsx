//'use client';
// app/components/heatmap/ClientHeatmapLoader.tsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useDataCache } from '../../utils/cache';
import ChartControls from './ChartControls';
import ChartDataContainer from './ChartDataContainer';
import type { GameServer, RaidInfo, Student } from '~/types/data';
import { useTranslation } from 'react-i18next';
import { useChartControlsStore } from '~/store/chartControlsStore';
import { useShallow } from 'zustand/shallow';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { useLocation } from 'react-router';
import { StudentNetworkGraphClient } from '~/components/network/StudentNetworkGraphClient';
import { localeLink } from '~/utils/localeLink';
const ClientHeatmapLoader = ({ server }: { server: GameServer }) => {
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [portraitData, setPortraitData] = useState<Record<number, string>>({});
  const [isStaticDataLoading, setIsStaticDataLoading] = useState(true);

  type StudentDataType = Record<string, Student>;
  const fetchAndProcessWithCache_1 = useDataCache<StudentDataType>();
  const fetchRaids = useDataCache<RaidInfo[]>();
  const { setRaidInfo } = useChartControlsStore(
    useShallow((state) => ({
      setRaidInfo: state.setRaidInfo,
    })),
  );

  const { i18n } = useTranslation('common');
  const { t } = useTranslation('network');
  const currentLocale = i18n.language as Locale;

  const { selectedStudentId, setSelectedStudentId } = useChartControlsStore(
    useShallow((state) => ({
      selectedStudentId: state.selectedStudentId,
      setSelectedStudentId: state.setSelectedStudentId,
    })),
  );

  const location = useLocation();
  useEffect(() => {
    const state = location.state as { studentId?: number } | null;
    if (state && state.studentId && selectedStudentId != state.studentId) {
      setSelectedStudentId(state.studentId);
    }
  }, [location.state, location.pathname]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [studentData, labelData] = await Promise.all([
          fetchAndProcessWithCache_1(cdn(`/w/${getLocaleShortName(currentLocale)}.students.bin`), (res: Response) => res.json().then((data) => data as Promise<Record<string, Student>>)),
          fetchRaids(cdn(`/w/${server}/${getLocaleShortName(currentLocale)}.raid_info.bin`), (res) => res.json() as unknown as Promise<RaidInfo[]>),
          // fetch(cdn('/w/students_portrait.json')).then((res) => res.json())
        ]);

        await (async () => {
          const students_portrait: {
            [key: number]: string;
          } = await fetch(cdn('/w/students_portrait.json')).then((res) => res.json());
          // as  {
          //   [key: number]: string;
          // };
          setPortraitData(students_portrait);
          Object.entries(studentData).map(([studentId, student]) => {
            student.Portrait = students_portrait[parseInt(studentId)];
          });
          setStudents(studentData);
        })();

        setRaidInfo(labelData);
      } catch (e) {
        console.error('Failed to fetch initial data:', e);
      } finally {
        setIsStaticDataLoading(false);
      }
    };
    void fetchInitialData();
  }, [fetchAndProcessWithCache_1, fetchRaids, currentLocale, server]);

  if (isStaticDataLoading) {
    return <p>{t('loadingAssets')}</p>;
  }

  return (
    <div>
      <ChartControls students={students} portraitData={portraitData} />
      <ChartDataContainer server={server} />
      {server == 'jp' && selectedStudentId && (
        <div className="mt-4 border border-neutral-200 dark:border-neutral-700 rounded-sm">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('title')}</span>
            <Link to={localeLink(currentLocale, `/charts/jp/network?student=${selectedStudentId}`)} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              {t('fullPage')}
            </Link>
          </div>
          <StudentNetworkGraphClient key={selectedStudentId} studentId={selectedStudentId} seasons={[]} studentMode={true} height={500} />
        </div>
      )}
    </div>
  );
};

export default ClientHeatmapLoader;
