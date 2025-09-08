'use client';

import { useState, useEffect } from 'react';
import { RaidInfo, Student } from '../../types/data';
import { useDataCache } from '../../utils/cache';
import ChartControls from './ChartControls';
import ChartDataContainer from './ChartDataContainer';
import { useTranslations } from 'next-intl';

const ClientHeatmapLoader = () => {
  // console.log('(top) ClientHeatmapLoader is rendering...');

  const [students, setStudents] = useState<Record<string, Student>>({});
  const [xLabels, setXLabels] = useState<RaidInfo[]>([]);
  // const [maxLvJson, setMaxLvJson] = useState<Record<number, number>>({});
  const [isStaticDataLoading, setIsStaticDataLoading] = useState(true);

  type StudentDataType = Record<string, Student>;
  const fetchAndProcessWithCache_1 = useDataCache<StudentDataType>();
  const fetchRaids = useDataCache<RaidInfo[]>();
  const fetchAndProcessWithCache_3 = useDataCache<Record<number, number>>();

  const t = useTranslations();
  const currentLocale = t('currentLocale');

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [studentData, labelData] = await Promise.all([
          fetchAndProcessWithCache_1(`/w/${currentLocale}.students.json.xz`, (res:Response) => res.json().then(data => data as Promise<Record<string, Student>>)),
          fetchRaids(`/w/${currentLocale}.raid_info.json.xz`, res => res.json() as Promise<RaidInfo[]>),
          // fetchAndProcessWithCache_3('/w/max_lv_by_x.json.xz', res => res.json() as Promise<Record<number, number>>)
        ]);

        setStudents(studentData);
        setXLabels(labelData);
        // setMaxLvJson(maxLvData);
      } catch (e) {
        console.error("Failed to fetch initial data:", e);
      } finally {
        setIsStaticDataLoading(false);
      }
    };
    fetchInitialData();
  }, [fetchAndProcessWithCache_1, fetchRaids, currentLocale]);


  if (isStaticDataLoading) {
    return <p>Loading initial assets...</p>;
  }

  return (
    <div>
      <ChartControls
        students={students}
        xLabels={xLabels}
      />
      <ChartDataContainer xLabels={xLabels} />
    </div>
  );
};

export default ClientHeatmapLoader;