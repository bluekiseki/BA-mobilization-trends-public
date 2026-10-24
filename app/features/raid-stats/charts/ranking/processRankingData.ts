import type { RaidInfo, Student } from '~/types/data';
import { difficultyInfo } from '~/components/raid/Difficulty';
import { getCombatStyleDisplayId, getCombatStyleGroupRosterIds } from '~/utils/combatStyle';
import type { RankStudent, RatingData, RawRatingData, RecruitTypeFilter, TacticRoleFilter } from './types';

export interface ProcessRankingInput {
  rawRatingData: RawRatingData;
  allStudents: Record<string, RankStudent>;
  selectedRaidIds: number[];
  displayMode: 'total' | 'average';
  selectedSquadType: string;
  selectedTacticRoles: Set<TacticRoleFilter>;
  selectedRecruitTypes: Set<RecruitTypeFilter>;
  selectedDifficulties: Set<string>;
  raidInfo: RaidInfo[];
  selectedStudentType: string;
  studentMap: Record<number, RankStudent>;
  isRelativeMode: boolean;
  svgWidth: number;
}

/** Aggregates the raw play-rate bins into ranked, stacked-bar rows for the ranking chart. */
export function processRankingData({
  rawRatingData,
  allStudents,
  selectedRaidIds,
  displayMode,
  selectedSquadType,
  selectedTacticRoles,
  selectedRecruitTypes,
  selectedDifficulties,
  raidInfo,
  selectedStudentType,
  studentMap,
  isRelativeMode,
  svgWidth,
}: ProcessRankingInput) {
  if (Object.keys(rawRatingData).length === 0 || Object.keys(allStudents).length === 0) return [];

  // Filter students based on selected SquadType and TacticRole
  const filteredStudentIds = Object.keys(allStudents)
    .filter((studentId) => {
      const student = allStudents[studentId];
      const squadTypeMatch = selectedSquadType === 'All' || student.SquadType === selectedSquadType;
      const tacticRoleMatch = selectedTacticRoles.has('All') || selectedTacticRoles.has(student.TacticRole);
      const recruitMatch = selectedRecruitTypes.has('All') || selectedRecruitTypes.has(String(student.IsLimited ?? 0) as RecruitTypeFilter);

      return squadTypeMatch && tacticRoleMatch && recruitMatch;
    })
    .map((id) => parseInt(id, 10));

  // Process only the filtered students' data
  const studentTotals: Record<number, number> = {};
  const studentRankCounts: Record<number, Record<string, number>> = {};

  const [startId, endId] = selectedRaidIds;

  const displayValue = displayMode === 'average';

  // Determine which difficulties to include
  const difficultiesToInclude = selectedDifficulties.has('All') ? new Set(difficultyInfo.filter((d) => d.name !== 'Extreme').map((d) => d.name)) : selectedDifficulties;

  for (const key in rawRatingData) {
    const [raidStr, studentStr, rankStr, difficultyIndex] = key.split('|');
    const student = parseInt(studentStr, 10);
    const rank = parseInt(rankStr, 10);
    let count = rawRatingData[key];
    const raidIdNum = parseInt(raidStr, 10);
    const difficulty = difficultyInfo[parseInt(difficultyIndex)].name;

    // Filter by difficulty before calculating the per-difficulty average.
    if (!difficultiesToInclude.has(difficulty)) continue;

    if (displayValue) {
      const participantCount = raidInfo[raidIdNum].Cnt[difficulty];
      count /= participantCount || raidInfo[raidIdNum].Cnt.All;
    }

    // Filter by raid ID range
    const raidIdMatch = raidIdNum >= startId && raidIdNum <= endId;

    // Only process data for students that match the filter
    if (filteredStudentIds.includes(student) && raidIdMatch) {
      const studentTypeMatch = selectedStudentType === 'All' || (selectedStudentType === 'Normal' && rank >= 0) || (selectedStudentType === 'Helper' && rank < 0);
      if (!studentTypeMatch) {
        continue;
      }
      studentTotals[student] = (studentTotals[student] || 0) + count;
      if (!studentRankCounts[student]) {
        studentRankCounts[student] = {};
      }
      studentRankCounts[student][rankStr] = (studentRankCounts[student][rankStr] || 0) + count;
    }
  }

  const mergedTotals: Record<number, number> = {};
  const mergedRankCounts: Record<number, Record<string, number>> = {};
  for (const [studentIdStr, total] of Object.entries(studentTotals)) {
    const studentId = parseInt(studentIdStr, 10);
    const displayId = getCombatStyleDisplayId(studentId);
    mergedTotals[displayId] = (mergedTotals[displayId] || 0) + total;
    mergedRankCounts[displayId] ??= {};
    for (const [rankStr, count] of Object.entries(studentRankCounts[studentId] || {})) {
      mergedRankCounts[displayId][rankStr] = (mergedRankCounts[displayId][rankStr] || 0) + count;
    }
  }

  const sortedStudents = Object.entries(mergedTotals).sort(([, totalA], [, totalB]) => totalB - totalA);

  const formattedData: RatingData[] = sortedStudents.map(([studentIdStr, total], index) => {
    const displayId = parseInt(studentIdStr, 10);
    const ratings = mergedRankCounts[displayId];
    return {
      rank: index + 1,
      id: displayId,
      name: studentMap[displayId].Name,
      bullettype: studentMap[displayId].BulletType,
      portrait: studentMap[displayId].Portrait,
      portraits: getCombatStyleGroupRosterIds(displayId)
        .map((id) => studentMap[id]?.Portrait)
        .filter((portrait): portrait is Student['Portrait'] => Boolean(portrait)),
      total: total,
      count: total,
      ratings: ratings,
    };
  });

  const maxTotal = Math.max(...formattedData.map((item) => item.total));

  return formattedData.map((item) => {
    let xOffset = 0;
    const processedRatings = Object.entries(item.ratings)
      .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
      .sort(([a], [b]) => {
        const f = (x: number) => (x >= 0 ? x : 10000 + -x);
        return f(parseInt(a, 10)) - f(parseInt(b, 10));
      })
      .map(([key, value]) => {
        const width = isRelativeMode ? (value / item.total) * (svgWidth - 120) : (value / maxTotal) * (svgWidth - 120);
        const x = xOffset;
        const percent = `${((value / item.total) * 100).toFixed(2)}%`;
        xOffset += width;
        return {
          rating: parseInt(key),
          value: value,
          width,
          x,
          percent,
          label: isRelativeMode ? percent : displayMode == 'average' ? value.toFixed(2) : value.toLocaleString(),
        };
      });
    return { ...item, processedRatings };
  });
}
