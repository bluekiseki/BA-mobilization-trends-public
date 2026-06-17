import type { RaidInfo, Student } from '~/types/data';

export const Transparent_Image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
export interface Character {
  id: number;
  level: number;
  star: number;
  hasWeapon: boolean;
  weaponStar: number;
  isAssist: boolean;
  isMulligan?: boolean;
  mulliganIndex?: number;
  CombatStyleIndex?: 1;
}
export interface Team {
  m: Character[];
  s: Character[];
}
export interface ReportEntry {
  r: number;
  s: number;
  t: Team[];
}
export interface ReportEntryRank extends ReportEntry {
  typeRanking: number;
}
export type StudentData = Record<number, Student>;
export type PortraitData = Record<number, string>; // New type for portrait data
export type UsageStats = Map<number, { total: number; stars: Map<number, number> }>;

const ratingColors: { [key: number]: string } = {
  1: '#D90429',
  2: '#F46F00',
  3: '#F7B801',
  4: '#00A36C',
  5: '#00829B',
  6: '#0052A2',
  7: '#4A4293',
  8: '#8C008C',
  9: '#D40078',
  10: '#E32249',
};

export function isTotalAssault(raid: RaidInfo) {
  return raid.Id.startsWith('R');
}

export const getBackgroundRatingColor = (index: number, theme: 'light' | 'dark' | null) => {
  const color = ratingColors[Math.abs(index)];
  if (!color) {
    return 'rgba(0, 0, 0, 0.1)';
  }

  const isDark = theme == 'dark';

  if (index < 0) {
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    const alpha = 0.3;
    const alpha_dark = 0.55;
    const t = (x: number) => (isDark ? x * alpha_dark : 255 - (255 - x) * alpha);
    // return `rgba(${r}, ${g}, ${b}, 0.15)`;
    return `rgba(${t(r)}, ${t(g)}, ${t(b)})`;
  }

  return color;
};

export const getStarValue = (star: number, uw: number) => {
  return getCharacterStarValue({
    hasWeapon: uw > 0,
    star: star,
    weaponStar: uw,
  } as Character);
};

export const getCharacterStarValue = (c: Character): number => {
  let out = c.hasWeapon ? 6 + c.weaponStar : c.star;
  if (c.hasWeapon && !c.weaponStar) out = 6;
  if (c.isAssist) out *= -1;
  return out;
};

export enum InclusionUsage {
  Twice = 0, // Rent twice with assist (with my student)
  // Once = 1, // Delete
  Any = 2, // Simple filtering
  Assist = 3, // must loan students as assist (my students may or may not be present)
}

export interface StudentConditionBase {
  id: number;
  starValues: number[];
}

export interface IncludableStudentCondition extends StudentConditionBase {
  mustBeIncluded: boolean;
  usage: InclusionUsage;
}

export interface ExcludableStudentCondition {
  id: number;
  isHardExclude: boolean;
}

export interface TableFilters {
  includable: IncludableStudentCondition[];
  excludable: ExcludableStudentCondition[];
  usePartyCount?: boolean;
  minParty?: number;
  maxParty?: number;
}
