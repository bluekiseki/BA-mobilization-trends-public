// app/utils/chartDataProcessor.ts

import { raidToString } from '../../../components/raid/raidToString';
import { difficultyInfo } from '~/utils/difficultyPolicy';
import type { DifficultyName, DifficultySelect } from '~/utils/difficultyPolicy';
import type { ChartData, GameServer, RaidInfoFiltered } from '~/types/data';
import { column, parseTable, type ColumnTable } from '../../../utils/columnTable';
import type { fetchCacheProcessor } from '../../../hooks/cache';
import type { Locale } from '../../../utils/i18n/config';
import { cdn } from '../../../utils/cdn';
import { getCombatStyleGroupRosterIds } from '../../../utils/combatStyle';

export interface ProcessChartDataParams {
  rankWidth: number;
  hideXThreshold: number;
  xRange: [number, number];
  heatmapMode: 'absolute' | 'percent';
  histogramMode: 'absolute' | 'percent';
  selectedDifficulties: Set<string>;
  xLabels: RaidInfoFiltered[];
  /** Per-student tables (one per outfit when combined). Columns: x (season), y (rank), z (grade), d (difficulty index) */
  tables: ColumnTable[];
  locale: Locale;
}

export interface ProcessChartDataResult {
  chartDataByZ: Map<number, ChartData>;
  availableZValueCounter: Map<number, number>;
  fullXRange: [number, number];
}

function getAllCountOfHistogramclass(raindInfo: RaidInfoFiltered, difficulty: DifficultySelect, rankStart: number, rankEnd: number, rankWidth: number) {
  if (!raindInfo) {
    console.error('raindInfo is none', raindInfo);
    throw new Error('raindInfo is none');
  }
  if (difficulty == 'All') {
    if (rankEnd > raindInfo.Cnt.All) {
      return raindInfo.Cnt.All - rankStart + 1;
    }
    return rankWidth;
  }

  if (!(difficulty in raindInfo.Cnt)) {
    return rankWidth;
  }
  if (!raindInfo.Cnt[difficulty]) {
    return rankWidth;
  }
  if (rankStart > rankEnd) throw new Error('rankStart > rankEnd');
  let cnt = 0;

  for (const { name } of difficultyInfo) {
    if (!(name in raindInfo.Cnt)) continue;
    const difficulty_cnt = cnt + (raindInfo.Cnt[name] || 0);

    if (difficulty == name) {
      // rank in 4000 - 5000
      if (rankStart < cnt) {
        // cnt = 4500 or 5500
        if (rankEnd < cnt) continue; // cnt = 5500
        if (rankEnd <= difficulty_cnt)
          return rankEnd - cnt; // cnt = 4500,  dcnt=5500
        // else return rankWidth
        else return raindInfo.Cnt[name] || 0; // cnt = 4500, dcnt = 4800
      } else if (rankStart <= difficulty_cnt) {
        // cnt = 2500, dcnt = 4500, 5500
        if (rankEnd <= difficulty_cnt)
          return rankWidth; // dcnt = 5500
        else return difficulty_cnt - rankStart + 1; // dcnt = 4500
      } else continue; // cnt = 2500, dcnt = 3500
    }

    cnt = difficulty_cnt;
  }
  return 0;
}

function getSelectedCountOfHistogramClass(raidInfo: RaidInfoFiltered, difficulties: ReadonlySet<string>, rankStart: number, rankEnd: number, rankWidth: number) {
  return Array.from(difficulties).reduce((count, difficulty) => {
    if (!(difficulty in raidInfo.Cnt)) return count;
    return count + getAllCountOfHistogramclass(raidInfo, difficulty as DifficultySelect, rankStart, rankEnd, rankWidth);
  }, 0);
}

export const getStudentTable = (server: GameServer, selectedStudentId: number | null, fetchAndProcessWithCache: fetchCacheProcessor<ColumnTable>) =>
  fetchAndProcessWithCache(cdn(`/w/v2/map/${server}/${selectedStudentId}.bin`), async (res) => parseTable(await res.arrayBuffer()));

export const getStudentTablesForCombatStyleView = async (
  server: GameServer,
  selectedStudentId: number | null,
  viewMode: 'separate' | 'combined',
  fetchAndProcessWithCache: fetchCacheProcessor<ColumnTable>,
) => {
  const groupIds = viewMode === 'combined' ? getCombatStyleGroupRosterIds(selectedStudentId ?? 0) : [selectedStudentId];
  return Promise.all(groupIds.map((id) => getStudentTable(server, id, fetchAndProcessWithCache)));
};

/**
 * Calculate chart data
 */
export const processChartData = ({ rankWidth, hideXThreshold, xRange, heatmapMode, histogramMode, selectedDifficulties, xLabels, tables, locale }: ProcessChartDataParams): ProcessChartDataResult => {
  // Season x -> position in xLabels, -1 when the season is not listed
  let maxSeason = 0;
  for (const v of xLabels) maxSeason = Math.max(maxSeason, v.index);
  const xPos = new Int32Array(maxSeason + 1).fill(-1);
  xLabels.forEach((v, i) => {
    if (xPos[v.index] < 0) xPos[v.index] = i;
  });

  const difficultiesToInclude = selectedDifficulties.has('All') ? new Set(difficultyInfo.filter((d) => d.name !== 'Extreme').map((d) => d.name)) : selectedDifficulties;
  const includeDifficulty = new Uint8Array(256);
  difficultyInfo.forEach((d, i) => {
    if (difficultiesToInclude.has(d.name)) includeDifficulty[i] = 1;
  });

  // 1st pass: find the unfiltered ranges (fullXRange, z values) and the number of rank bins
  const zSeen = new Set<number>();
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const table of tables) {
    const tx = column(table, 'x'),
      ty = column(table, 'y'),
      tz = column(table, 'z');
    for (let i = 0; i < table.rows; i++) {
      const sx = tx[i];
      if (sx > maxSeason || xPos[sx] < 0) continue;
      const x = xPos[sx];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (ty[i] > maxY) maxY = ty[i];
      zSeen.add(tz[i]);
    }
  }
  const zValues = [...zSeen].sort((a, b) => a - b);
  const hasData = minX !== Infinity;
  const fullXRange: [number, number] = [hasData ? minX : 0, Math.max(maxX, 0)];
  maxX = Math.max(maxX, 0);
  const nx = maxX + 1;
  const nb = hasData ? Math.floor((maxY - 1) / rankWidth) + 1 : 0;

  // 2nd pass: counts per [x][bin], in total and per z
  const total = new Int32Array(nx * nb);
  const countByZ = new Map<number, Int32Array>(zValues.map((z) => [z, new Int32Array(nx * nb)]));
  for (const table of tables) {
    const tx = column(table, 'x'),
      ty = column(table, 'y'),
      tz = column(table, 'z'),
      td = column(table, 'd');
    for (let i = 0; i < table.rows; i++) {
      const sx = tx[i];
      if (sx > maxSeason || xPos[sx] < 0) continue;
      const x = xPos[sx];
      if (!includeDifficulty[td[i]] || x < xRange[0] || x > xRange[1]) continue;
      const cell = x * nb + Math.floor((ty[i] - 1) / rankWidth);
      total[cell]++;
      const zCount = countByZ.get(tz[i]);
      if (zCount) zCount[cell]++;
    }
  }

  const xOverTotals = new Float64Array(nx);
  const yOverTotals = new Float64Array(nb);
  for (let x = 0; x < nx; x++) {
    for (let b = 0; b < nb; b++) {
      const n = total[x * nb + b];
      xOverTotals[x] += n;
      yOverTotals[b] += n;
    }
  }

  const allX: number[] = [];
  for (let x = 0; x < nx; x++) {
    if (xOverTotals[x] >= hideXThreshold && x >= xRange[0] && x <= xRange[1]) allX.push(x);
  }
  const allBins: number[] = []; // Higher rank bins on top
  for (let b = nb - 1; b >= 0; b--) {
    if (yOverTotals[b] > 0) allBins.push(b);
  }
  const allYPrime = allBins.map((b) => `${b * rankWidth + 1}-${(b + 1) * rankWidth}`);

  const allXLabels = allX.map((x) => raidToString(xLabels[x], locale, false, false, false, true));
  const allXLabels_show = allX.map((x) => raidToString(xLabels[x], locale, true, true) || x.toString());

  const zValueCounter = new Map<number, number>();
  const finalDataByZ = new Map<number, ChartData>();

  for (const z of zValues) {
    const zCount = countByZ.get(z);
    if (!zCount) continue;
    const xTotals = new Float64Array(nx);
    const yTotals = new Float64Array(nb);
    for (let x = 0; x < nx; x++) {
      for (let b = 0; b < nb; b++) {
        const n = zCount[x * nb + b];
        xTotals[x] += n;
        yTotals[b] += n;
      }
    }
    const inAllX = allX.reduce((sum, x) => sum + xTotals[x], 0);
    if (inAllX > 0) zValueCounter.set(z, inAllX);

    const heatmapZ: (number | null)[][] = allBins.map((b) =>
      allX.map((x) => {
        const totalW = total[x * nb + b];
        if (totalW === 0) return null;
        const wSum = zCount[x * nb + b];
        if (heatmapMode === 'percent') return (wSum / totalW) * 100;
        const rankStart = b * rankWidth + 1;
        const rankEnd = (b + 1) * rankWidth;
        const count = getSelectedCountOfHistogramClass(xLabels[x], difficultiesToInclude, rankStart, rankEnd, rankWidth);
        if (wSum / count > 2) {
          console.log('error, a/b>2', x, xLabels[x].Alias, [wSum, count], [rankStart, rankEnd], xLabels[x].Cnt, difficultiesToInclude, xLabels[x]);
        }
        return (100 * wSum) / count;
      }),
    );

    const topBarValues = allX.map((x) => {
      const numerator = xTotals[x];
      if (histogramMode === 'percent') {
        const denominator = xOverTotals[x] || 1;
        return (numerator / denominator) * 100;
      }
      const count = Array.from(difficultiesToInclude).reduce((sum, difficulty) => sum + (xLabels[x].Cnt[difficulty as DifficultyName] || 0), 0);
      return count > 0 ? (100 * numerator) / count : 0;
    });

    const rightBarValues = allBins.map((b) => {
      const numerator = yTotals[b];
      if (histogramMode === 'percent') {
        const denominator = yOverTotals[b] || 1;
        return (numerator / denominator) * 100;
      }
      return numerator;
    });

    finalDataByZ.set(z, {
      heatmap: {
        x: allXLabels,
        y: allYPrime,
        z: heatmapZ,
        x_show: allXLabels_show,
      },
      topBar: { x: allXLabels, values: topBarValues },
      rightBar: { y: allYPrime, values: rightBarValues },
    });
  }

  return {
    chartDataByZ: finalDataByZ,
    availableZValueCounter: zValueCounter,
    fullXRange,
  };
};
