export type AggregationType = 'student_separate' | 'student_combined' | 'club' | 'school';

export type TreemapSourceEntry = {
  school: string;
  club: string;
  baseName: string;
  seasonalName: string; // Student's unique name (e.g., "Akari (New Year)")
  count: number;
  iconId: number;
};
