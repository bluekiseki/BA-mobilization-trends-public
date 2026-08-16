// app/components/live/ScoreTimeConverter.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { GameServer, RaidInfo } from '~/types/data';
import { calculateScoreFromTime, calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { calculateTimeExpression } from '~/utils/calculateTimeExpression';
import { getDifficultyFromScoreAndBoss, getDifficultyInfoFromScoreAndBoss, type DifficultyName } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { formatTimeToTimestamp } from '~/utils/time';

interface ScoreTimeConverterProps {
  raidInfo: RaidInfo;
  server: GameServer;
}

type ConversionResult =
  { kind: 'error'; message: string } | { kind: 'score-to-time'; difficulty: DifficultyName; seconds: number } | { kind: 'time-to-score'; rows: { name: DifficultyName; score: number }[] };

export function ScoreTimeConverter({ raidInfo, server }: ScoreTimeConverterProps) {
  const { t } = useTranslation('liveDashboard');
  const [inputValue, setInputValue] = useState('');
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click (same pattern as RecordLookup).
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const result: ConversionResult | null = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return null;

    if (trimmed.includes(':')) {
      // Time -> score(s), one per difficulty since a difficulty picker is out of scope.
      const targetSeconds = calculateTimeExpression(trimmed);
      if (targetSeconds === null) {
        return { kind: 'error', message: t('score_time_converter_error_invalid_time') };
      }
      if (targetSeconds < 0) {
        return { kind: 'error', message: t('score_time_converter_error_negative_time') };
      }

      const difficultyInfo = getDifficultyInfoFromScoreAndBoss(server, raidInfo.Id);
      const rows = difficultyInfo
        .map((d) => ({
          name: d.name,
          score: calculateScoreFromTime(targetSeconds, d.name, raidInfo.Boss, server, raidInfo.Id),
          cut: d.cut,
        }))
        .filter((r): r is { name: DifficultyName; score: number; cut: number } => r.score !== undefined && r.score >= r.cut)
        .map((r) => ({ name: r.name, score: r.score }));

      if (rows.length === 0) {
        return { kind: 'error', message: t('score_time_converter_error_no_valid_score') };
      }
      return { kind: 'time-to-score', rows };
    }

    // Score -> time. Strip thousands separators: comma (1,234,567) or period (1.234.567, European style).
    const numericValue = Number(trimmed.replace(/[.,]/g, ''));
    if (Number.isNaN(numericValue)) {
      return { kind: 'error', message: t('score_time_converter_error_invalid_score') };
    }
    if (numericValue < 0) {
      return { kind: 'error', message: t('score_time_converter_error_negative_score') };
    }

    const difficulty = getDifficultyFromScoreAndBoss(numericValue, server, raidInfo.Id);
    const seconds = calculateTimeFromScore(numericValue, raidInfo.Boss, server, raidInfo.Id);

    if (seconds === undefined) {
      return { kind: 'error', message: t('score_time_converter_error_no_time') };
    }

    return { kind: 'score-to-time', difficulty, seconds };
  }, [inputValue, raidInfo, server, t]);

  return (
    <div ref={containerRef} data-component-name="ScoreTimeConverter" className="relative">
      <div className="flex items-center gap-2 p-2 border rounded-md bg-white dark:bg-neutral-700 dark:border-neutral-600 min-h-[44px]">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsDropdownVisible(true)}
          placeholder={t('score_time_converter_placeholder')}
          className="w-full pl-1 pr-1 py-1 text-base md:text-sm focus:outline-none bg-transparent text-neutral-800 dark:text-neutral-200"
        />
        <FiSearch className="text-neutral-400 dark:text-neutral-500 shrink-0" size={18} />
      </div>

      {isDropdownVisible && result && (
        <div className="absolute w-full mt-1 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 z-20 overflow-hidden text-left">
          {result.kind === 'error' ? (
            <p className="p-3 text-sm text-amber-600 dark:text-amber-400">{result.message}</p>
          ) : result.kind === 'score-to-time' ? (
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: `${DIFFICULTY_COLORS[result.difficulty]}20`, color: DIFFICULTY_COLORS[result.difficulty] }}
              >
                {result.difficulty}
              </span>
              <span className="font-semibold text-neutral-900 dark:text-white ml-2">{formatTimeToTimestamp(result.seconds)}</span>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {result.rows.map((row) => (
                <div key={row.name} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: `${DIFFICULTY_COLORS[row.name]}20`, color: DIFFICULTY_COLORS[row.name] }}>
                    {row.name}
                  </span>
                  <span className="font-semibold text-neutral-900 dark:text-white ml-2">{t('predicted_score', { score: row.score.toLocaleString() })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
