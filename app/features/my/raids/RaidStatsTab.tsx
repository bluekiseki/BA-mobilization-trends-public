import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { getBackgroundRatingColor, getCharacterStarValue } from '~/utils/raid/report';
import { SheetIcon } from '~/components/common/SheetIcon';
import type { Character } from '~/types/raidReport';
import { type_translation } from '~/components/raid/raidToString';
import { CheckboxSelect, type CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { IndexRangeSlider, useIndexRange } from '~/components/common/IndexRangeSlider';
import type { Student } from '~/types/plannerData';
import type { RaidHistoryEntry, RaidHistoryStudent, RaidHistoryTeam, RaidType } from '~/types/raidHistory';
import type { RaidTrophy } from '~/types/resourcePlan';
import { useIsDarkState } from '~/store/isDarkState';
import type { Locale } from '~/utils/i18n/config';
import { getLocaleShortName } from '~/utils/i18n/config';
import { formatJfdCoinReward } from '~/features/my/raids/jfdScore';
import type { RaidOption } from './RaidHistoryTable';

type RestrictionMetric = 'floor' | 'time';
type RaidResultMetric = 'score' | 'rank';
type UsageAssistFilter = 'all' | 'main_only' | 'assist_only';

interface RaidStatsTabProps {
  entries: RaidHistoryEntry[];
  raidOptions: RaidOption[];
  students: Record<string, Student>;
  locale: Locale;
}

interface NormalizedEntry {
  entry: RaidHistoryEntry;
  raid: RaidOption | undefined;
  boss: string;
  armorTypes: string[];
  students: Array<{ student: RaidHistoryStudent; role: 'striker' | 'special' }>;
}

interface ScorePoint {
  id: string;
  label: string;
  shortLabel: string;
  date: string;
  boss: string;
  raidType: RaidType;
  score?: number;
  rank?: number;
  trophy?: RaidTrophy;
}

interface RestrictionPoint {
  id: string;
  label: string;
  shortLabel: string;
  date: string;
  boss: string;
  metricValue: number;
  floor?: number;
  clearTime?: string;
  difficulty?: string;
}

interface StudentDistributionPoint {
  label: string;
  value: number;
  count: number;
  fill?: string;
}

const LEVEL_SEGMENT_COLORS = ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4'] as const;

const TROPHY_COLOR: Record<RaidTrophy, string> = {
  platinum: '#8C008C',
  gold: '#d97706',
  silver: '#a3a3a3',
  bronze: '#92400e',
};

const SECTION_TITLE_CLS = 'text-base font-semibold text-neutral-950 dark:text-neutral-50';
const SECTION_DESC_CLS = 'text-sm text-neutral-500 dark:text-neutral-400';
const CHIP_LABEL_CLS = 'inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200';
const FILTER_SELECT_BUTTON_CLS =
  'flex w-full items-center justify-between gap-2 rounded border border-neutral-300 px-3 py-1.5 text-left text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200';

function getEntryTeams(entry: RaidHistoryEntry): RaidHistoryTeam[] {
  if (Array.isArray(entry.teams) && entry.teams.length > 0) {
    return entry.teams;
  }
  return [
    {
      m: Array.isArray(entry.m) ? entry.m : [],
      s: Array.isArray(entry.s) ? entry.s : [],
    },
  ];
}

function parseClearTimeToSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const numericParts = parts.map((part) => Number(part));
  if (numericParts.some((part) => Number.isNaN(part))) return null;
  if (numericParts.length === 2) {
    return numericParts[0] * 60 + numericParts[1];
  }
  return numericParts[0] * 3600 + numericParts[1] * 60 + numericParts[2];
}

function formatSecondsLabel(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const ARMOR_TYPE_ORDER = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'CompositeArmor'];

function sortArmorTypes(values: string[]) {
  const rank = (value: string) => {
    const index = ARMOR_TYPE_ORDER.indexOf(value);
    return index === -1 ? ARMOR_TYPE_ORDER.length : index;
  };
  return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function getNiceStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const roughStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getTrimmedYAxisDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rawSpan = maxValue - minValue;
  const baseSpan = rawSpan > 0 ? rawSpan : Math.max(Math.abs(maxValue) * 0.08, 1);
  const step = getNiceStep(baseSpan);
  const padding = Math.max(baseSpan * 0.18, step * 0.5);

  const domainMin = Math.max(0, Math.floor((minValue - padding) / step) * step);
  const domainMax = Math.ceil((maxValue + padding) / step) * step;

  if (domainMin === domainMax) {
    return [domainMin, domainMax + step];
  }

  return [domainMin, domainMax];
}

function getScoreValues(points: ScorePoint[], metric: RaidResultMetric): number[] {
  return points.flatMap((point) => {
    const value = metric === 'score' ? point.score : point.rank;
    return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
  });
}

function getRestrictionMetricValues(points: RestrictionPoint[]): number[] {
  return points.flatMap((point) => (Number.isFinite(point.metricValue) ? [point.metricValue] : []));
}

function getStudentStarValue(student: RaidHistoryStudent, fallbackStar: number): number {
  const character: Character = {
    id: student.id,
    level: student.level ?? 0,
    star: student.star ?? fallbackStar,
    hasWeapon: student.hasWeapon ?? false,
    weaponStar: student.weaponStar ?? 0,
    isAssist: false,
  };
  return getCharacterStarValue(character);
}

function getFilterLabel(value: string, locale: Locale): string {
  if (value in type_translation) {
    return type_translation[value as keyof typeof type_translation][getLocaleShortName(locale)];
  }
  return value;
}

function FilterCheckboxRow({ label, options, selected, onToggle, locale }: { label: string; options: string[]; selected: Set<string>; onToggle: (value: string) => void; locale: Locale }) {
  const { t: t_g } = useTranslation('game');
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className={CHIP_LABEL_CLS}>
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => onToggle(option)}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-900"
            />
            <span className="truncate" title={option}>
              {option === 'raid' || option === 'eraid' || option === 'jfd' || option === 'multifloor' ? t_g(option) : getFilterLabel(option, locale)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ScoreTooltip({ active, payload, metric }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ScorePoint }>; metric: RaidResultMetric }) {
  const { t } = useTranslation('mypage');
  const { t: t_g } = useTranslation('game');
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="font-semibold">{point.label}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{point.date}</div>
      {metric === 'score' && typeof point.score === 'number' && <div className="mt-1">{point.score.toLocaleString()}</div>}
      {metric === 'rank' && typeof point.rank === 'number' && <div className="mt-1">{t('raids.stats.rankValue', { rank: point.rank.toLocaleString() })}</div>}
      {metric === 'score' && point.raidType === 'jfd' && typeof point.score === 'number' && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{formatJfdCoinReward(point.score, t_g('coin')) ?? '-'}</div>
      )}
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        {typeof point.score === 'number' && t('raids.stats.scoreLabel', { score: point.score.toLocaleString() })}
        {typeof point.score === 'number' && typeof point.rank === 'number' ? ' · ' : ''}
        {typeof point.rank === 'number' && t('raids.stats.rankLabel', { rank: point.rank.toLocaleString() })}
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        {t_g(point.raidType)}
        {point.trophy ? ` · ${point.trophy}` : ''}
      </div>
    </div>
  );
}

function RestrictionTooltip({ active, payload, metric }: { active?: boolean; payload?: ReadonlyArray<{ payload?: RestrictionPoint }>; metric: RestrictionMetric }) {
  const { t } = useTranslation('mypage');
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="font-semibold">{point.label}</div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{point.date}</div>
      <div className="mt-1">{metric === 'floor' ? t('raids.stats.floorLabel', { floor: point.floor ?? '-' }) : (point.clearTime ?? '-')}</div>
      {point.difficulty && <div className="text-xs text-neutral-500 dark:text-neutral-400">{point.difficulty}</div>}
    </div>
  );
}

function DistributionStrip({ title, points, total }: { title: string; points: StudentDistributionPoint[]; total: number }) {
  const { t } = useTranslation('mypage');
  if (points.length === 0) {
    return (
      <div>
        <div className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">{t('raids.stats.noData')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</div>
      <div className="flex h-4 overflow-hidden rounded-full border border-neutral-200 dark:border-neutral-800">
        {points.map((point) => {
          const ratio = total > 0 ? (point.count / total) * 100 : 0;
          return (
            <div
              key={`${title}-${point.value}`}
              className="h-full"
              style={{
                width: `${ratio}%`,
                backgroundColor: point.fill ?? '#737373',
              }}
              title={`${point.label}: ${t('raids.stats.countTimes', { count: point.count })} (${ratio.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="space-y-1.5">
        {points.map((point) => {
          const ratio = total > 0 ? (point.count / total) * 100 : 0;
          return (
            <div key={`${title}-row-${point.value}`} className="flex items-center gap-3 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: point.fill ?? '#737373' }} />
              <span className="min-w-0 flex-1 text-neutral-700 dark:text-neutral-200">{point.label}</span>
              <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{ratio.toFixed(1)}%</span>
              <span className="w-12 shrink-0 text-right text-neutral-500 dark:text-neutral-400">{t('raids.stats.countTimes', { count: point.count })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RaidStatsTab({ entries, raidOptions, students, locale }: RaidStatsTabProps) {
  const { t } = useTranslation('mypage');
  const { t: td } = useTranslation('dashboard');
  const { t: tch } = useTranslation('charts');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const { isDark } = useIsDarkState();
  const raidInfoByKey = useMemo(() => new Map(raidOptions.map((raid) => [`${raid.server}:${raid.id}`, raid])), [raidOptions]);

  const normalizedEntries = useMemo<NormalizedEntry[]>(() => {
    return entries.map((entry) => {
      const raid = raidInfoByKey.get(`${entry.server}:${entry.raidId}`);
      const teams = getEntryTeams(entry);
      const armorTypes = sortArmorTypes(uniqueStrings(teams.map((team) => team.armorType ?? '').filter((armorType) => armorType.length > 0)));
      const flatStudents = teams.flatMap((team) => [
        ...team.m.flatMap((student) => (student ? [{ student, role: 'striker' as const }] : [])),
        ...team.s.flatMap((student) => (student ? [{ student, role: 'special' as const }] : [])),
      ]);
      return {
        entry,
        raid,
        boss: raid?.boss ?? entry.raidId,
        armorTypes,
        students: flatStudents,
      };
    });
  }, [entries, raidInfoByKey]);

  const [scoreTypeFilters, setScoreTypeFilters] = useState<Set<RaidType | 'all'>>(new Set(['all']));
  const [scoreBossFilters, setScoreBossFilters] = useState<Set<string>>(new Set(['all']));
  const [scoreArmorFilters, setScoreArmorFilters] = useState<Set<string>>(new Set(['all']));
  const [raidResultMetric, setRaidResultMetric] = useState<RaidResultMetric>('rank');
  const [usageTypeFilters, setUsageTypeFilters] = useState<Set<RaidType | 'all'>>(new Set(['all']));
  const [usageAssistFilter, setUsageAssistFilter] = useState<UsageAssistFilter>('all');
  const [selectedUsageStudentId, setSelectedUsageStudentId] = useState<number | null>(null);
  const [restrictionBossFilters, setRestrictionBossFilters] = useState<Set<string>>(new Set());
  const [restrictionDifficultyFilters, setRestrictionDifficultyFilters] = useState<Set<string>>(new Set());
  const [restrictionMetric, setRestrictionMetric] = useState<RestrictionMetric>('floor');

  const scoreBossOptions = useMemo(() => uniqueStrings(normalizedEntries.filter(({ entry }) => entry.raidType === 'raid' || entry.raidType === 'eraid').map(({ boss }) => boss)), [normalizedEntries]);
  const scoreArmorOptions = useMemo(
    () => sortArmorTypes(uniqueStrings(normalizedEntries.filter(({ entry }) => entry.raidType === 'eraid').flatMap(({ armorTypes }) => armorTypes))),
    [normalizedEntries],
  );
  const restrictionBossOptions = useMemo(() => uniqueStrings(normalizedEntries.filter(({ entry }) => entry.raidType === 'multifloor').map(({ boss }) => boss)), [normalizedEntries]);
  const restrictionDifficultyOptions = useMemo(
    () => uniqueStrings(normalizedEntries.filter(({ entry }) => entry.raidType === 'multifloor').map(({ entry }) => entry.difficulty ?? '')),
    [normalizedEntries],
  );

  const toggleSetValue = (setter: Dispatch<SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const matchesUsageAssistFilter = (isAssist: boolean | undefined) => {
    if (usageAssistFilter === 'assist_only') return Boolean(isAssist);
    if (usageAssistFilter === 'main_only') return !isAssist;
    return true;
  };

  const scoreChartData = useMemo<ScorePoint[]>(() => {
    return normalizedEntries
      .filter(({ entry }) => scoreTypeFilters.has('all') || scoreTypeFilters.has(entry.raidType))
      .filter(({ boss }) => scoreBossFilters.has('all') || scoreBossFilters.has(boss))
      .filter(({ armorTypes, entry }) => {
        if (entry.raidType !== 'eraid' || scoreArmorFilters.has('all')) return true;
        return armorTypes.some((armorType) => scoreArmorFilters.has(armorType));
      })
      .filter(({ entry }) => (raidResultMetric === 'score' ? typeof entry.score === 'number' && Number.isFinite(entry.score) : typeof entry.rank === 'number' && Number.isFinite(entry.rank)))
      .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
      .map(({ entry, boss }) => ({
        id: entry.id,
        label: `${entry.raidId} ${boss}`,
        shortLabel: entry.raidId,
        date: entry.date,
        boss,
        raidType: entry.raidType,
        score: typeof entry.score === 'number' ? entry.score : undefined,
        rank: typeof entry.rank === 'number' ? entry.rank : undefined,
        trophy: entry.trophy,
      }));
  }, [normalizedEntries, raidResultMetric, scoreArmorFilters, scoreBossFilters, scoreTypeFilters]);

  const [scoreRange, setScoreRange] = useIndexRange(scoreChartData.length);
  const windowedScoreChartData = useMemo(() => scoreChartData.slice(scoreRange[0], scoreRange[1] + 1), [scoreChartData, scoreRange]);

  const scoreChartDomain = useMemo<[number, number]>(() => getTrimmedYAxisDomain(getScoreValues(windowedScoreChartData, raidResultMetric)), [raidResultMetric, windowedScoreChartData]);

  const scoreExtremes = useMemo(() => {
    const valueOf = (point: ScorePoint) => (raidResultMetric === 'score' ? point.score : point.rank);
    const withValue = windowedScoreChartData.filter((point) => typeof valueOf(point) === 'number');
    if (withValue.length === 0) return null;
    const isBetter = (candidate: ScorePoint, current: ScorePoint) =>
      raidResultMetric === 'score' ? (valueOf(candidate) as number) > (valueOf(current) as number) : (valueOf(candidate) as number) < (valueOf(current) as number);
    const best = withValue.reduce((current, candidate) => (isBetter(candidate, current) ? candidate : current));
    const worst = withValue.reduce((current, candidate) => (isBetter(current, candidate) ? candidate : current));
    return { best, worst };
  }, [windowedScoreChartData, raidResultMetric]);

  const scoreExtremeLabels = useMemo(() => {
    if (!scoreExtremes) return null;
    const formatValue = (point: ScorePoint) => {
      if (raidResultMetric === 'score' && typeof point.score === 'number') return point.score.toLocaleString();
      if (raidResultMetric === 'rank' && typeof point.rank === 'number') return t('raids.stats.rankValue', { rank: point.rank.toLocaleString() });
      return null;
    };
    const bestValue = formatValue(scoreExtremes.best);
    const worstValue = scoreExtremes.best.id === scoreExtremes.worst.id ? null : formatValue(scoreExtremes.worst);
    const bestLabel = bestValue ? `${raidResultMetric === 'score' ? td('maxScore') : td('bestRank')} ${bestValue} · ${scoreExtremes.best.date}` : null;
    const worstLabel = worstValue ? `${t_ui('worst')} ${raidResultMetric === 'score' ? t('raids.stats.scoreLabel', { score: worstValue }) : worstValue} · ${scoreExtremes.worst.date}` : null;
    return { bestLabel, worstLabel };
  }, [scoreExtremes, raidResultMetric, t, td, t_ui]);

  const jfdChartData = useMemo<ScorePoint[]>(() => {
    return normalizedEntries
      .filter(({ entry }) => entry.raidType === 'jfd' && typeof entry.score === 'number' && Number.isFinite(entry.score))
      .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
      .map(({ entry, boss }) => ({
        id: entry.id,
        label: `${entry.raidId} ${boss}`,
        shortLabel: entry.raidId,
        date: entry.date,
        boss,
        raidType: entry.raidType,
        score: entry.score as number,
        trophy: entry.trophy,
      }));
  }, [normalizedEntries]);

  const [jfdRange, setJfdRange] = useIndexRange(jfdChartData.length);
  const windowedJfdChartData = useMemo(() => jfdChartData.slice(jfdRange[0], jfdRange[1] + 1), [jfdChartData, jfdRange]);

  const jfdScoreDomain = useMemo<[number, number]>(() => getTrimmedYAxisDomain(getScoreValues(windowedJfdChartData, 'score')), [windowedJfdChartData]);

  const usageRanking = useMemo(() => {
    const counts = new Map<number, { count: number; assistCount: number }>();
    let totalAppearances = 0;
    for (const normalized of normalizedEntries) {
      if (!usageTypeFilters.has('all') && !usageTypeFilters.has(normalized.entry.raidType)) continue;
      for (const slot of normalized.students) {
        if (!matchesUsageAssistFilter(slot.student.isAssist)) continue;
        const current = counts.get(slot.student.id) ?? {
          count: 0,
          assistCount: 0,
        };
        current.count += 1;
        if (slot.student.isAssist) current.assistCount += 1;
        counts.set(slot.student.id, current);
        totalAppearances += 1;
      }
    }
    return Array.from(counts.entries())
      .map(([studentId, value]) => ({
        studentId,
        student: students[String(studentId)],
        count: value.count,
        assistCount: value.assistCount,
        share: totalAppearances > 0 ? (value.count / totalAppearances) * 100 : 0,
      }))
      .filter((item) => item.student)
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.student.Name.localeCompare(b.student.Name)));
  }, [normalizedEntries, students, usageAssistFilter, usageTypeFilters]);

  const selectedUsageStudent = useMemo(() => {
    if (selectedUsageStudentId === null) return null;
    const studentId = selectedUsageStudentId;
    const ranking = usageRanking.find((item) => item.studentId === studentId);
    if (!ranking) return null;

    const matchingSlots = normalizedEntries
      .filter(({ entry }) => usageTypeFilters.has('all') || usageTypeFilters.has(entry.raidType))
      .flatMap(({ students: slots }) =>
        slots.filter((slot) => {
          if (slot.student.id !== studentId) return false;
          if (!matchesUsageAssistFilter(slot.student.isAssist)) return false;
          return true;
        }),
      );

    const total = matchingSlots.length;
    const starCounts = new Map<number, number>();
    const levelCounts = new Map<number, number>();

    for (const slot of matchingSlots) {
      const baseStudent = students[String(slot.student.id)];
      const starValue = getStudentStarValue(slot.student, baseStudent?.StarGrade ?? 1);
      const levelValue = slot.student.level ?? 0;
      starCounts.set(starValue, (starCounts.get(starValue) ?? 0) + 1);
      if (levelValue > 0) {
        levelCounts.set(levelValue, (levelCounts.get(levelValue) ?? 0) + 1);
      }
    }

    const starData: StudentDistributionPoint[] = Array.from(starCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([value, count]) => ({
        label: value <= 5 ? t('raids.stats.starLabel', { n: value }) : t('raids.stats.weaponLabel', { n: value - 6 }),
        value,
        count,
        fill: getBackgroundRatingColor(value, isDark),
      }));

    const levelData: StudentDistributionPoint[] = Array.from(levelCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([value, count], index, source) => ({
        label: `Lv.${value}`,
        value,
        count,
        fill: LEVEL_SEGMENT_COLORS[source.length === 1 ? 1 : index % LEVEL_SEGMENT_COLORS.length],
      }));

    return {
      ...ranking,
      total,
      starData,
      levelData,
    };
  }, [isDark, normalizedEntries, selectedUsageStudentId, students, usageAssistFilter, usageRanking, usageTypeFilters]);

  const restrictionChartData = useMemo<RestrictionPoint[]>(() => {
    const isBossFiltered = restrictionBossFilters.size > 0;
    const isDifficultyFiltered = restrictionDifficultyFilters.size > 0;
    return normalizedEntries
      .filter(({ entry }) => entry.raidType === 'multifloor')
      .filter(({ boss }) => !isBossFiltered || restrictionBossFilters.has(boss))
      .filter(({ entry }) => !isDifficultyFiltered || (entry.difficulty ? restrictionDifficultyFilters.has(entry.difficulty) : false))
      .map(({ entry, boss }) => {
        const seconds = parseClearTimeToSeconds(entry.clearTime);
        const metricValue = restrictionMetric === 'floor' ? (entry.floor ?? 0) : (seconds ?? 0);
        return {
          id: entry.id,
          label: `${entry.raidId} ${boss}`,
          shortLabel: entry.raidId,
          date: entry.date,
          boss,
          metricValue,
          floor: entry.floor,
          clearTime: entry.clearTime,
          difficulty: entry.difficulty,
        };
      })
      .filter((point) => point.metricValue > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [normalizedEntries, restrictionBossFilters, restrictionDifficultyFilters, restrictionMetric]);

  const [restrictionRange, setRestrictionRange] = useIndexRange(restrictionChartData.length);
  const windowedRestrictionChartData = useMemo(() => restrictionChartData.slice(restrictionRange[0], restrictionRange[1] + 1), [restrictionChartData, restrictionRange]);

  const restrictionChartDomain = useMemo<[number, number]>(() => getTrimmedYAxisDomain(getRestrictionMetricValues(windowedRestrictionChartData)), [windowedRestrictionChartData]);

  const totalUniqueStudents = useMemo(() => new Set(normalizedEntries.flatMap(({ students: slots }) => slots.map((slot) => slot.student.id))).size, [normalizedEntries]);

  const totalAssistEntries = useMemo(() => normalizedEntries.reduce((sum, normalized) => sum + normalized.students.filter((slot) => slot.student.isAssist).length, 0), [normalizedEntries]);

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      <section className="space-y-4 py-5 first:pt-0">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.totalRecords')}</div>
            <div className="mt-1 text-2xl font-bold text-neutral-950 dark:text-neutral-50">{entries.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.uniqueStudents')}</div>
            <div className="mt-1 text-2xl font-bold text-neutral-950 dark:text-neutral-50">{totalUniqueStudents}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.assistCount')}</div>
            <div className="mt-1 text-2xl font-bold text-neutral-950 dark:text-neutral-50">{totalAssistEntries}</div>
          </div>
        </div>
      </section>

      <section className="space-y-4 py-5 first:pt-0">
        <div>
          <h2 className={SECTION_TITLE_CLS}>{t('raids.stats.scoreChart.title')}</h2>
          <p className={SECTION_DESC_CLS}>{t('raids.stats.scoreChart.desc')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['rank', td('byRank')],
              ['score', td('byScore')],
            ] as [RaidResultMetric, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRaidResultMetric(value)}
              className={`rounded border px-3 py-1.5 text-sm ${
                raidResultMetric === value
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.content')}</span>
            <CheckboxSelect<RaidType | 'all'>
              ariaLabel={t('raids.stats.content')}
              options={
                [
                  { value: 'raid', label: t_g('raid') },
                  { value: 'eraid', label: t_g('eraid') },
                ] satisfies CheckboxSelectOption<RaidType>[]
              }
              selectedValues={scoreTypeFilters}
              onChange={(next) => setScoreTypeFilters(next.size === 0 ? new Set(['all']) : next)}
              allOption={{ value: 'all', label: t_ui('all') }}
              className="w-40"
              buttonClassName={FILTER_SELECT_BUTTON_CLS}
            />
          </label>
          {scoreBossOptions.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.boss')}</span>
              <CheckboxSelect
                ariaLabel={t('raids.stats.boss')}
                options={scoreBossOptions.map((boss) => ({ value: boss, label: getFilterLabel(boss, locale) }))}
                selectedValues={scoreBossFilters}
                onChange={(next) => setScoreBossFilters(next.size === 0 ? new Set(['all']) : next)}
                allOption={{ value: 'all', label: t_ui('all') }}
                className="w-40"
                buttonClassName={FILTER_SELECT_BUTTON_CLS}
              />
            </label>
          )}
          {scoreArmorOptions.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.armor')}</span>
              <CheckboxSelect
                ariaLabel={t('raids.stats.armor')}
                options={scoreArmorOptions.map((armorType) => ({ value: armorType, label: getFilterLabel(armorType, locale) }))}
                selectedValues={scoreArmorFilters}
                onChange={(next) => setScoreArmorFilters(next.size === 0 ? new Set(['all']) : next)}
                allOption={{ value: 'all', label: t_ui('all') }}
                className="w-40"
                buttonClassName={FILTER_SELECT_BUTTON_CLS}
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          {Object.entries(TROPHY_COLOR).map(([trophy, color]) => (
            <div key={trophy} className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{trophy}</span>
            </div>
          ))}
        </div>

        {scoreExtremeLabels && (scoreExtremeLabels.bestLabel || scoreExtremeLabels.worstLabel) && (
          <div className="text-xs text-neutral-700 dark:text-neutral-300">{[scoreExtremeLabels.bestLabel, scoreExtremeLabels.worstLabel].filter(Boolean).join(' · ')}</div>
        )}

        {scoreChartData.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{raidResultMetric === 'score' ? t('raids.stats.scoreChart.emptyScore') : t('raids.stats.scoreChart.emptyRank')}</div>
        ) : (
          <>
            <IndexRangeSlider length={scoreChartData.length} range={scoreRange} onChange={setScoreRange} formatLabel={(index) => scoreChartData[index]?.date ?? ''} />
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={windowedScoreChartData} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
                  <XAxis dataKey="shortLabel" tick={{ fill: '#737373', fontSize: 12 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis domain={scoreChartDomain} tick={{ fill: '#737373', fontSize: 12 }} tickFormatter={(value: number) => value.toLocaleString()} reversed={raidResultMetric === 'rank'} />
                  <Tooltip content={({ active, payload }) => <ScoreTooltip active={active} payload={payload} metric={raidResultMetric} />} />
                  <Line type="monotone" dataKey={raidResultMetric} stroke="#737373" strokeWidth={2} dot={false} activeDot={false} />
                  <Scatter
                    dataKey={raidResultMetric}
                    shape={(props: { cx?: number; cy?: number; payload?: ScorePoint }) => {
                      if (typeof props.cx !== 'number' || typeof props.cy !== 'number') return null;
                      const fill = props.payload?.trophy ? TROPHY_COLOR[props.payload.trophy] : '#737373';
                      const isExtreme = Boolean(scoreExtremes && props.payload && (props.payload.id === scoreExtremes.best.id || props.payload.id === scoreExtremes.worst.id));
                      const radius = isExtreme ? 6 : 4;
                      return (
                        <g>
                          {isExtreme && <circle cx={props.cx} cy={props.cy} r={radius + 3} fill="none" stroke={isDark ? '#f5f5f5' : '#171717'} strokeWidth={1.5} />}
                          <circle cx={props.cx} cy={props.cy} r={radius} fill={fill} stroke="#171717" strokeWidth={isExtreme ? 2 : 1} />
                        </g>
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 py-5 first:pt-0">
        <div>
          <h2 className={SECTION_TITLE_CLS}>{t('raids.stats.jfdChart.title')}</h2>
          <p className={SECTION_DESC_CLS}>{t('raids.stats.jfdChart.desc')}</p>
        </div>
        {jfdChartData.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{t('raids.stats.jfdChart.empty')}</div>
        ) : (
          <>
            <IndexRangeSlider length={jfdChartData.length} range={jfdRange} onChange={setJfdRange} formatLabel={(index) => jfdChartData[index]?.date ?? ''} />
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={windowedJfdChartData} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
                  <XAxis dataKey="shortLabel" tick={{ fill: '#737373', fontSize: 12 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis domain={jfdScoreDomain} tick={{ fill: '#737373', fontSize: 12 }} tickFormatter={(value: number) => value.toLocaleString()} />
                  <Tooltip content={({ active, payload }) => <ScoreTooltip active={active} payload={payload} metric="score" />} />
                  <Line type="monotone" dataKey="score" stroke="#77e0ff" strokeWidth={2} dot={{ r: 3, fill: '#77e0ff', stroke: '#171717', strokeWidth: 1 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 py-5 first:pt-0">
        <div>
          <h2 className={SECTION_TITLE_CLS}>{t('raids.stats.usageChart.title')}</h2>
          <p className={SECTION_DESC_CLS}>{t('raids.stats.usageChart.desc')}</p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{t('raids.stats.content')}</span>
          <CheckboxSelect<RaidType | 'all'>
            ariaLabel={t('raids.stats.content')}
            options={
              [
                { value: 'raid', label: t_g('raid') },
                { value: 'eraid', label: t_g('eraid') },
                { value: 'jfd', label: t_g('jfd') },
                { value: 'multifloor', label: t_g('multifloor') },
              ] satisfies CheckboxSelectOption<RaidType>[]
            }
            selectedValues={usageTypeFilters}
            onChange={(next) => setUsageTypeFilters(next.size === 0 ? new Set(['all']) : next)}
            allOption={{ value: 'all', label: t_ui('all') }}
            className="w-40"
            buttonClassName={FILTER_SELECT_BUTTON_CLS}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', td('applyAssist')],
              ['main_only', tch('ranking.control.rank_normal')],
              ['assist_only', tch('ranking.control.rank_assist')],
            ] as [UsageAssistFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setUsageAssistFilter(value)}
              className={`rounded border px-3 py-1.5 text-sm ${
                usageAssistFilter === value
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {usageRanking.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{t('raids.stats.usageChart.empty')}</div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {usageRanking.slice(0, 20).map((item, index) => {
              const isSelected = selectedUsageStudent?.studentId === item.studentId;
              return (
                <div key={item.studentId}>
                  <button
                    type="button"
                    onClick={() => setSelectedUsageStudentId((current) => (current === item.studentId ? null : item.studentId))}
                    className={`flex w-full items-center gap-3 py-3 text-left ${isSelected ? 'bg-neutral-50 dark:bg-neutral-900/60' : ''}`}
                  >
                    <div className="w-8 text-sm font-semibold text-neutral-500 dark:text-neutral-400">{index + 1}</div>
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                      <SheetIcon sheet="student" id={item.studentId} alt={item.student.Name} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-neutral-900 dark:text-neutral-100" title={item.student.Name}>
                        {item.student.Name}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {item.assistCount > 0 ? t('raids.stats.assistTimes', { count: item.assistCount }) : t('raids.stats.studentDeployment')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{t('raids.stats.countTimes', { count: item.count })}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{item.share.toFixed(1)}%</div>
                    </div>
                  </button>

                  {isSelected && selectedUsageStudent && (
                    <div className="border-t border-neutral-200 py-4 dark:border-neutral-800">
                      {/* <div className="flex items-center gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                          <img
                            src={getPortraitSrc(selectedUsageStudent.studentId, selectedUsageStudent.student, portraitData)}
                            alt={selectedUsageStudent.student.Name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-950 dark:text-neutral-50">{selectedUsageStudent.student.Name}</div>
                          <div className="text-sm text-neutral-500 dark:text-neutral-400">
                            {t('raids.stats.totalDeployments', { count: selectedUsageStudent.total })}
                            {selectedUsageStudent.assistCount > 0 ? ` · ${t('raids.stats.assistTimes', { count: selectedUsageStudent.assistCount })}` : ''}
                          </div>
                        </div>
                      </div> */}

                      <div className="mb-4 grid gap-6 lg:grid-cols-2">
                        <DistributionStrip title={t('raids.stats.starDist')} points={selectedUsageStudent.starData} total={selectedUsageStudent.total} />
                        <DistributionStrip title={t('raids.stats.levelDist')} points={selectedUsageStudent.levelData} total={selectedUsageStudent.total} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 py-5 first:pt-0">
        <div>
          <h2 className={SECTION_TITLE_CLS}>{t('raids.stats.restrictionChart.title')}</h2>
          <p className={SECTION_DESC_CLS}>{t('raids.stats.restrictionChart.desc')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['floor', t('raids.floor')],
              ['time', t_ui('time')],
            ] as [RestrictionMetric, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRestrictionMetric(value)}
              className={`rounded border px-3 py-1.5 text-sm ${
                restrictionMetric === value
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <FilterCheckboxRow
          label={t('raids.stats.boss')}
          options={restrictionBossOptions}
          selected={restrictionBossFilters}
          onToggle={(value) => toggleSetValue(setRestrictionBossFilters, value)}
          locale={locale}
        />
        <FilterCheckboxRow
          label={t_g('difficulty')}
          options={restrictionDifficultyOptions}
          selected={restrictionDifficultyFilters}
          onToggle={(value) => toggleSetValue(setRestrictionDifficultyFilters, value)}
          locale={locale}
        />

        {restrictionChartData.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{t('raids.stats.restrictionChart.empty')}</div>
        ) : (
          <>
            <IndexRangeSlider length={restrictionChartData.length} range={restrictionRange} onChange={setRestrictionRange} formatLabel={(index) => restrictionChartData[index]?.date ?? ''} />
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={windowedRestrictionChartData} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
                  <XAxis dataKey="shortLabel" tick={{ fill: '#737373', fontSize: 12 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis
                    domain={restrictionChartDomain}
                    tick={{ fill: '#737373', fontSize: 12 }}
                    tickFormatter={(value: number) => (restrictionMetric === 'floor' ? `${value}` : formatSecondsLabel(value))}
                  />
                  <Tooltip content={({ active, payload }) => <RestrictionTooltip active={active} payload={payload} metric={restrictionMetric} />} />
                  <Line type="monotone" dataKey="metricValue" stroke={restrictionMetric === 'floor' ? '#77e0ff' : '#a3a3a3'} strokeWidth={2} dot={false} activeDot={false} />
                  <Scatter
                    dataKey="metricValue"
                    shape={(props: { cx?: number; cy?: number }) => {
                      if (typeof props.cx !== 'number' || typeof props.cy !== 'number') return null;
                      const fill = restrictionMetric === 'floor' ? '#77e0ff' : '#a3a3a3';
                      return <circle cx={props.cx} cy={props.cy} r={4} fill={fill} stroke="#171717" strokeWidth={1} />;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
