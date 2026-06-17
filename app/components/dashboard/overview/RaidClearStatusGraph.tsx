// app/components/dashboard/RaidClearStatusGraph.tsx

import { useEffect, useMemo, useState } from 'react';
import { getDifficultyFromScoreAndBoss, difficultyInfo, type DifficultyName } from '~/components/raid/Difficulty';
import { calculateScoreFromTime, calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer } from '~/types/data';
import DifficultySettingsPanel, { type DifficultySettings } from './DifficultySettingsPanel';
import { useTranslation } from 'react-i18next';
import type { HistogramDataPoint } from './ScoreHistogram';
import ScoreHistogram from './ScoreHistogram';
import { CustomNumberInput } from '~/components/CustomInput';

interface RaidClearStatusGraphProps {
  scores: Int32Array;
  tierCounter: { [key: string]: number };
  boss: string;
  server: GameServer;
  id: string;
}

const formatTimeFromUnits = (units: number): string => {
  const totalSeconds = units / 100;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(2, '0')}`;
};

// Helper function to find a "nice" clean number for the bin size (e.g., multiples of 6000 for 1 minute, or 1000 for 10s)
const getCleanBinSize = (rawSize: number) => {
  if (rawSize <= 10) return 10; // 0.1s
  if (rawSize <= 20) return 20; // 0.2s
  if (rawSize <= 50) return 50; // 0.5s
  if (rawSize <= 100) return 100; // 1s
  if (rawSize <= 150) return 150; // 1.5s
  if (rawSize <= 200) return 200; // 2s
  if (rawSize <= 300) return 300; // 3s
  if (rawSize <= 400) return 400; // 4s
  if (rawSize <= 500) return 500; // 5s
  if (rawSize <= 1000) return 1000; // 10s
  if (rawSize <= 1500) return 1500; // 15s
  if (rawSize <= 3000) return 3000; // 30s
  if (rawSize <= 6000) return 6000; // 1m
  return Math.ceil(rawSize / 6000) * 6000; // Multiple of minutes
};

const generateDefaultSettings = (): DifficultySettings => {
  const settings = {} as DifficultySettings;
  difficultyInfo.forEach(({ name }) => {
    settings[name] = {
      isVisible: ['Lunatic', 'Torment', 'Insane'].includes(name),
      binSize: 2 * 100,
      timeout: 6 * 60 * 100,
      showTimeout: true,
    };
  });
  return settings;
};

export default function RaidClearStatusGraph({ scores, tierCounter, boss, server, id }: RaidClearStatusGraphProps) {
  const [histogramData, setHistogramData] = useState<HistogramDataPoint[]>([]);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [difficultySettings, setDifficultySettings] = useState<DifficultySettings>(generateDefaultSettings());
  const [rankRange, setRankRange] = useState<{ min: number; max: number | null }>({
    min: 1,
    max: null,
  });
  const { t } = useTranslation('dashboard');

  useEffect(() => {
    if (!scores || scores.length === 0) return;
    setRankRange({ min: 1, max: tierCounter[4] });
  }, [scores, boss, server, id]);

  const timeDataByDifficulty: Record<string, number[]> = useMemo(() => {
    if (!scores || scores.length === 0) return {};
    const dataByDiff: Record<string, number[]> = {};
    for (let rank = 1; rank <= scores.length; rank++) {
      const score = scores[rank - 1];
      if (rankRange.max && rank > rankRange.max) break;

      const difficulty = getDifficultyFromScoreAndBoss(score, server, id);
      const timeInSeconds = calculateTimeFromScore(score, boss, server, id);
      if (timeInSeconds !== undefined) {
        const timeInUnits = Math.round(timeInSeconds * 100);
        if (!dataByDiff[difficulty]) dataByDiff[difficulty] = [];
        dataByDiff[difficulty].push(timeInUnits);
      }
    }
    return dataByDiff;
  }, [scores, boss, server, id, rankRange.max]);

  // Replace the problematic useMemo section with useEffect
  useEffect(() => {
    if (!timeDataByDifficulty || Object.keys(timeDataByDifficulty).length === 0) return;

    const rankRange_max = rankRange.max || 20000;
    const binAllCnt = (window.innerWidth - 50) / 10;
    const itemAllCnt = rankRange_max - rankRange.min + 1;
    let [startRank, endRank] = [1, 1];
    let flag: 'before' | 'do' | 'after' = 'before';

    // console.log('useEffect(() => {', flag);

    // Create a new object based on previous configuration values
    const newSettings = { ...difficultySettings }; // as DifficultySettings;
    let hasChanges = false;

    for (const { name } of difficultyInfo) {
      const diffArray = timeDataByDifficulty[name]?.filter((_v, i) => startRank + i <= rankRange_max) || [];
      if (!diffArray.length && flag != 'before') flag = 'after';
      else flag = 'do';

      // console.log('useEffect(() => {', name, flag, timeDataByDifficulty[name]);
      if (flag) {
        const itemDiffCnt = diffArray.length || 0;
        endRank += itemDiffCnt - 1;
        if (rankRange.max && endRank > rankRange.max) endRank = rankRange.max;
        const dinDiffCnt = (binAllCnt * itemDiffCnt) / itemAllCnt;

        const scoreDiffp9 = diffArray[parseInt(String(itemDiffCnt * 0.9))];
        const scoreDiffp0 = diffArray[0];
        const scoreDiffRange = (scoreDiffp9 - scoreDiffp0) / 0.9;

        const calculatedBinSize = scoreDiffRange / dinDiffCnt;
        const calculatedTimeout = scoreDiffp0 + scoreDiffRange;
        const rawBinSize = scoreDiffRange / dinDiffCnt;
        const cleanBinSize = getCleanBinSize(rawBinSize);

        // Execute update logic only when values differ from existing ones
        if (newSettings[name]?.binSize !== calculatedBinSize || newSettings[name]?.timeout !== calculatedTimeout) {
          newSettings[name] = {
            ...newSettings[name], // Settings to maintain (e.g., isVisible)
            binSize: cleanBinSize || 200, // Guard against NaN/Infinity
            timeout: scoreDiffp0 + scoreDiffRange,
            showTimeout: true,
          };
          hasChanges = true;
        }

        if (endRank === rankRange.max) flag = 'after';
        startRank = endRank = endRank + 1;
      } else {
        if (newSettings[name]?.binSize !== 200 || newSettings[name]?.timeout !== 36000) {
          newSettings[name] = {
            ...newSettings[name],
            binSize: 200,
            timeout: 36000,
            showTimeout: true,
          };
          hasChanges = true;
        }
      }
    }

    // Prevent unnecessary re-renders and infinite loops by updating state only when there are actual changes
    if (hasChanges) {
      setDifficultySettings(newSettings);
    }
  }, [timeDataByDifficulty, rankRange.min, rankRange.max]); // Remove difficultySettings from the dependency array

  useEffect(() => {
    if (!scores || scores.length === 0) return;

    const newHistogramData: HistogramDataPoint[] = [];
    let cumulativeRankCounter = 0;
    for (const diffInfo of difficultyInfo) {
      const diffName = diffInfo.name;
      const settings = difficultySettings[diffName];
      const times = timeDataByDifficulty[diffName];

      if (!settings || !settings.isVisible || !timeDataByDifficulty[diffName]) {
        cumulativeRankCounter += (times && times.length) || 0;
        continue;
      }

      const bins: Map<string, number> = new Map();
      const binMinTime: Map<string, number> = new Map();

      for (let i = 0; i < settings.timeout; i += settings.binSize) {
        const bucketName = `${formatTimeFromUnits(i)}-${formatTimeFromUnits(i + settings.binSize)}`;
        bins.set(bucketName, 0);
        binMinTime.set(bucketName, 0);
      }

      if (settings.showTimeout) {
        bins.set(`>${formatTimeFromUnits(settings.timeout)}`, 0);
      }

      for (const time of times) {
        if (time >= settings.timeout) {
          if (settings.showTimeout) {
            const bucketName = `>${formatTimeFromUnits(settings.timeout)}`;
            bins.set(bucketName, (bins.get(bucketName) || 0) + 1);
            binMinTime.set(bucketName, Math.max(binMinTime.get(bucketName) || 0, time));
          }
        } else {
          const bucketIndex = Math.floor(time / settings.binSize);
          const start = bucketIndex * settings.binSize;
          const end = start + settings.binSize;
          const bucketName = `${formatTimeFromUnits(start)}-${formatTimeFromUnits(end)}`;
          bins.set(bucketName, (bins.get(bucketName) || 0) + 1);
          binMinTime.set(bucketName, Math.max(binMinTime.get(bucketName) || 0, time));
        }
      }

      const entries = Array.from(bins.entries());
      let firstNonZeroIndex = -1;
      let lastNonZeroIndex = -1;

      entries.forEach(([, count], index) => {
        if (count > 0) {
          if (firstNonZeroIndex === -1) {
            firstNonZeroIndex = index;
          }
          lastNonZeroIndex = index;
        }
      });

      let finalEntries: [string, number][] = [];
      if (firstNonZeroIndex !== -1) {
        finalEntries = entries.slice(firstNonZeroIndex, lastNonZeroIndex + 1);
      }

      let binFlag = false;
      finalEntries.forEach(([bucketName, count]) => {
        if (count > 0) {
          cumulativeRankCounter += count;
        }

        if (rankRange.min > cumulativeRankCounter) return;
        if (binFlag) return;
        if ((rankRange.max ? rankRange.max : Infinity) < cumulativeRankCounter) {
          binFlag = true;
        }

        newHistogramData.push({
          uniqueName: `${diffName}|${bucketName}`,
          name: bucketName,
          count: count,
          minTime: binMinTime.get(bucketName) || null,
          difficulty: diffName,
          cumulativeCount: cumulativeRankCounter,
        });
      });
    }
    setHistogramData(newHistogramData);
  }, [scores, difficultySettings, rankRange, boss, server, id, timeDataByDifficulty]);

  const handleRankChange = (type: 'min' | 'max', value: number) => {
    const numValue = value || 0;
    setRankRange((prev) => ({ ...prev, [type]: numValue }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold"></div>
        {/* Setting Panel toggle button */}
        <button onClick={() => setIsSettingsVisible(!isSettingsVisible)} className="text-sm px-3 py-1 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600">
          {t('clearTime')} {isSettingsVisible ? t('hideSettings') : t('showSettings')}
        </button>
      </div>

      <div>
        <h3 className="text-xl font-bold text-center mb-2">{t('clearTimeDistribution')}</h3>
        {histogramData.length > 0 ? (
          <ScoreHistogram data={histogramData} calculateScoreFromTime={(s: number, d: DifficultyName) => calculateScoreFromTime(s, d, boss, server, id) || 0} />
        ) : (
          <div className="text-center text-neutral-500 py-10">{t('noData')}</div>
        )}
      </div>

      {isSettingsVisible && (
        <div className="space-y-4">
          <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border dark:border-neutral-700">
            <h3 className="font-bold mb-2 text-center">{t('rankRangeSettings')}</h3>
            <div className="flex items-center justify-center gap-2">
              <CustomNumberInput
                // type="number"
                value={rankRange.min}
                onChange={(e) => handleRankChange('min', e || 0)}
                className="w-24 p-1 text-center bg-transparent border dark:border-neutral-600 rounded-md"
                placeholder={t('minRankPlaceholder')}
              />
              <span className="font-bold">~</span>
              <CustomNumberInput
                // type="number"
                value={rankRange.max || Infinity}
                onChange={(e) => handleRankChange('max', e || 0)}
                className="w-24 p-1 text-center bg-transparent border dark:border-neutral-600 rounded-md"
                placeholder={t('maxRankPlaceholder')}
              />
            </div>
          </div>
          <DifficultySettingsPanel settings={difficultySettings} onChange={setDifficultySettings} />
        </div>
      )}
    </div>
  );
}
