//'use client';
// app/components/heatmap/ClientHeatmapLoader.tsx

import { useState, useEffect } from 'react';
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

const ClientHeatmapLoader = ({ server }: { server: GameServer }) => {
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [isStaticDataLoading, setIsStaticDataLoading] = useState(true);

  type StudentDataType = Record<string, Student>;
  const fetchAndProcessWithCache_1 = useDataCache<StudentDataType>();
  const fetchRaids = useDataCache<RaidInfo[]>();
  const { setRaidInfo } = useChartControlsStore(
    useShallow((state) => ({
      setRaidInfo: state.setRaidInfo,
    })),
  );

  const { i18n } = useTranslation('common', { keyPrefix: 'currentLocale' });
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
          fetchRaids(cdn(`/w/${server}/${getLocaleShortName(currentLocale)}.raid_info.bin`), (res) => res.json() as Promise<RaidInfo[]>),
        ]);

        await (async () => {
          const students_portrait = (await fetch(cdn('/w/students_portrait.json')).then((res) => res.json())) as {
            [key: number]: string;
          };
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
    fetchInitialData();
  }, [fetchAndProcessWithCache_1, fetchRaids, currentLocale, server]);

  if (isStaticDataLoading) {
    return <p>Loading initial assets...</p>;
  }

  return (
    <div>
      <ChartControls students={students} />
      <ChartDataContainer server={server} />
    </div>
  );
};

export default ClientHeatmapLoader;
