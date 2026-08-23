import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RaidInfo } from '~/types/data';
import { LIVE_RAID_DURATION } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { type_translation_sorted, typecolor } from '~/components/raid/raidToString';

interface TrajectoryPoint {
  hour_remaining: number;
  avg: number;
  min: number;
  max: number;
}

interface TrajectoryData {
  target_rank: number;
  statistics: TrajectoryPoint[] | { total?: TrajectoryPoint[]; boss?: Record<string, TrajectoryPoint[]> };
}

const TOTAL_RANKS = 20000;
const TOTAL_CARD_ACCENT = '#7e22ce';
function formatObservedAtLabel(timestamp: number, raidInfo: RaidInfo): string {
  const raidDateStr = raidInfo.Date.trim().slice(0, 10);
  const raidDayStartKst = new Date(`${raidDateStr}T00:00:00+09:00`).getTime();
  const dayNumber = Math.floor((timestamp - raidDayStartKst) / 86400000) + 1;
  const formattedTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));

  return `Day${dayNumber} ${formattedTime}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function PredictionCard({
  label,
  minPct,
  maxPct,
  avgPct,
  accentColor,
  prediction,
  t,
}: {
  label: string;
  minPct: number;
  maxPct: number;
  avgPct: number;
  accentColor: string;
  prediction: {
    min: number;
    max: number;
    avg: number;
  };
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const rangePct = Math.max(0.5, maxPct - minPct);
  const rangeStartPct = Math.min(minPct, 100 - rangePct);
  const { t: t_ui } = useTranslation('ui');

  return (
    <div className="space-y-2 border border-neutral-200 p-3 dark:border-neutral-700">
      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</div>

      <div className="flex justify-between text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
        <span>0</span>
        <span>{TOTAL_RANKS.toLocaleString()}</span>
      </div>

      <div className="relative h-5 overflow-visible rounded-sm bg-neutral-200 dark:bg-neutral-700">
        <div className="absolute top-0 h-full opacity-70 dark:opacity-60" style={{ left: `${rangeStartPct}%`, width: `${rangePct}%`, backgroundColor: accentColor }} />
        <div className="absolute top-0 h-full w-px" style={{ left: `${avgPct}%`, backgroundColor: accentColor }} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs font-semibold tabular-nums">
        <span className="min-w-0 whitespace-nowrap text-neutral-600 dark:text-neutral-300">
          <span className="font-medium text-neutral-400 dark:text-neutral-500">{t('road_puzzle.mcMin', { ns: 'planner' })}:</span> {prediction.min.toLocaleString()}
        </span>
        <span className="min-w-0 whitespace-nowrap text-center text-[#6b21a8] dark:text-[#e9d5ff]">
          <span className="font-medium text-[#7e22ce] dark:text-[#d8b4fe]">{t_ui('avg')}:</span> {prediction.avg.toLocaleString()}
        </span>
        <span className="min-w-0 whitespace-nowrap text-right text-neutral-600 dark:text-neutral-300">
          <span className="font-medium text-neutral-400 dark:text-neutral-500">{t('road_puzzle.mcMax', { ns: 'planner' })}:</span> {prediction.max.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function PlatinumCutWidget({
  raidInfos,
  isRaid,
  totalAssaultTrajectories,
  eliminationRaidTrajectories,
}: {
  raidInfos: RaidInfo[];
  isRaid: boolean;
  // Fetched server-side via R2 binding (see live/index.tsx loader) instead of a static
  // import, so this ~940KB historical dataset doesn't bloat the SSR Worker bundle.
  totalAssaultTrajectories: unknown;
  eliminationRaidTrajectories: unknown;
}) {
  const { t, i18n } = useTranslation(['liveDashboard', 'planner', 'resources']);
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const localeShort = getLocaleShortName(locale);

  const prediction = useMemo(() => {
    const data = (isRaid ? totalAssaultTrajectories : eliminationRaidTrajectories) as TrajectoryData | null;
    if (!data) return null;
    const statistics = Array.isArray(data.statistics) ? data.statistics : (data.statistics.total ?? []);
    if (statistics.length === 0) return null;

    const targetRank = data.target_rank || TOTAL_RANKS;
    const raidStartKst = getKstTime(raidInfos[0].Date);
    const raidEndKst = raidStartKst + 3600_000 * 24 * LIVE_RAID_DURATION - 3600_000 * 7;
    const now = Date.now();

    if (now < raidStartKst) return null;

    if (now >= raidEndKst) {
      return {
        min: targetRank,
        max: targetRank,
        avg: targetRank,
        hoursRemaining: 0,
        observedAtLabel: formatObservedAtLabel(raidEndKst, raidInfos[0]),
      };
    }

    const hoursRemaining = (raidEndKst - now) / 3600_000;

    const closest = statistics.reduce((prev, curr) => (Math.abs(curr.hour_remaining - hoursRemaining) < Math.abs(prev.hour_remaining - hoursRemaining) ? curr : prev));

    return {
      min: Math.round(closest.min),
      max: Math.round(closest.max),
      avg: Math.round(closest.avg),
      hoursRemaining: Math.round(hoursRemaining),
      observedAtLabel: formatObservedAtLabel(now, raidInfos[0]),
    };
  }, [raidInfos, isRaid, totalAssaultTrajectories, eliminationRaidTrajectories]);

  if (!prediction) return null;

  const minPct = clampPercent((prediction.min / TOTAL_RANKS) * 100);
  const maxPct = clampPercent((prediction.max / TOTAL_RANKS) * 100);
  const avgPct = clampPercent((prediction.avg / TOTAL_RANKS) * 100);
  const eraidTypes = raidInfos.map((info) => info.Type).filter((type): type is NonNullable<RaidInfo['Type']> => type !== undefined);
  const totalLabel = t('planner:ui.total');
  const cards: Array<{ key: string; label: string; accentColor: string }> = isRaid
    ? [{ key: 'raid', label: t('platinum_cut_est'), accentColor: '#77e0ff' }]
    : [
        { key: 'total', label: totalLabel, accentColor: TOTAL_CARD_ACCENT },
        ...eraidTypes.map((type) => ({
          key: type,
          label: type_translation_sorted[type][localeShort],
          accentColor: typecolor[type],
        })),
      ];

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('platinum_cut_est')}</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 sm:text-neutral-400 sm:dark:text-neutral-500">
          {prediction.observedAtLabel}(KST) · {prediction.hoursRemaining}
          {t_ui('hour')} {t_ui('remaining')}
        </span>
      </div>

      <div className={isRaid ? 'space-y-2' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-4'}>
        {cards.map((card) => (
          <PredictionCard key={card.key} label={card.label} minPct={minPct} maxPct={maxPct} avgPct={avgPct} accentColor={card.accentColor} prediction={prediction} t={t} />
        ))}
      </div>
    </div>
  );
}
