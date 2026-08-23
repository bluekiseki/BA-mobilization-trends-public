// src/utils/gachaData.ts

import Papa from 'papaparse';

// --- CSV File Import (Vite asset imports) ---
import krPickupCsvRaw from '~/data/kr/schedule/pickup.csv?raw';
import jpPickupCsvRaw from '~/data/jp/schedule/pickup.csv?raw';

// --- Types: SchaleDB data structure (based on user-provided definitions) ---
export interface SchaleStudent {
  Id: number;
  Name: string;
  SearchTags: string[];
  School: string;
  BulletType: 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic' | 'Chemical';
  StarGrade: number;
  IsLimited: (0 | 1 | 2 | 3)[]; // 0: Permanent, 1: Limited, 2: Welfare/Event, 3: Limited (SchaleDB standard)
}

// --- Types: Unified student structure for internal simulator use ---
export interface Student {
  id: number;
  name: string; // Korean name from SchaleDB (fallback to CSV name if missing)

  // Banner attributes (CSV based)
  isLimited: boolean;
  isFes: boolean;
  isRerun: boolean;
  isRecall: boolean;

  // Detailed attributes (SchaleDB based)
  school?: string;
  bulletType?: string;
  starGrade?: number; // 1, 2, 3

  imgUrl?: string;
}

export interface BannerPeriod {
  id: string; // startTime_endTime
  startTime: string;
  endTime: string;

  // Global banner attributes
  /** Raw CSV bannerType ('', 'recall', 'encore', or future values) — part of the banner grouping key so new types stay distinct without code changes. */
  bannerType: string;
  isFes: boolean;
  isLimitedBanner: boolean;
  isRerunBanner: boolean;
  isRecall: boolean; // Archive pickup. In this case, 100 new Elephs are not granted.
  freePulls: number; // Automatically calculated (0 or 100)
  /** Whether this banner uses the "recruit charge" pity system (post Makoto (Swimsuit) patch) instead of the legacy spark-point system. */
  useChargeSystem: boolean;

  pickupStudents: Student[];
}

interface CsvRow {
  studentId: string;
  name: string;
  startTime: string;
  endTime: string;
  rerun: string; // "true" | "false"
  limited: string; // "true" | "false"
  fest: string; // "true" | "false" -> FES status
  prediction: string;
  bannerType: string;
}

/**
 * Combines SchaleDB and CSV data to generate a banner list.
 * @param region 'KR' | 'JP'
 * @param schaleStudentData Student data object fetched from SchaleDB (Key: StudentId)
 */
export const parseAndGroupBanners = (region: 'KR' | 'JP' = 'KR', schaleStudentData: Record<string, SchaleStudent> | null): BannerPeriod[] => {
  const csvData = region === 'KR' ? krPickupCsvRaw : jpPickupCsvRaw;

  // 1. CSV Parsing
  const { data } = Papa.parse<CsvRow>(csvData, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const groupedMap = new Map<string, BannerPeriod>();

  data.forEach((row) => {
    // Validate required data
    if (!row.startTime || !row.studentId) return;

    const startDateKey = row.startTime.trim();
    const endDateKey = row.endTime.trim();
    const bannerType = (row.bannerType || '').trim();
    const isRecall = ['recall', 'encore'].includes(bannerType);
    const groupKey = `${startDateKey}_${endDateKey}_${bannerType}`;

    // Predicted/unconfirmed banners use an "x" prefix (e.g. "x10146") until the real ID is confirmed.
    const studentId = Number(row.studentId.trim().replace(/^x/i, ''));

    // Convert CSV text to boolean
    const isFes = row.fest?.toLowerCase() === 'true';
    const isLimitedCsv = row.limited?.toLowerCase() === 'true';
    const isRerun = row.rerun?.toLowerCase() === 'true';

    // --- Data Enrichment ---
    // Use SchaleDB data if available, otherwise use CSV data (Fallback)
    let studentName = row.name; // Default: English/Temporary name from CSV
    let school = undefined;
    let bulletType = undefined;
    let starGrade = 3; // Default value

    if (schaleStudentData && schaleStudentData[studentId]) {
      const schaleInfo = schaleStudentData[studentId];
      studentName = schaleInfo.Name; // Replace with Korean name
      school = schaleInfo.School;
      bulletType = schaleInfo.BulletType;
      starGrade = schaleInfo.StarGrade;
    }

    // Create group (banner period) if it doesn't exist
    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        id: groupKey,
        startTime: startDateKey,
        endTime: endDateKey,
        bannerType,
        isFes: false, // Update later
        isLimitedBanner: false,
        isRerunBanner: true, // Default: true, changed to false if a new character is found
        isRecall: isRecall,
        freePulls: 0,
        useChargeSystem: false, // Determined after all banners are parsed (see cutoff calculation below)
        pickupStudents: [],
      });
    }

    const group = groupedMap.get(groupKey);
    if (!group) return;

    // Update group attributes (OR condition)
    if (isFes) group.isFes = true;
    if (isLimitedCsv) group.isLimitedBanner = true;

    // If at least one new character is included, this banner period is a "New Pickup" (not a rerun)
    // -> Important for free pull logic determination
    if (!isRerun) group.isRerunBanner = false;

    // Create and add student object
    const studentObj: Student = {
      id: studentId,
      name: studentName,
      isLimited: isLimitedCsv,
      isFes: isFes,
      isRerun: isRerun,
      isRecall: isRecall,
      school,
      bulletType,
      starGrade,
    };

    group.pickupStudents.push(studentObj);
  });

  // 2. Sort chronologically
  const sortedBanners = Array.from(groupedMap.values()).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // 3. Auto-grant logic for 100 free pulls (publisher business rules)
  // Rule: 100 free pulls if a [Limited] and [New (not Rerun)] banner is immediately before or after a [FES] banner
  for (let i = 0; i < sortedBanners.length; i++) {
    const current = sortedBanners[i];

    // Free pull candidates: Limited & New (not Rerun) & not FES. Some free pulls were granted
    // during FES itself (e.g. S.Hoshino), but recent trend is limited banners before/after FES.
    if (current.isLimitedBanner && !current.isRerunBanner && !current.isFes) {
      const prevBanner = sortedBanners[i - 1];
      const nextBanner = sortedBanners[i + 1];

      const isPrevFes = prevBanner?.isFes;
      const isNextFes = nextBanner?.isFes;

      // Eligible if preceded or followed by a FES banner
      if (isPrevFes || isNextFes) {
        current.freePulls = 100;
      }
    }
  }

  // 4. Determine the "recruit charge" pity cutoff (replaces the legacy spark-point system),
  // effective from each region's earliest banner featuring Makoto (Swimsuit) (studentId 10146).
  const CHARGE_SYSTEM_TRIGGER_ID = 10146;
  const cutoffTime = sortedBanners.filter((b) => b.pickupStudents.some((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID)).reduce((min, b) => Math.min(min, new Date(b.startTime).getTime()), Infinity);

  sortedBanners.forEach((b) => {
    b.useChargeSystem = new Date(b.startTime).getTime() >= cutoffTime;
  });

  return sortedBanners;
};

/* Mirror CSV portrait keys (x10148) under normalized numeric key (10148) for lookups */
export const normalizePortraitMap = (raw: Record<string, string>): Record<string, string> => {
  const normalized = { ...raw };
  for (const key of Object.keys(raw)) {
    const match = /^x(\d+)$/i.exec(key);
    if (match && !(match[1] in normalized)) normalized[match[1]] = raw[key];
  }
  return normalized;
};

/**
 * Retrieves the list of all students (used to configure the 'regular pool' in the simulator).
 * Creates the list based on SchaleDB data if available.
 */
export const getAllStudents = (schaleStudentData: Record<string, SchaleStudent> | null): Student[] => {
  if (!schaleStudentData) return [];

  return Object.values(schaleStudentData).map((s) => ({
    id: s.Id,
    name: s.Name,
    isLimited: s.IsLimited[0] === 1, // SchaleDB: 1=Limited
    isFes: s.IsLimited[0] == 3,
    isRerun: false, // No meaning
    isRecall: false, // Is this meaningless?
    school: s.School,
    bulletType: s.BulletType,
    starGrade: s.StarGrade,
    // imgUrl: `https://schale.gg/images/student/icon/${s.Id}.webp`,
  }));
};

/* Fill in unrevealed future pickups from CSV data (not yet in SchaleDB roster) */
export const withPickupFallbackStudents = (baseStudents: Student[], banners: BannerPeriod[]): Student[] => {
  const known = new Set(baseStudents.map((s) => s.id));
  const merged = [...baseStudents];
  for (const banner of banners) {
    for (const student of banner.pickupStudents) {
      if (!known.has(student.id)) {
        known.add(student.id);
        merged.push(student);
      }
    }
  }
  return merged;
};
