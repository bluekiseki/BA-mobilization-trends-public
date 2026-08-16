// app/utils/calender.data.ts
import Papa from 'papaparse';

type ArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';

export interface PickupStudentInfo {
  id: number;
  limited: boolean;
  rerun: boolean;
  fest: boolean;
}

export interface ScheduleItemDetails {
  students?: PickupStudentInfo[];
  isPointEvent?: boolean;
  rerun?: boolean;
  studentId?: number;
  prediction?: boolean;
  maxDifficulty?: string;
  terrain?: string;
  armorType?: ArmorType;
  armorName?: string;
  jfdType?: string;
  jfd3rd?: string;
  jfd4th?: string;
  campaignType?: string;
  multiplier?: number;
  noticeURL?: string;
  bosses?: Array<{ armorType: ArmorType | undefined; armorName: string; difficulty: string }>;
  title?: string;
}

export interface ScheduleItem {
  id: string;
  type: string;
  startTime: string;
  endTime: string;
  title: string;
  label?: string;
  textColor?: string;
  link?: string;
  details?: ScheduleItemDetails;
}

export type ScheduleTrack = 'raid' | 'event' | 'multifloor' | 'campaign' | 'pickup' | 'maintenance' | 'story' | 'patch' | 'misc';

export function parseCsvString<T extends object>(csvString: string): T[] {
  try {
    const parsed = Papa.parse<T>(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    return parsed.data.filter((row) => Object.values(row).some((val) => val !== null && val !== ''));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Schedule Loader] Failed to parse CSV string:`, errorMsg);
    return [];
  }
}
