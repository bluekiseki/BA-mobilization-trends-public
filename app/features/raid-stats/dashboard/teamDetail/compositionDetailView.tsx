import React, { useState, useMemo, useId } from 'react';
import { RankScatterPlot } from './RankScatterPlot';
import { PartyCountChart, PARTY_COUNT_COLORS } from './partyCountChart';
import { useTranslation } from 'react-i18next';
import { getDifficultyFromScoreAndBoss } from '~/components/raid/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer, RaidInfo } from '~/types/data';
import { getBackgroundRatingColor, getCharacterStarValue } from '../../../../utils/raid/report';
import type { Character, ReportEntryRank, ReportStudentData } from '../../../../types/raidReport';
import { formatTimeToTimestamp } from '~/utils/time';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useIsDarkState } from '~/store/isDarkState';
import { StudentIcon } from '../../../../components/student/studentIcon';
import { StarRating } from '~/components/student/StarRating';
import { IoChevronDown, IoClose } from 'react-icons/io5';
import { YouTubeSearchGenerator } from '../../common/YouTubeSearchGenerator';

interface CustomBarLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  total?: number;
}

interface BinEntry {
  count: number;
  [key: number]: number;
}

type StarChartEntry = { name: string; [key: string]: number | string };

interface StarRow {
  studentId: number;
  data: StarChartEntry[];
  total: number;
}

interface StarGroup {
  // 0-based party index in report mode, null when there is only one party to show
  partyIndex: number | null;
  rows: StarRow[];
}

const teamIds = (team: { m: (Character | null)[]; s: (Character | null)[] }): number[] => [...team.m, ...team.s].filter((c): c is Character => !!c?.id).map((c) => c.id);

const ZERO_RUN_COLLAPSE = 50;

const CustomBarLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0, total }: CustomBarLabelProps) => {
  if (value === 0 || !total || width < 35) {
    return null;
  }

  const percentage = ((value / total) * 100).toFixed(1);
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize="8">
        {/* First line of text */}
        <tspan x="0" dy="-0.7em">
          {value}
        </tspan>
        {/* Second line of text */}
        <tspan x="0" dy="1.4em">
          {percentage}%
        </tspan>
      </text>
    </g>
  );
};

const HistogramTooltip = ({ active, payload, label }: Partial<TooltipContentProps<number, string>>) => {
  const { t } = useTranslation('dashboard');

  if (active && payload && payload.length) {
    const data = payload[0].payload as { all?: number };
    const firstKey = String(payload[0].dataKey ?? '');
    const isPartyCountMode = firstKey.startsWith('tc');
    const isPositionMode = firstKey.startsWith('pos');

    if (isPartyCountMode || isPositionMode) {
      const totalInBin = payload.reduce((sum: number, p) => sum + Number(p.value ?? 0), 0);
      if (totalInBin === 0) return null;
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-2 border dark:border-neutral-600 rounded-md shadow-lg text-sm space-y-1">
          <p className="font-bold text-center border-b pb-1 mb-1">{label}</p>
          {payload
            .filter((p) => Number(p.value) > 0)
            .map((p) => {
              const numValue = Number(String(p.dataKey).replace(isPartyCountMode ? 'tc' : 'pos', ''));
              let n = numValue;
              let m = n;
              if (isPositionMode) {
                m = Math.floor(numValue / 100000);
                n = numValue % 100000;
              }
              const label = isPartyCountMode ? t('nPartyCount', { n }) : t('nthPosition', { n, m });
              return (
                <div key={String(p.dataKey ?? '')} className="flex items-center gap-1.5">
                  <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.fill }}></span>
                  <span className="font-medium">{label}</span>
                  <span className="font-bold">{Number(p.value).toLocaleString()}</span>
                  <span className="text-neutral-600 dark:text-neutral-400">{`(${((Number(p.value) / totalInBin) * 100).toFixed(1)}%)`}</span>
                </div>
              );
            })}
        </div>
      );
    }

    return (
      <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-2 border dark:border-neutral-600 rounded-md shadow-lg text-sm space-y-1">
        <p className="font-bold text-center border-b pb-1 mb-1">{label}</p>
        {data.all !== undefined && <p className="font-semibold">{t('tooltipPlayers', { count: data.all.toLocaleString() })}</p>}
        {data.all === undefined &&
          (() => {
            const totalInBin = payload.reduce((sum: number, p) => sum + Number(p.value ?? 0), 0);
            if (totalInBin === 0) return null;

            return payload
              .filter((p) => Number(p.value) > 0)
              .map((p) => (
                <div key={String(p.dataKey ?? '')} className="flex items-center gap-1.5">
                  <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.fill }}></span>
                  <span>
                    <StarRating n={Number(p.dataKey)} />
                  </span>
                  <span className="font-bold">{Number(p.value).toLocaleString()}</span>
                  <span className="text-neutral-600 dark:text-neutral-400">{`(${((Number(p.value) / totalInBin) * 100).toFixed(1)}%)`}</span>
                </div>
              ));
          })()}
      </div>
    );
  }
  return null;
};

export const StarRatingDistributionBarChart: React.FC<{
  studentChartInfo: {
    data: StarChartEntry[];
    total: number;
  };
  studentId: number;
  studentData: ReportStudentData;
}> = ({ studentChartInfo, studentId, studentData }) => {
  if (!studentChartInfo || !studentChartInfo.data.length) {
    return null;
  }

  const { isDark } = useIsDarkState();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  const chartDataWithTotal = studentChartInfo.data.map((d) => ({
    ...d,
    total: studentChartInfo.total,
  }));

  const dataKeys = Object.keys(chartDataWithTotal[0]).filter((key) => key !== 'total' && key != 'name');

  return (
    <>
      <div className="shrink-0 w-10">
        <StudentIcon character={{ id: studentId } as Character} student={studentData[studentId]} />
      </div>
      <div className="grow h-10">
        <ResponsiveContainer width="100%" height={40}>
          <BarChart data={chartDataWithTotal} layout="vertical" margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
            <XAxis type="number" hide domain={[0, studentChartInfo.total]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={{ zIndex: 50 }}
              content={({ payload, active }) => {
                if (active && payload && payload.length) {
                  const hovered = payload.find((v) => String(activeIndex) == String(v.dataKey).replace('★', '')); // Data from the current hover bar
                  if (!hovered) return null;
                  const total = (hovered.payload as { total?: number }).total; // Total headcount
                  if (!total) return null;

                  const rows = payload.filter((v) => Number(v.value) > 0);
                  if (Number(hovered.value) === 0) return null;

                  return (
                    <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-2 border dark:border-neutral-600 rounded-md shadow-lg text-sm flex flex-col gap-0.5">
                      {rows.map((row) => {
                        const value = Number(row.value); // Number of persons of star level
                        const isActive = row.dataKey === hovered.dataKey;
                        return (
                          <div
                            key={String(row.dataKey)}
                            className={`flex items-center gap-1.5 px-1 ${isActive ? 'bg-neutral-200 dark:bg-neutral-700 font-bold' : 'text-neutral-500 dark:text-neutral-400'}`}
                          >
                            <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.fill }}></span>
                            <span>
                              <StarRating n={Number(String(row.dataKey).replace('★', ''))} />
                            </span>
                            <span className={isActive ? 'font-bold' : ''}>{value.toLocaleString()}</span>
                            <span className={isActive ? '' : 'text-neutral-500 dark:text-neutral-400'}>{`(${((value / total) * 100).toFixed(1)}%)`}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return null;
              }}
              cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} // Hover Background Effect
            />
            {dataKeys
              .sort((x, y) => {
                const a = parseInt(x, 10);
                const b = parseInt(y, 10);
                const a_ = a < 0 ? -a + 1000 : a;
                const b_ = b < 0 ? -b + 1000 : b;
                return a_ - b_;
              })
              .map((key) => {
                // Extract the number 8 from '8★'.
                const star = parseInt(key, 10);
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={getBackgroundRatingColor(star, isDark) || '#ccc'}
                    onMouseEnter={() => handleMouseEnter(star)}
                    onMouseLeave={handleMouseLeave}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={key}
                      content={React.cloneElement(<CustomBarLabel />, {
                        total: studentChartInfo.total,
                      })}
                    />
                  </Bar>
                );
              })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

const FORMATION_PAGE = 3;

// Lists the full formations (all parties of a report) that contain the selected party
const IncludedFormations: React.FC<{
  entries: ReportEntryRank[];
  compKey: string;
  studentData: ReportStudentData;
  startRank: number;
  maxRank: number;
}> = ({ entries, compKey, studentData, startRank, maxRank }) => {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [isExpanded, setIsExpanded] = useState(false);
  const [visible, setVisible] = useState(FORMATION_PAGE);
  const panelId = useId();

  const formations = useMemo(() => {
    const map = new Map<string, { teams: number[][]; count: number; ranks: number[] }>();
    for (const entry of entries) {
      const teams = entry.t.map(teamIds).filter((ids) => ids.length > 0);
      // Order-insensitive key so the same set of parties counts as one formation
      const key = teams
        .map((ids) => [...ids].sort((a, b) => a - b).join(','))
        .sort()
        .join('|');
      const rank = entry.typeRanking || entry.r;
      const found = map.get(key);
      if (found) {
        found.count += 1;
        found.ranks.push(rank);
      } else {
        map.set(key, { teams, count: 1, ranks: [rank] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  if (formations.length === 0) return null;

  return (
    <div>
      <h4>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => {
            setIsExpanded((expanded) => !expanded);
            setVisible(FORMATION_PAGE);
          }}
          className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <span>{t('composition.included_formations')}</span>
          <span className="font-normal tabular-nums text-neutral-500 dark:text-neutral-400">({formations.length.toLocaleString()})</span>
          <IoChevronDown aria-hidden="true" className={`ml-auto shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </h4>
      <div id={panelId} hidden={!isExpanded}>
        {isExpanded && (
          <>
            <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-700">
              {formations.slice(0, visible).map((f, i) => (
                <div key={i} className="flex flex-col md:flex-row md:items-start gap-4 py-3">
                  <div className="flex flex-col items-center md:items-start gap-2 shrink-0">
                    {f.teams.map((ids, tIdx) => {
                      const isSelf = [...ids].sort((a, b) => a - b).join(',') === compKey;
                      return (
                        <div key={tIdx} className={`grid grid-cols-6 gap-1 rounded-sm ${isSelf ? 'outline-2 outline-offset-2 outline-ba-btn-blue-dark' : ''}`}>
                          {ids.map((sid, idx) => (
                            <div key={idx} className="w-10">
                              <StudentIcon character={{ id: sid } as Character} student={studentData[sid]} />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-full flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-neutral-700 dark:text-neutral-100 text-sm font-bold">{((f.count / entries.length) * 100).toFixed(1)}%</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('composition.included_formations_count', { count: f.count })}</span>
                    </div>
                    <RankScatterPlot ranks={f.ranks} start_rank={startRank} max_rank={maxRank} />
                  </div>
                </div>
              ))}
            </div>
            {visible < formations.length && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setVisible((v) => v + FORMATION_PAGE);
                }}
                className="mt-2 w-full py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 cursor-pointer"
              >
                {t_ui('loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const CompositionDetailView: React.FC<{
  comp: { ids: number[]; [key: string]: unknown };
  entries: ReportEntryRank[];
  studentData: ReportStudentData;
  raidInfo: RaidInfo;
  boss: string;
  server: GameServer;
  id: string;
  onClose: () => void;
  analysisUnit?: 'team' | 'report';
  // Student IDs per party of the most common arrangement (report mode)
  partyLayout?: number[][];
  // Rank range of the whole dataset, so the scatter plots line up with the main list
  rankRange?: { start: number; max: number };
}> = ({ comp, entries, studentData, raidInfo, boss, server, id, onClose, analysisUnit, partyLayout, rankRange }) => {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [selectedStudentId, setSelectedStudentId] = useState<'all' | number>('all');
  const [dataType, setDataType] = useState<'score' | 'time' | 'rank'>('rank');
  const [partyCountView, setPartyCountView] = useState<'none' | 'totalCount' | 'position'>('none');
  // const [showCompPartyStats, setShowCompPartyStats] = useState(false);
  const { isDark } = useIsDarkState();

  if (entries.length == 0) return null;

  const uniqueIds = useMemo(() => [...new Set(comp.ids)], [comp.ids]);

  const isTimeViewable = useMemo(() => {
    if (entries.length === 0) return false;
    let minScore = entries[0].s,
      maxScore = entries[0].s;
    for (const e of entries) {
      if (e.s < minScore) minScore = e.s;
      if (e.s > maxScore) maxScore = e.s;
    }
    return getDifficultyFromScoreAndBoss(minScore, server, id) === getDifficultyFromScoreAndBoss(maxScore, server, id);
  }, [entries, server, id]);

  // Best score / Best Calculator
  const { maxScore, minTime, maxDifficulty, bestRank } = useMemo(() => {
    const scores = entries.map((e) => e.s);
    const maxScore = Math.max(...scores);
    const minTime = calculateTimeFromScore(maxScore, boss, server, id);
    const maxDifficulty = getDifficultyFromScoreAndBoss(entries[0].s, server, id);
    const bestRank = Math.min(...entries.map((e) => e.typeRanking ?? e.r));
    return { maxScore, minTime, maxDifficulty, bestRank };
  }, [entries, isTimeViewable, boss, server, id]);

  // Calculate histogram and star distribution data
  const { histogram, starGroups, starRatings, teamCounts, partyPositions } = useMemo(() => {
    if (entries.length === 0) return { histogram: [], starGroups: [] as StarGroup[], starRatings: [], teamCounts: [], partyPositions: [] };

    const availableStars = new Set<number>();
    const compKey = comp.ids.join(',');

    // Groups to display: one per party in report mode (multi-party), otherwise a single flat group
    const layout: number[][] = analysisUnit === 'report' && partyLayout && partyLayout.length > 1 ? partyLayout : [uniqueIds];
    const isSplit = layout.length > 1;
    const layoutKeys = layout.map((ids) => [...ids].sort((a, b) => a - b).join(','));
    const groupCounts: Map<number, { [starKey: string]: number }>[] = layout.map((ids) => new Map(ids.map((sid) => [sid, {}])));

    const addChar = (groupIdx: number, char: Character) => {
      const counts = groupCounts[groupIdx]?.get(char.id);
      if (!counts) return;
      const star = getCharacterStarValue(char);
      if (typeof star !== 'number' || isNaN(star)) return;
      availableStars.add(star);
      const starKey = `${star}★`;
      counts[starKey] = (counts[starKey] || 0) + 1;
    };

    for (const entry of entries) {
      const used = new Set<number>();
      entry.t.forEach((team, tIdx) => {
        const ids = teamIds(team);
        if (ids.length === 0) return;
        const key = [...ids].sort((a, b) => a - b).join(',');
        let groupIdx = -1;
        if (!isSplit) {
          // Party mode only counts the selected party itself, not other parties in the same report
          if (analysisUnit === 'team' && key !== compKey) return;
          groupIdx = 0;
        } else {
          // Match by party membership first, fall back to the party slot
          groupIdx = layoutKeys.findIndex((k, i) => k === key && !used.has(i));
          if (groupIdx < 0 && tIdx < layout.length && !used.has(tIdx)) groupIdx = tIdx;
          if (groupIdx < 0) return;
          used.add(groupIdx);
        }
        for (const char of [...team.m, ...team.s]) {
          if (char?.id) addChar(groupIdx, char);
        }
      });
    }

    // 2. Initialize variable for data collection
    const bins = new Map<number, BinEntry>();
    const teamCountBins = new Map<number, Map<number, number>>();
    const positionBins = new Map<number, Map<number, number>>();
    const allTeamCounts = new Set<number>();
    const allPositions = new Set<number>();

    const binSize = (() => {
      if (dataType === 'score') {
        const scoreRange = entries[0].s - entries[entries.length - 1].s;
        return 10 ** ((Math.log10(scoreRange) - 2) | 0);
      }
      if (dataType === 'time') {
        return 5; // 5s
      }
      // dataType == 'rank'
      const rankRange = entries[entries.length - 1].typeRanking - entries[0].typeRanking;
      if (rankRange <= 0) return 100;
      return Math.max(10, 10 ** (Math.floor(Math.log10(rankRange)) - 1));
    })();

    for (const entry of entries) {
      const value = (() => {
        if (dataType === 'score') return entry.s;
        if (dataType === 'time') return isTimeViewable ? calculateTimeFromScore(entry.s, boss, server, id) || 0 : 0;
        return entry.typeRanking; // 'rank'
      })();

      const binIndex = Math.floor(value / binSize);
      const currentBin: BinEntry = bins.get(binIndex) ?? { count: 0 };

      if (selectedStudentId === 'all') {
        currentBin.count += 1; // For 'All', just count entries

        if (analysisUnit === 'team') {
          const tc = entry.t.length;
          allTeamCounts.add(tc);
          const tcMap = teamCountBins.get(binIndex) ?? new Map<number, number>();
          tcMap.set(tc, (tcMap.get(tc) ?? 0) + 1);
          teamCountBins.set(binIndex, tcMap);

          if (partyCountView === 'position') {
            for (let i = 0; i < entry.t.length; i++) {
              const team = entry.t[i];
              const teamKey = [...team.m, ...team.s]
                .filter((c): c is Character => !!(c && c.id))
                .map((c) => c.id)
                .sort((a, b) => a - b)
                .join(',');
              if (teamKey === compKey) {
                const pos = i + 1;
                const tc = entry.t.length;
                const posKey = tc * 100000 + pos;
                allPositions.add(posKey);
                const posMap = positionBins.get(binIndex) ?? new Map<number, number>();
                posMap.set(posKey, (posMap.get(posKey) ?? 0) + 1);
                positionBins.set(binIndex, posMap);
                break;
              }
            }
          }
        }
      } else {
        const studentChars = entry.t.flatMap((team) => [...team.m, ...team.s]).filter((c): c is Character => !!c && c.id === selectedStudentId);
        studentChars.forEach((char) => {
          const star = getCharacterStarValue(char);
          availableStars.add(star);
          if (!currentBin[star]) currentBin[star] = 0;
          currentBin[star] += 1;
        });
      }
      bins.set(binIndex, currentBin);
    }
    // Fill all gaps, then collapse consecutive zero runs >= threshold
    if (bins.size > 1) {
      const indices = Array.from(bins.keys());
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      for (let i = minIdx; i <= maxIdx; i++) {
        if (!bins.has(i)) {
          bins.set(i, { count: 0 });
          teamCountBins.set(i, new Map());
          positionBins.set(i, new Map());
        }
      }

      const sortedIndices = Array.from(bins.keys()).sort((a, b) => a - b);
      const toDelete = new Set<number>();
      let zeroRun: number[] = [];

      const flushRun = () => {
        if (zeroRun.length >= ZERO_RUN_COLLAPSE) {
          for (const idx of zeroRun) toDelete.add(idx);
        }
        zeroRun = [];
      };

      for (const idx of sortedIndices) {
        const bin = bins.get(idx);
        if (!bin) continue;
        if (Object.values(bin).every((v) => v === 0)) {
          zeroRun.push(idx);
        } else {
          flushRun();
        }
      }
      flushRun();

      for (const idx of toDelete) {
        bins.delete(idx);
        teamCountBins.delete(idx);
        positionBins.delete(idx);
      }
    }

    const dynamicStarRatings = Array.from(availableStars).sort((a, b) => a - b);

    // 4. Converting data to Recharts format (sort by binIndex first to guarantee order)
    const histogramData = Array.from(bins.entries())
      .sort(([a], [b]) => a - b)
      .map(([binIndex, starData]) => {
        const start = binIndex * binSize;

        const name = (() => {
          if (dataType === 'score') return `${(start / 1_000_000).toFixed(3)}M`;
          if (dataType === 'time') return formatTimeToTimestamp(start);
          // 'rank'
          const end = start + binSize;
          return `${start.toLocaleString()}-${end.toLocaleString()}`;
        })();

        if (selectedStudentId == 'all') {
          if (analysisUnit === 'team' && partyCountView === 'totalCount') {
            const obj: { name: string; [key: string]: number | string } = { name };
            const tcMap = teamCountBins.get(binIndex) ?? new Map<number, number>();
            for (const [tc, count] of tcMap) obj[`tc${tc}`] = count;
            return obj;
          }
          if (analysisUnit === 'team' && partyCountView === 'position') {
            const obj: { name: string; [key: string]: number | string } = { name };
            const posMap = positionBins.get(binIndex) ?? new Map<number, number>();
            for (const [posKey, count] of posMap) obj[`pos${posKey}`] = count;
            return obj;
          }
          return { name, all: starData.count };
        }
        const binObject: { name: string; [key: number]: number } = { name };
        dynamicStarRatings.forEach((star) => {
          binObject[star] = starData[star] || 0;
        });
        return binObject;
      });

    const starGroups: StarGroup[] = layout.map((ids, groupIdx) => ({
      partyIndex: isSplit ? groupIdx : null,
      rows: ids.flatMap((studentId) => {
        const counts = groupCounts[groupIdx].get(studentId) ?? {};
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        if (total === 0) return [];
        return [{ studentId, data: [{ ...counts, name: studentData[studentId]?.Name || `ID: ${studentId}` }], total }];
      }),
    }));

    return {
      histogram: histogramData,
      starGroups,
      starRatings: dynamicStarRatings,
      teamCounts: Array.from(allTeamCounts).sort((a, b) => a - b),
      partyPositions: Array.from(allPositions).sort((a, b) => a - b),
    };
  }, [entries, selectedStudentId, dataType, isTimeViewable, boss, server, id, isDark, analysisUnit, partyCountView, partyLayout, comp.ids]);

  return (
    <div data-component-name="CompositionDetailView" className="w-full mt-2 p-2 sm:p-4 space-y-4">
      {/* <div className="flex justify-between items-center">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="text-xs">
            <span className="font-bold">{t('maxScore')}: </span> {maxDifficulty.toUpperCase()} {maxScore.toLocaleString()}
          </div>
          {minTime !== undefined && (
            <div className="text-xs">
              <span className="font-bold">{t('minTime')}: </span>
              {formatTimeToTimestamp(minTime)}
            </div>
          )}
          <div className="text-xs">
            <span className="font-bold">{t('bestRank')}: </span> {bestRank.toLocaleString()}
          </div>

          <div className="mt-3 flex justify-end">
            <YouTubeSearchGenerator
              raidInfo={raidInfo}
              showType={raidInfo.Type ? true : false}
              partyStudentIds={entries[0].t.map((team) => [...team.m, ...team.s].filter((c): c is NonNullable<typeof c> => !!c?.id).map((c) => c.id))}
            />
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-lg font-bold hover:text-red-500 transition-colors"
        >
          <IoClose />
        </button>
      </div> */}
      <div className="flex justify-between items-start gap-4">
        {/* Left: Main info and YouTube search (cleanly separated with vertical layout) */}
        <div className="flex flex-col gap-3">
          {/* 1. Text information area */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-700 dark:text-neutral-300">
            <div>
              <span className="font-semibold">{t('maxScore')}: </span>
              <span className="font-medium text-blue-600 dark:text-blue-400">{maxDifficulty.toUpperCase()}</span> {maxScore.toLocaleString()}
            </div>
            {minTime !== undefined && (
              <div>
                <span className="font-semibold">{t('minTime')}: </span>
                {formatTimeToTimestamp(minTime)}
              </div>
            )}
            <div>
              <span className="font-semibold">{t('bestRank')}: </span> {bestRank.toLocaleString()}
            </div>
          </div>

          {/* 2. YouTube Search Generator area (placed on a separate line for stability) */}
          {/* 2. YouTube Search Generator area */}
          <div className="flex items-center gap-2">
            {/* Guide text */}
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{t('searchYouTube.title')}:</span>

            {/* YouTube search component */}
            <YouTubeSearchGenerator
              raidInfo={raidInfo}
              showType={raidInfo.Type ? true : false}
              partyStudentIds={entries[0].t.map((team) => [...team.m, ...team.s].filter((c): c is NonNullable<typeof c> => !!c?.id).map((c) => c.id))}
            />
          </div>
        </div>

        {/* Top Right: Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-xl p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-md shrink-0 flex-none"
          aria-label="Close"
        >
          <IoClose />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 p-2 rounded-md bg-neutral-50 dark:bg-neutral-700/50">
        <div>
          <label className="text-xs font-bold">{t('viewByStudent')}</label>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStudentId('all');
              }}
              className={`px-2.5 py-1 text-xs rounded ${selectedStudentId === 'all' ? 'bg-sky-500 text-white font-bold' : 'bg-neutral-200 dark:bg-neutral-600'}`}
            >
              {t_ui('all')}
            </button>
            {uniqueIds.map((sid: number) => (
              <button
                key={sid}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStudentId(sid);
                }}
                className={`w-10 rounded-full transition-all duration-200 ${selectedStudentId === sid ? 'ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-neutral-800' : 'opacity-60 hover:opacity-100'}`}
                title={studentData[sid]?.Name}
              >
                <StudentIcon character={{ id: sid } as Character} student={studentData[sid]} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold">{t('dataType')}</label>
          <div className="flex gap-1 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('rank');
              }}
              className={`px-2 py-0.5 text-xs rounded ${dataType === 'rank' ? 'bg-sky-500 text-white' : 'bg-neutral-200 dark:bg-neutral-600'}`}
            >
              {t('byRank')}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('score');
              }}
              className={`px-2 py-0.5 text-xs rounded ${dataType === 'score' ? 'bg-sky-500 text-white' : 'bg-neutral-200 dark:bg-neutral-600'}`}
            >
              {t('byScore')}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('time');
              }}
              className={`px-2 py-0.5 text-xs rounded disabled:opacity-50 ${dataType === 'time' ? 'bg-sky-500 text-white' : 'bg-neutral-200 dark:bg-neutral-600'}`}
              disabled={!isTimeViewable}
            >
              {t_ui('time')}
            </button>
          </div>
          {!isTimeViewable && <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1.5">{t('timeViewUnavailableNotice')}</div>}
        </div>
      </div>
      {/* Chart Area */}

      <div>
        <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
          <h4 className="font-bold">{dataType === 'score' ? t('scoreDistribution') : dataType === 'time' ? t('timeDistribution') : t('rankDistribution')}</h4>
          {analysisUnit === 'team' && selectedStudentId === 'all' && (
            <div className="flex items-center gap-1 text-xs">
              {(['none', 'totalCount', 'position'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPartyCountView(mode);
                  }}
                  className={`px-2 py-0.5 rounded transition-colors ${partyCountView === mode ? 'bg-sky-500 text-white' : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300'}`}
                >
                  {mode === 'none' ? t_ui('default') : t(mode === 'totalCount' ? 'byTotalPartyCount' : 'byPartyPosition')}
                </button>
              ))}
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={histogram} barGap={0}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis />
            {analysisUnit === 'team' && selectedStudentId === 'all' && partyCountView === 'totalCount' ? (
              teamCounts.map((tc, i) => <Bar key={`tc${tc}`} dataKey={`tc${tc}`} stackId="a" fill={PARTY_COUNT_COLORS[i % PARTY_COUNT_COLORS.length]} isAnimationActive={false} />)
            ) : analysisUnit === 'team' && selectedStudentId === 'all' && partyCountView === 'position' ? (
              partyPositions.map((pos, i) => <Bar key={`pos${pos}`} dataKey={`pos${pos}`} stackId="a" fill={PARTY_COUNT_COLORS[i % PARTY_COUNT_COLORS.length]} isAnimationActive={false} />)
            ) : (
              <>
                {starRatings.map((star) => (
                  <Bar key={star} dataKey={star} stackId="a" fill={getBackgroundRatingColor(star, isDark) || '#ccc'} />
                ))}
                {selectedStudentId === 'all' && <Bar key={'all'} dataKey={'all'} stackId="a" fill={isDark == 'dark' ? '#ccc' : '#777'} />}
              </>
            )}
            <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Party count / position distribution (team mode only, lazy) */}
      {analysisUnit === 'team' && <PartyCountChart data={entries} />}

      {/* Formations containing this party (team mode only) */}
      {analysisUnit === 'team' && <IncludedFormations entries={entries} compKey={comp.ids.join(',')} studentData={studentData} startRank={rankRange?.start ?? 1} maxRank={rankRange?.max ?? 1} />}

      {/* Star Distribution Bar Chart (one block per party when the composition spans several parties) */}
      <div>
        <h4 className="font-bold text-center mb-2">{t_ui('starDistribution')}</h4>
        <div className={starGroups.length > 1 ? 'grid gap-x-6 gap-y-4 md:grid-cols-2' : 'flex flex-col gap-2'}>
          {starGroups.map((group) => {
            const rows = selectedStudentId === 'all' ? group.rows : group.rows.filter((r) => r.studentId === selectedStudentId);
            if (rows.length === 0) return null;
            return (
              <div key={group.partyIndex ?? 'all'} className="flex flex-col gap-2">
                {group.partyIndex !== null && (
                  <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 pb-1">T{group.partyIndex + 1}</div>
                )}
                {rows.map((row) => (
                  <div key={row.studentId} className="relative hover:z-20 flex items-center gap-2">
                    <StarRatingDistributionBarChart studentChartInfo={row} studentId={row.studentId} studentData={studentData} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
