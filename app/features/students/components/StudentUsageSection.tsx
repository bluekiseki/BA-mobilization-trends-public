import { SegmentedToggle } from '~/components/common/SegmentedToggle';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import ChartControls from '~/features/raid-stats/charts/heatmap/ChartControls';
import ChartDataContainer from '~/features/raid-stats/charts/heatmap/ChartDataContainer';
import { StudentNetworkGraphClient } from '~/features/raid-stats/charts/network/StudentNetworkGraphClient';
import { useChartControlsStore } from '~/features/raid-stats/charts/chartControlsStore';
import { useDataCache } from '~/hooks/cache';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { RaidInfo, Student } from '~/types/data';

type UsageServer = 'jp' | 'kr';
const SERVERS: readonly UsageServer[] = ['jp', 'kr'];

// The mobilization statistics of one server. Keyed by server so switching starts from a clean chart state.
function UsageBody({ studentId, server }: { studentId: number; server: UsageServer }) {
  const { t, i18n } = useTranslation('students');
  const locale = i18n.language as Locale;
  const fetchStudents = useDataCache<Record<string, Student>>();
  const fetchRaids = useDataCache<RaidInfo[]>();
  const [students, setStudents] = useState<Record<string, Student> | null>(null);
  const { setRaidInfo, setSelectedStudentId, setSelectedZValues, availableZValueCounter, isLoading } = useChartControlsStore(
    useShallow((state) => ({
      setRaidInfo: state.setRaidInfo,
      setSelectedStudentId: state.setSelectedStudentId,
      setSelectedZValues: state.setSelectedZValues,
      availableZValueCounter: state.availableZValueCounter,
      isLoading: state.isLoading,
    })),
  );
  // Student whose request has finished at least once; "no data" is only claimed after that
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const sawLoading = useRef(false);
  const [raidsReady, setRaidsReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const short = getLocaleShortName(locale);
    setLoadFailed(false);
    void Promise.all([fetchStudents(cdn(`/w/v2/${short}.students.bin`), (res: Response) => res.json()), fetchRaids(cdn(`/w/v2/${server}/${short}.raid_info.bin`), (res) => res.json())])
      .then(([studentData, raidData]) => {
        if (cancelled) return;
        setStudents(studentData);
        setRaidInfo(raidData);
        setRaidsReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchStudents, fetchRaids, locale, server, setRaidInfo]);

  useEffect(() => {
    setSelectedStudentId(studentId);
    sawLoading.current = false;
    // Like the heatmap page, nothing is drawn until the reader picks grades; drop the previous student's selection
    setSelectedZValues([]);
  }, [studentId, setSelectedStudentId, setSelectedZValues]);

  useEffect(() => {
    if (isLoading) sawLoading.current = true;
    else if (sawLoading.current) setLoadedFor(studentId);
  }, [isLoading, studentId]);

  const isEmpty = loadedFor === studentId && !isLoading && availableZValueCounter.size === 0;

  if (loadFailed) return <p className="py-6 text-sm text-red-600 dark:text-red-400">{t('usageLoadFailed')}</p>;
  if (!students || !raidsReady) return <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">{t('usageLoading')}</p>;

  return (
    <div>
      {isEmpty && (
        // No recorded fielding at all, which is different from a 0% rate
        <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('usageEmpty', { server: server.toUpperCase() })}</p>
      )}
      {/* Stay mounted while empty: the container is what starts the data request */}
      <div hidden={isEmpty}>
        <ChartControls students={students} hideStudentPicker />
        <ChartDataContainer server={server} />
      </div>
      <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-700">
        <h3 className="mb-3 text-sm font-semibold">{t('usageNetwork')}</h3>
        {server !== 'jp' && <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">{t('usageNetworkJpOnly')}</p>}
        <StudentNetworkGraphClient key={studentId} studentId={studentId} seasons={[]} studentMode height={500} />
      </div>
    </div>
  );
}

export function StudentUsageSection({ studentId }: { studentId: number }) {
  const { t } = useTranslation('students');
  const [server, setServer] = useState<UsageServer>('jp');
  return (
    <div className="space-y-3 py-6">
      <SegmentedToggle options={SERVERS.map((value) => ({ value, label: value.toUpperCase() }))} value={server} onChange={setServer} />
      {server === 'kr' && <p className="text-sm text-amber-600 dark:text-amber-400">{t('usageKrStopped')}</p>}
      <UsageBody key={server} studentId={studentId} server={server} />
    </div>
  );
}
