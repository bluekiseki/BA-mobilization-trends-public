import type { Student } from '~/types/data';

export interface RawRatingData {
  [key: string]: number; // e.g., "6|10074|6": 1024
}
export interface RatingData {
  rank: number;
  id: number;
  name: string;
  bullettype: Student['BulletType'];
  total: number;
  count: number;
  portrait: Student['Portrait'];
  portraits: Student['Portrait'][];
  ratings: {
    [key: string]: number;
  };
}
export type TacticRoleFilter = Student['TacticRole'] | 'All';
// The thin `{lang}.students.bin` payload carries a scalar `IsLimited` (jp server, SchaleDB
// IsLimited[0]) instead of the array on the shared `Student` type used for raw SchaleDB data.
export type RankStudent = Omit<Student, 'IsLimited'> & { IsLimited?: 0 | 1 | 2 | 3 | 4 };
// Recruit-type filter values are the SchaleDB IsLimited[0] code stringified:
// '0' permanent, '1' limited, '2' welfare/event, '3' fes, '4' pickup-archive.
export type RecruitTypeFilter = 'All' | '0' | '1' | '2' | '3' | '4';
