// app/components/dashboard/RecordLookup.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimeToTimestamp } from '~/utils/time';
import { getDifficultyFromScoreAndBoss, type DifficultyName, getBracketFromTotalScore, getBracketColorFromTotalScore, getDifficultyInfoFromScoreAndBoss } from '~/components/raid/Difficulty';
import type { GameServer, RaidInfo } from '~/types/data';
import { calculateScoreFromTime, calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { calculateTimeExpression } from '~/utils/calculateTimeExpression';
import { FiSearch } from 'react-icons/fi';
import type { TFunction } from 'i18next';

interface RecordLookupProps {
  scores: Int32Array;
  raidInfo: RaidInfo;
  server: GameServer;
  isTotalChart: boolean;
}
type SearchResultType = 'theoretical' | 'closest' | 'totalSum' | 'exactRank' | 'scoreConversion';

interface SearchResult {
  type: SearchResultType;
  label: string;
  rank?: number;
  score?: number;
  time?: string;
  difficulty?: string;
  bracket?: string;
}

const getDifficultyName = (score: number, server: GameServer, id: string): DifficultyName => getDifficultyFromScoreAndBoss(score, server, id) || 'Unknown';

// --- 1. Search Results Card Components
const SearchResultCard: React.FC<{
  result: SearchResult;
  isTotalChart: boolean;
  // t: TFunction<'dashboard'>;
}> = React.memo(({ result, isTotalChart }) => {
  const color = isTotalChart ? getBracketColorFromTotalScore(result.score || 0) : result.difficulty ? DIFFICULTY_COLORS[result.difficulty] || '#9ca3af' : '#9ca3af';

  const contextText = isTotalChart ? result.bracket : result.difficulty;
  const isConversion = result.type === 'theoretical' || result.type === 'scoreConversion';
  const isTimeInput = result.type === 'theoretical';

  return (
    <div className="px-2 py-1.5 border-b dark:border-neutral-700 last:border-b-0">
      {isConversion ? (
        <div className="flex items-center justify-between text-sm">
          {contextText && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: `${color}20`, color: color }}>
              {contextText}
            </span>
          )}
          <span className="font-semibold text-black dark:text-white ml-2">{isTimeInput ? `${result.score?.toLocaleString()} pt` : result.time || 'N/A'}</span>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="font-semibold text-xs" style={{ color: color }}>
              {result.label}
            </p>
            {contextText && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}20`, color: color }}>
                {contextText}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between text-black dark:text-white">
            <span className="text-sm font-medium">#{result.rank?.toLocaleString() || 'N/A'}</span>
            {!isTotalChart && <span className="text-xs mx-2">{result.time || 'N/A'}</span>}
            <span className="text-base font-bold ml-auto">{result.score?.toLocaleString()} pt</span>
          </div>
        </div>
      )}
    </div>
  );
});
SearchResultCard.displayName = 'SearchResultCard';

interface UseRecordSearchProps {
  searchTerm: string;
  scores: Int32Array;
  activeFilters: Set<string>;
  availableDifficultyOrder: DifficultyName[];
  isTotalChart: boolean;
  raidInfo: RaidInfo;
  server: GameServer;
  // t: (key: string, options?: any) => string;
  t: TFunction<'dashboard'>;
}

const useRecordSearch = (props: UseRecordSearchProps): SearchResult[] => {
  const { searchTerm, scores, activeFilters, availableDifficultyOrder, isTotalChart, raidInfo, server, t } = props;

  const createRecord = (rank: number, score: number, type: SearchResultType, label: string, context: string): SearchResult => {
    return {
      type,
      label,
      rank,
      score,
      time: isTotalChart ? undefined : formatTimeToTimestamp(calculateTimeFromScore(score, raidInfo.Boss, server, raidInfo.Id) || 0),
      difficulty: isTotalChart ? undefined : context /* as DifficultyName*/, // context is DifficultyName
      bracket: isTotalChart ? context : undefined, // context is BracketName
    };
  };

  return useMemo((): SearchResult[] => {
    const difficultyInfo = getDifficultyInfoFromScoreAndBoss(props.server, props.raidInfo.Id);
    const results: SearchResult[] = [];
    if (!searchTerm.trim() || scores.length === 0) return results;

    const difficultiesToSearch = activeFilters.size > 0 ? [...activeFilters] : availableDifficultyOrder;

    if (isTotalChart && /[\s+]+/.test(searchTerm)) {
      const numbers = searchTerm
        .split(/[\s+]+/)
        .map(Number)
        .filter(Boolean);
      const sum = numbers.reduce((a, b) => a + b, 0);
      if (sum === 0) return [];

      let closestScore = scores[0];
      let closestRank = 1;
      let minDiff = Math.abs(scores[0] - sum);

      for (let i = 1; i < scores.length; i++) {
        const diff = Math.abs(scores[i] - sum);
        if (diff < minDiff) {
          minDiff = diff;
          closestScore = scores[i];
          closestRank = i + 1;
        }
      }
      results.push(createRecord(closestRank, closestScore, 'totalSum', t('totalScoreSum'), getBracketFromTotalScore(closestScore)));
      return results;
    }

    if (!isTotalChart && searchTerm.includes(':')) {
      const targetSeconds = calculateTimeExpression(searchTerm);
      if (targetSeconds === null) return [];

      let theoreticalScore: number | null = null;
      for (const diff of difficultiesToSearch) {
        const score = calculateScoreFromTime(targetSeconds, diff as DifficultyName, raidInfo.Boss, server, raidInfo.Id);
        if (score) {
          if (theoreticalScore === null || score > theoreticalScore) {
            theoreticalScore = score;
          }
          results.push({
            type: 'theoretical',
            label: `${diff} - ${t('theoreticalScore')}`,
            score: score,
            time: searchTerm,
            difficulty: diff,
          });
        }
      }

      if (theoreticalScore === null) return results;

      let bestRankRecord: SearchResult | null = null;
      let lastWorstRank = -1,
        lastWorstScore = -1;
      let lastWorstDifficulty: DifficultyName = 'Normal';

      let diffInfoIndex = 0;
      for (let i = 0; i < scores.length; i++) {
        const score = scores[i];
        while (diffInfoIndex < difficultyInfo.length - 1 && score < difficultyInfo[diffInfoIndex].cut) {
          diffInfoIndex++;
        }
        const currentDifficulty = difficultyInfo[diffInfoIndex].name;

        if (activeFilters.size > 0 && !activeFilters.has(currentDifficulty)) continue;
        const rank = i + 1;

        if (score <= theoreticalScore && !bestRankRecord) {
          bestRankRecord = createRecord(rank, score, 'closest', t('recordAfter'), currentDifficulty);
        }
        if (score >= theoreticalScore) {
          lastWorstRank = rank;
          lastWorstScore = score;
          lastWorstDifficulty = currentDifficulty;
        }
      }

      if (lastWorstRank !== -1) {
        results.push(createRecord(lastWorstRank, lastWorstScore, 'closest', t('recordBefore'), lastWorstDifficulty));
      }
      if (bestRankRecord) results.push(bestRankRecord);

      return results;
    }

    const numericValue = parseInt(searchTerm.replace(/,/g, ''), 10);
    if (isNaN(numericValue)) return results;

    if (numericValue <= scores.length && numericValue > 0) {
      const rank = numericValue;
      const index = rank - 1;
      const score = scores[index];

      if (isTotalChart) {
        const bracket = getBracketFromTotalScore(score);
        results.push(createRecord(rank, score, 'exactRank', t('rankLookup', { rank: numericValue }), bracket));
      } else {
        const difficulty = getDifficultyName(score, server, raidInfo.Id);
        if (activeFilters.size === 0 || activeFilters.has(difficulty)) {
          results.push(createRecord(rank, score, 'exactRank', t('rankLookup', { rank: numericValue }), difficulty));
        }
      }
    }
    const targetScore = numericValue;

    if (targetScore >= scores[scores.length - 1] / 2) {
      if (isTotalChart) {
        let bestRankRecord: SearchResult | null = null;
        let lastWorstRank = -1,
          lastWorstScore = -1;

        for (let i = 0; i < scores.length; i++) {
          const score = scores[i];
          const rank = i + 1;

          if (score <= targetScore && !bestRankRecord) {
            bestRankRecord = createRecord(rank, score, 'closest', t('recordAfter'), getBracketFromTotalScore(score));
          }
          if (score >= targetScore) {
            lastWorstRank = rank;
            lastWorstScore = score;
          }
        }
        if (lastWorstRank !== -1) {
          results.push(createRecord(lastWorstRank, lastWorstScore, 'closest', t('recordBefore'), getBracketFromTotalScore(lastWorstScore)));
        }
        if (bestRankRecord) results.push(bestRankRecord);
      } else {
        // Search for raid scores
        const targetDifficulty = getDifficultyName(targetScore, server, raidInfo.Id);

        if (difficultiesToSearch.includes(targetDifficulty)) {
          results.push({
            type: 'scoreConversion',
            label: t('timeConversion'),
            time: formatTimeToTimestamp(calculateTimeFromScore(targetScore, raidInfo.Boss, server, raidInfo.Id) || 0) || '',
            difficulty: targetDifficulty,
          });

          let bestRankRecord: SearchResult | null = null;
          let lastWorstRank = -1,
            lastWorstScore = -1;
          let lastWorstDifficulty: DifficultyName = 'Normal';

          let diffInfoIndex = 0;
          for (let i = 0; i < scores.length; i++) {
            const score = scores[i];

            while (diffInfoIndex < difficultyInfo.length - 1 && score < difficultyInfo[diffInfoIndex].cut) {
              diffInfoIndex++;
            }
            const currentDifficulty = difficultyInfo[diffInfoIndex].name;

            if (activeFilters.size > 0 && !activeFilters.has(currentDifficulty)) continue;

            const rank = i + 1;

            if (score <= targetScore && !bestRankRecord) {
              bestRankRecord = createRecord(rank, score, 'closest', t('recordAfter'), currentDifficulty);
            }
            if (score >= targetScore) {
              lastWorstRank = rank;
              lastWorstScore = score;
              lastWorstDifficulty = currentDifficulty;
            }
          }
          if (lastWorstRank !== -1) {
            results.push(createRecord(lastWorstRank, lastWorstScore, 'closest', t('recordBefore'), lastWorstDifficulty));
          }
          if (bestRankRecord) results.push(bestRankRecord);
        }
      }
    }

    return results;
  }, [searchTerm, scores, activeFilters, availableDifficultyOrder, isTotalChart, raidInfo, server, t]);
};

export const RecordLookup: React.FC<RecordLookupProps> = React.memo(({ scores, raidInfo, server, isTotalChart }) => {
  const { t } = useTranslation('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const difficultyInfo = getDifficultyInfoFromScoreAndBoss(server, raidInfo.Id);

  const fullDifficultyOrder = useMemo(() => difficultyInfo.map((d) => d.name), []);

  const availableDifficultyOrder = useMemo(() => {
    let maxAchievedIndex = fullDifficultyOrder.length - 1;
    if (scores.length > 0) {
      const rankOneDifficulty = getDifficultyName(scores[0], server, raidInfo.Id);
      const index = fullDifficultyOrder.indexOf(rankOneDifficulty);
      if (index !== -1) maxAchievedIndex = index;
    }
    return fullDifficultyOrder.slice(maxAchievedIndex); // as DifficultyName[];
  }, [scores, fullDifficultyOrder]);

  const isSearchQuery = isTotalChart || /[\d:.\s+]/.test(searchTerm);

  const availableFilterOptions = useMemo(() => {
    if (isTotalChart || isSearchQuery) return [];
    return availableDifficultyOrder.filter((diff) => !activeFilters.has(diff) && diff.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [availableDifficultyOrder, activeFilters, searchTerm, isSearchQuery, isTotalChart]);

  const searchResults = useRecordSearch({
    searchTerm,
    scores,
    activeFilters,
    availableDifficultyOrder,
    isTotalChart,
    raidInfo,
    server,
    t,
  });

  const toggleFilter = (diff: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(diff)) next.delete(diff);
      else next.add(diff);
      return next;
    });
    setSearchTerm('');
    setIsDropdownVisible(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div ref={containerRef} data-component-name="RecordLookup" className="relative">
        <div className="flex flex-wrap items-center gap-2 p-2 border rounded-md bg-white dark:bg-neutral-700 dark:border-neutral-600 min-h-[44px]">
          {!isTotalChart &&
            Array.from(activeFilters).map((diff) => (
              <div key={diff} className="flex items-center gap-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-semibold px-2 py-1 rounded-full">
                <span>{diff}</span>
                <button onClick={() => toggleFilter(diff)} className="font-bold -mr-1">
                  &times;
                </button>
              </div>
            ))}

          <div className="relative grow flex items-center min-w-[150px]">
            <div className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 pointer-events-none">
              <FiSearch size={18} />
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsDropdownVisible(true)}
              placeholder={isTotalChart ? t('totalLookupPlaceholder') : activeFilters.size > 0 ? t('lookupInFiltersPlaceholder') : t('lookupPlaceholder')}
              className="w-full pl-2 pr-7 py-1 text-base md:text-sm focus:outline-none bg-transparent surin"
            />
          </div>
        </div>

        {isDropdownVisible && (
          <div className="absolute w-full mt-1 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border dark:border-neutral-700 z-10 max-h-100 overflow-y-auto">
            {isSearchQuery ? (
              searchResults.length > 0 ? (
                searchResults.map((res, i) => <SearchResultCard key={i} result={res} isTotalChart={isTotalChart} /*t={t}*/ />)
              ) : (
                <p className="p-3 text-center text-sm text-neutral-500">{t('noResults')}</p>
              )
            ) : availableFilterOptions.length > 0 ? (
              availableFilterOptions.map((diff) => (
                <button key={diff} onClick={() => toggleFilter(diff)} className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700">
                  {diff}
                </button>
              ))
            ) : (
              <p className="p-3 text-center text-sm text-neutral-500">{t('noMoreFilters')}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
});
