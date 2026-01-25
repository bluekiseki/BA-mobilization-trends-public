// app/components/dashboard/RaidClearStatusGraph.tsx

import { useEffect, useState } from 'react';
import { getDifficultyFromScoreAndBoss, difficultyInfo } from '~/components/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer } from '~/types/data';
import DifficultySettingsPanel, { type DifficultySettings } from './DifficultySettingsPanel';
import { useTranslation } from 'react-i18next';
import type { HistogramDataPoint } from './ScoreHistogram';
import ScoreHistogram from './ScoreHistogram';

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
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  const [difficultySettings, setDifficultySettings] = useState<DifficultySettings>(generateDefaultSettings());
  const [histogramData, setHistogramData] = useState<HistogramDataPoint[]>([]);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [rankRange, setRankRange] = useState<{ min: 1; max: number | null }>({
    min: 1,
    max: null,
  });
  const { t } = useTranslation('dashboard');

  useEffect(() => {
    if (!scores || scores.length === 0) return;

    setRankRange({ min: 1, max: tierCounter[4] });
  }, [scores, boss, server, id]);

  useEffect(() => {
    if (!scores || scores.length === 0) return;

    const timeDataByDifficulty: Record<string, number[]> = {};
    for (const score of scores) {
      const difficulty = getDifficultyFromScoreAndBoss(score, server, id);
      const timeInSeconds = calculateTimeFromScore(score, boss, server, id);
      if (timeInSeconds !== undefined) {
        const timeInUnits = Math.round(timeInSeconds * 100); // Converts seconds to 10ms
        if (!timeDataByDifficulty[difficulty]) timeDataByDifficulty[difficulty] = [];
        timeDataByDifficulty[difficulty].push(timeInUnits);
      }
    }

    const newHistogramData: HistogramDataPoint[] = [];
    let cumulativeRankCounter = 0;
    for (const diffInfo of difficultyInfo) {
      const diffName = diffInfo.name;
      const settings = difficultySettings[diffName];
      const times = timeDataByDifficulty[diffName];

      if (!settings.isVisible || !timeDataByDifficulty[diffName]) {
        cumulativeRankCounter += (times && times.length) || 0;
        continue;
      }

      const bins: Map<string, number> = new Map();

      for (let i = 0; i < settings.timeout; i += settings.binSize) {
        const bucketName = `${formatTimeFromUnits(i)}-${formatTimeFromUnits(i + settings.binSize)}`;
        bins.set(bucketName, 0);
      }

      if (settings.showTimeout) {
        bins.set(`>${formatTimeFromUnits(settings.timeout)}`, 0);
      }

      // Filling user data into the initialized bins
      for (const time of times) {
        if (time >= settings.timeout) {
          if (settings.showTimeout) {
            const bucketName = `>${formatTimeFromUnits(settings.timeout)}`;
            bins.set(bucketName, (bins.get(bucketName) || 0) + 1);
          }
        } else {
          const bucketIndex = Math.floor(time / settings.binSize);
          const start = bucketIndex * settings.binSize;
          const end = start + settings.binSize;
          const bucketName = `${formatTimeFromUnits(start)}-${formatTimeFromUnits(end)}`;
          bins.set(bucketName, (bins.get(bucketName) || 0) + 1);
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
          // Calculate cumulative rank only for sections
          cumulativeRankCounter += count;
        }

        if (rankRange.min > cumulativeRankCounter) return;
        if (binFlag) return;
        if ((rankRange.max ? rankRange.max : Infinity) < cumulativeRankCounter) {
          binFlag = true;
        }

        newHistogramData.push({
          uniqueName: `${diffName}|${bucketName}`,
          name: bucketName, // Name for display and tooltip
          count: count,
          difficulty: diffName,
          cumulativeCount: cumulativeRankCounter,
        });
      });
    }
    setHistogramData(newHistogramData);
  }, [scores, difficultySettings, rankRange, boss, server, id]);

  const handleRankChange = (type: 'min' | 'max', value: string) => {
    const numValue = parseInt(value) || 0;
    setRankRange((prev) => ({ ...prev, [type]: numValue }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold"></div>
        {/* Setting Panel toggle button */}
        <button onClick={() => setIsSettingsVisible(!isSettingsVisible)} className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600">
          {t('clearTime')} {isSettingsVisible ? t('hideSettings') : t('showSettings')}
        </button>
      </div>

      <div>
        <h3 className="text-xl font-bold text-center mb-2">{t('clearTimeDistribution')}</h3>
        {histogramData.length > 0 ? <ScoreHistogram data={histogramData} /> : <div className="text-center text-gray-500 py-10">{t('noData')}</div>}
      </div>

      {isSettingsVisible && (
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-neutral-800/50 p-3 rounded-lg border dark:border-neutral-700">
            <h3 className="font-bold mb-2 text-center">{t('rankRangeSettings')}</h3>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                value={rankRange.min}
                onChange={(e) => handleRankChange('min', e.target.value)}
                className="w-24 p-1 text-center bg-transparent border dark:border-neutral-600 rounded-md"
                placeholder={t('minRankPlaceholder')}
              />
              <span className="font-bold">~</span>
              <input
                type="number"
                value={rankRange.max || Infinity}
                onChange={(e) => handleRankChange('max', e.target.value)}
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
