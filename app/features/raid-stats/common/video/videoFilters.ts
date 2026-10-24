import { createStudentFilter, matchesStudentFilter, type StudentFilterState } from '../../dashboard/studentFilter';
import type { VideoEntry } from './types';

export interface VideoFilterState {
  difficulty: string;
  tlOnly: boolean;
  targetTypeOnly: boolean;
  partyInfoOnly: boolean;
  scoreMin: number | null;
  scoreMax: number | null;
  students: StudentFilterState;
}

export type VideoSort = 'score_desc' | 'score_asc' | 'upload_asc' | 'upload_desc';
const raidTypeToVideoType: Record<string, string> = {
  LightArmor: 'Explosion',
  HeavyArmor: 'Pierce',
  Unarmed: 'Mystic',
  ElasticArmor: 'Sonic',
  CompositeArmor: 'Chemical',
};

export function createVideoFilters(): VideoFilterState {
  return { difficulty: 'All', tlOnly: false, targetTypeOnly: false, partyInfoOnly: false, scoreMin: null, scoreMax: null, students: createStudentFilter() };
}

export function getVideoPartyIds(video: VideoEntry): number[][] {
  return video.parties.map((party) => party.map((student) => student.id).filter((id) => Number.isInteger(id) && id > 0));
}

export function hasVideoPartyInfo(video: VideoEntry): boolean {
  return getVideoPartyIds(video).some((party) => party.length > 0);
}

export function matchesVideoFilters(video: VideoEntry, filters: VideoFilterState, activeTab: string): boolean {
  if (filters.difficulty !== 'All' && video.difficulty !== filters.difficulty) return false;
  if (filters.tlOnly && !video.has_tl) return false;
  if (filters.targetTypeOnly && !video.is_target_type) return false;
  if (activeTab !== 'All') {
    const videoType = raidTypeToVideoType[activeTab];
    if (!videoType || !video.boss_types.includes(videoType)) return false;
  }
  const parties = getVideoPartyIds(video);
  if (filters.partyInfoOnly && !parties.some((party) => party.length > 0)) return false;
  return matchesStudentFilter(parties, filters.students);
}

export function matchesVideoScore(video: VideoEntry, filters: Pick<VideoFilterState, 'scoreMin' | 'scoreMax'>): boolean {
  if (filters.scoreMin === null && filters.scoreMax === null) return true;
  if (typeof video.score !== 'number') return false;
  return (filters.scoreMin === null || video.score >= filters.scoreMin) && (filters.scoreMax === null || video.score <= filters.scoreMax);
}

export function getActiveVideoFilterCount(filters: VideoFilterState): number {
  return [
    filters.difficulty !== 'All',
    filters.tlOnly,
    filters.targetTypeOnly,
    filters.partyInfoOnly,
    filters.scoreMin !== null || filters.scoreMax !== null,
    filters.students.excludeIds.length > 0,
    filters.students.includeIds.length > 0,
  ].filter(Boolean).length;
}
