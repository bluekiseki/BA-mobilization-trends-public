// app/utils/chartDataProcessor.ts

import { raidToString } from '../components/raidToString';
import { difficultyInfo } from '../components/Difficulty';
import type { DifficultySelect } from '../components/Difficulty';
import type { BinnedDataRow, ChartData, GameServer, RaidInfoFiltered, RawDataRow } from '~/types/data';
import { tsvParseRows } from 'd3-dsv';
import type { fetchCacheProcessor } from './cache';
import type { Locale } from './i18n/config';
import { cdn } from './cdn';

export interface ProcessChartDataParams {
  rankWidth: number;
  hideXThreshold: number;
  xRange: [number, number];
  heatmapMode: 'absolute' | 'percent';
  histogramMode: 'absolute' | 'percent';
  difficulty: DifficultySelect;
  xLabels: RaidInfoFiltered[];
  rawTsvData: RawDataRow[];
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
    throw 'raindInfo is none';
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
  if (rankStart > rankEnd) throw 'rankStart > rankEnd';
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

export const getRawTsvData = async (server: GameServer, selectedStudentId: number | null, fetchAndProcessWithCache: fetchCacheProcessor<string>) => {
  const mainDataUrl = cdn(`/w/map/${server}/${selectedStudentId}.bin`);

  const mainDataText = await fetchAndProcessWithCache(mainDataUrl, (res) => res.text());
  // console.log('mainDataText',{mainDataText})
  const rawTsvData: RawDataRow[] = tsvParseRows(
    mainDataText,
    (row): RawDataRow => ({
      x: +row[0],
      y: +row[1],
      z: +row[2],
      w: +row[3],
      difficulty: difficultyInfo[+row[4]].name,
    }),
  );
  return rawTsvData;
};

/**
 * Calculate chart data
 */
export const processChartData = async ({
  rankWidth,
  hideXThreshold,
  xRange,
  heatmapMode,
  histogramMode,
  difficulty: selectedDifficulty,
  xLabels,
  rawTsvData,
  locale,
}: ProcessChartDataParams): Promise<ProcessChartDataResult> => {
  const newXlabelIndexMap = xLabels.map((v) => v.index);

  const rawData = rawTsvData;
  const binnedRawData: BinnedDataRow[] = rawData
    .filter((row) => {
      return newXlabelIndexMap.includes(row.x);
    })
    .map((row) => {
      const x = newXlabelIndexMap.indexOf(row.x);
      const { y, z, w, difficulty } = row;
      const bin = Math.floor((row.y - 1) / rankWidth);
      const y_prime = `${bin * rankWidth + 1}-${(bin + 1) * rankWidth}`;
      return { x, y, z, w, y_prime, difficulty };
    });

  const finalDataByZ = new Map<number, ChartData>();
  const zValues = [...new Set(binnedRawData.map((d) => d.z))].sort((a, b) => a - b);

  const allXBase = [...new Set(binnedRawData.map((d) => d.x))].sort((a, b) => a - b);

  const minX = allXBase.length > 0 ? Math.min(...allXBase) : 0;
  const maxX = allXBase.length > 0 ? Math.max(...allXBase, 0) : 150;
  const fullXRange: [number, number] = [minX, maxX];

  // 1st filtering
  const binnedData = binnedRawData
    .filter(({ difficulty }) => {
      if (selectedDifficulty == 'All') return true;
      return selectedDifficulty == difficulty;
    })
    .filter(({ x }) => x >= xRange[0] && x <= xRange[1]);

  const rawXTotals = new Map<number, number>();
  binnedData.forEach(({ x }) => {
    rawXTotals.set(x, (rawXTotals.get(x) || 0) + 1 /*w*/);
  });

  const allPossibleX = [...Array(maxX + 1).keys()];
  const allX = allPossibleX
    // .filter(x => (rawXTotals.get(x) || 0) >= hideXThreshold * (xLabels[x].MaxLv || 1))
    .filter((x) => (rawXTotals.get(x) || 0) >= hideXThreshold)
    .filter((x) => x >= xRange[0] && x <= xRange[1]);

  const allYPrime = [...new Set(binnedData.map((d) => d.y_prime))]
    .sort((a, b) => {
      return parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]);
    })
    .reverse();

  // const allXLabels = allX.map(x => raidToString(xLabels[x], locale, false, true) || x.toString());
  const allXLabels = allX.map((x) => raidToString(xLabels[x], locale, false, false, false, true));
  const allXLabels_show = allX.map((x) => raidToString(xLabels[x], locale, true, true) || x.toString());

  const totalWMap = new Map<string, number>();
  binnedData.forEach(({ x, y_prime }) => {
    const key = `${x}|${y_prime}`;
    totalWMap.set(key, (totalWMap.get(key) || 0) + 1 /*w*/);
  });

  const xOverTotals = new Map<number, number>();
  const yOverTotals = new Map<string, number>();
  binnedData.forEach(({ x, y_prime }) => {
    // const w_normalized = (xLabels[x].MaxLv > 0) ? w / xLabels[x].MaxLv : 0;
    const w_normalized = 1; /*w*/
    xOverTotals.set(x, (xOverTotals.get(x) || 0) + w_normalized);
    yOverTotals.set(y_prime, (yOverTotals.get(y_prime) || 0) + w_normalized);
  });

  const zValueCounter = binnedData
    .filter((d) => allX.includes(d.x))
    .map((d) => d.z)
    .reduce((acc, z) => {
      acc.set(z, (acc.get(z) || 0) + 1);
      return acc;
    }, new Map<number, number>());

  for (const z of zValues) {
    const subset = binnedData.filter((d) => d.z === z);
    const wSumMap = new Map<string, number>();
    subset.forEach(({ x, y_prime }) => {
      const key = `${x}|${y_prime}`;
      wSumMap.set(key, (wSumMap.get(key) || 0) + 1 /*w*/);
    });

    const heatmapZ: (number | null)[][] = allYPrime.map((y_prime) =>
      allX.map((x) => {
        const key = `${x}|${y_prime}`;
        if (!totalWMap.has(key)) return null;
        const wSum = wSumMap.get(key) || 0;
        if (heatmapMode === 'percent') {
          const totalW = totalWMap.get(key) || 1;
          return totalW > 0 ? (wSum / totalW) * 100 : 0;
        } else {
          const [rankStart, rankEnd] = y_prime.split('-').map((v) => parseInt(v));
          // return (xLabels[x].MaxLv > 0) ? wSum / getAllCountOfHistogramclass(
          const count = getAllCountOfHistogramclass(xLabels[x], selectedDifficulty, rankStart, rankEnd, rankWidth);
          if (wSum / count > 2) {
            console.log('error, a/b>2', x, xLabels[x].Alias, [wSum, count], [rankStart, rankEnd], xLabels[x].Cnt, selectedDifficulty, xLabels[x]);
            // throw "error, a/b>2"
          }
          return (100 * wSum) / count;
          // xLabels[x].MaxLv Cancel -> Unfamiliar Statistics
        }
      }),
    );

    const xTotals = new Map<number, number>();
    const yTotals = new Map<string, number>();
    subset.forEach(({ x, y_prime }) => {
      // const w_normalized = (xLabels[x].MaxLv > 0) ? w / xLabels[x].MaxLv : 0;
      const w_normalized = 1; /*w*/
      xTotals.set(x, (xTotals.get(x) || 0) + w_normalized);
      yTotals.set(y_prime, (yTotals.get(y_prime) || 0) + w_normalized);
    });

    const topBarValues = allX.map((x) => {
      const numerator = xTotals.get(x) || 0;
      if (histogramMode === 'percent') {
        const denominator = xOverTotals.get(x) || 1;
        return denominator > 0 ? (numerator / denominator) * 100 : 0;
      } else {
        // if (x < 10) return numerator / 15000;
        // else return numerator / 20000
        if (selectedDifficulty == 'All') return (100 * numerator) / xLabels[x].Cnt.All;
        return (100 * numerator) / (xLabels[x].Cnt[selectedDifficulty] || xLabels[x].Cnt.All);
      }
    });

    const rightBarValues = allYPrime.map((y) => {
      const numerator = yTotals.get(y) || 0;
      if (histogramMode === 'percent') {
        const denominator = yOverTotals.get(y) || 1;
        return denominator > 0 ? (numerator / denominator) * 100 : 0;
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
    // availableZValues:new Set(zValues),
    availableZValueCounter: zValueCounter,
    fullXRange,
  };
};
