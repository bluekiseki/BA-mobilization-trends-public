import type { GrowthPlan } from '~/store/planner/useGlobalStore';

interface StudentInfo {
  Name: string;
  [key: string]: unknown;
}

export interface StudentData {
  [id: string]: StudentInfo;
}

const STAR_UW_OPTIONS = [
  { id: 'star1', star: 1, uw: 0 },
  { id: 'star2', star: 2, uw: 0 },
  { id: 'star3', star: 3, uw: 0 },
  { id: 'star4', star: 4, uw: 0 },
  { id: 'star5', star: 5, uw: 0 },
  { id: 'ue1', star: 5, uw: 1 },
  { id: 'ue2', star: 5, uw: 2 },
  { id: 'ue3', star: 5, uw: 3 },
  { id: 'ue4', star: 5, uw: 4 },
] as const;

const safeStr = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

function starUwToId(star: number, uw: number): string {
  const opt = STAR_UW_OPTIONS.find((o) => o.star === star && o.uw === uw);
  return opt?.id || `star${star}`;
}

function idToStarUw(id: string): { star: number; uw: number } | null {
  const opt = STAR_UW_OPTIONS.find((o) => o.id === id);
  return opt ? { star: opt.star, uw: opt.uw } : null;
}

const HEADER_IDS = [
  'studentId',
  'name',
  // Base stats (Current)
  'currentLevel',
  'currentRank',
  'currentUeLevel',
  'currentAffection',
  'currentAffectionExp',
  // Base stats (Target)
  'targetLevel',
  'targetRank',
  'targetUeLevel',
  'targetAffection',
  // Skills (Current)
  'currentEx',
  'currentNormal',
  'currentPassive',
  'currentSub',
  // Skills (Target)
  'targetEx',
  'targetNormal',
  'targetPassive',
  'targetSub',
  // Equipment (Current)
  'currentEquipment1',
  'currentEquipment2',
  'currentEquipment3',
  'currentGear',
  // Equipment (Target)
  'targetEquipment1',
  'targetEquipment2',
  'targetEquipment3',
  'targetGear',
  // Others
  'acquiredDate',
  'useEligma',
  'eligmaPrice',
  'eligmaStock',
] as const;

export interface CsvMetadata {
  title: string;
  generated: string;
  version: string;
  warning: string;
  notes: string;
}

export function plansToCsv(growthPlans: GrowthPlan[], allStudents: StudentData, headerLabels?: string[], metadata?: CsvMetadata): string {
  const now = new Date();
  const isoDate = now.toISOString().split('T')[0];
  const isoTime = now.toISOString().split('T')[1].substring(0, 8);

  // Use provided header labels or fall back to header IDs
  const displayHeaders = headerLabels && headerLabels.length === HEADER_IDS.length ? headerLabels : [...HEADER_IDS];

  const metadataLines = metadata
    ? [`# ${metadata.title}`, `# ${metadata.generated}`, `# ${metadata.version}`, `# ${metadata.warning}`, `# ${metadata.notes}`, '#']
    : [
        '# BA Planner CSV Export',
        `# Generated: ${isoDate} ${isoTime}`,
        '# Version: 1.0',
        '# WARNING: Do not delete or modify the first 6 lines (metadata and headers)',
        '# Notes: First header row contains field IDs (for parsing), second contains display labels (translated)',
        '#',
      ];

  const rows = growthPlans
    .filter((plan) => plan.studentId !== null)
    .map((plan) => {
      const student = plan.studentId !== null ? allStudents[String(plan.studentId)] : undefined;
      if (!student) return null;

      const row = [
        safeStr(plan.studentId),
        safeStr(student.Name),
        // Base stats (Current)
        safeStr(plan.current.level),
        starUwToId(plan.current.star, plan.current.uw),
        safeStr(plan.current.uwLevel),
        safeStr(plan.current.affection),
        safeStr(plan.current.affectionExp),
        // Base stats (Target)
        safeStr(plan.target.level),
        starUwToId(plan.target.star, plan.target.uw),
        safeStr(plan.target.uwLevel),
        safeStr(plan.target.affection),
        // Skills (Current)
        safeStr(plan.current.ex),
        safeStr(plan.current.normal),
        safeStr(plan.current.passive),
        safeStr(plan.current.sub),
        // Skills (Target)
        safeStr(plan.target.ex),
        safeStr(plan.target.normal),
        safeStr(plan.target.passive),
        safeStr(plan.target.sub),
        // Equipment (Current)
        safeStr(plan.current.equipment[0]),
        safeStr(plan.current.equipment[1]),
        safeStr(plan.current.equipment[2]),
        safeStr(plan.current.gear),
        // Equipment (Target)
        safeStr(plan.target.equipment[0]),
        safeStr(plan.target.equipment[1]),
        safeStr(plan.target.equipment[2]),
        safeStr(plan.target.gear),
        // Others
        safeStr(plan.acquiredDate),
        plan.useEligmaForStar ? 'yes' : 'no',
        safeStr(plan.eligmaInfo?.price),
        safeStr(plan.eligmaInfo?.stock),
      ];

      return row;
    })
    .filter((row): row is string[] => row !== null);

  const csvContent = [...metadataLines, HEADER_IDS.map((h) => `"${h}"`).join(','), displayHeaders.map((h) => `"${h}"`).join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
    '\n',
  );

  return csvContent;
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // escaped quote
        current += '"';
        j++;
      } else {
        // toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export interface CsvImportResult {
  plans: GrowthPlan[];
  updatedCount: number;
}

export function csvToPlans(csvContent: string, existingPlans: GrowthPlan[], allStudents: StudentData): CsvImportResult {
  const lines = csvContent.trim().split('\n');

  // Skip metadata lines (lines starting with #)
  let dataStartIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('#')) {
      dataStartIndex = i;
      break;
    }
  }

  if (lines.length < dataStartIndex + 3) {
    throw new Error('error.invalidCsv');
  }

  // Parse header IDs (first non-metadata line)
  const headerIds = parseCSVLine(lines[dataStartIndex]);

  const headerMap: Record<string, number> = {};
  headerIds.forEach((header, index) => {
    headerMap[header] = index;
  });

  // Check required headers
  const requiredHeaders = ['studentId'];
  for (const required of requiredHeaders) {
    if (!(required in headerMap)) {
      throw new Error(`error.missingRequiredColumn:${required}`);
    }
  }

  // Skip display header row (second non-metadata line)
  const dataRowStart = dataStartIndex + 2;

  // Parse rows - create maps for lookup
  const plansById = new Map<number, GrowthPlan>();
  for (const plan of existingPlans) {
    if (plan.studentId !== null) {
      plansById.set(plan.studentId, plan);
    }
  }

  const updatedPlans: GrowthPlan[] = [];

  for (let i = dataRowStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line);

    const studentIdStr = cells[headerMap['studentId']]?.trim();
    const studentId = studentIdStr ? parseInt(studentIdStr) : null;

    if (studentId === null || isNaN(studentId)) continue;

    let plan = plansById.get(studentId);

    // If plan doesn't exist, create a new one
    if (!plan) {
      const student = allStudents[studentId];
      if (!student) continue;

      plan = {
        uuid: `${Date.now()}-${(Math.random() * 1e9) | 0}`,
        studentId: studentId,
        current: {
          level: 1,
          star: 3,
          uw: 0,
          uwLevel: 1,
          ex: 1,
          normal: 1,
          passive: 1,
          sub: 1,
          eleph: 0,
          affection: 1,
          affectionExp: 0,
          equipment: [0, 0, 0],
          gear: 0,
          potential: { hp: 0, atk: 0, heal: 0 },
        },
        target: {
          level: 1,
          star: 3,
          uw: 0,
          uwLevel: 1,
          ex: 1,
          normal: 1,
          passive: 1,
          sub: 1,
          affection: 1,
          equipment: [0, 0, 0],
          gear: 0,
          potential: { hp: 0, atk: 0, heal: 0 },
        },
        includedInEvents: [],
        useEligmaForStar: false,
        eligmaInfo: { price: 1, stock: 0 },
        isSelected: true,
      };
    } else {
      plan = { ...plan };
    }

    const getCell = (headerName: string): string => cells[headerMap[headerName]]?.trim() || '';

    // Base stats (Current)
    const currentLevel = parseInt(getCell('currentLevel'));
    if (!isNaN(currentLevel)) plan.current.level = Math.max(1, Math.min(90, currentLevel));

    const currentStarId = getCell('currentRank');
    if (currentStarId) {
      const starUw = idToStarUw(currentStarId);
      if (starUw) {
        plan.current.star = starUw.star;
        plan.current.uw = starUw.uw;
        if (starUw.uw === 0) plan.current.uwLevel = 1;
      }
    }

    const currentUwLevel = parseInt(getCell('currentUeLevel'));
    if (!isNaN(currentUwLevel) && plan.current.uw > 0) {
      plan.current.uwLevel = Math.max(1, Math.min(50, currentUwLevel));
    }

    const currentAffection = parseInt(getCell('currentAffection'));
    if (!isNaN(currentAffection)) plan.current.affection = Math.max(1, Math.min(100, currentAffection));

    const currentAffectionExp = parseInt(getCell('currentAffectionExp'));
    if (!isNaN(currentAffectionExp)) plan.current.affectionExp = Math.max(0, currentAffectionExp);

    // Base stats (Target)
    const targetLevel = parseInt(getCell('targetLevel'));
    if (!isNaN(targetLevel)) plan.target.level = Math.max(1, Math.min(90, targetLevel));

    const targetStarId = getCell('targetRank');
    if (targetStarId) {
      const starUw = idToStarUw(targetStarId);
      if (starUw) {
        plan.target.star = starUw.star;
        plan.target.uw = starUw.uw;
        if (starUw.uw === 0) plan.target.uwLevel = 1;
      }
    }

    const targetUwLevel = parseInt(getCell('targetUeLevel'));
    if (!isNaN(targetUwLevel) && plan.target.uw > 0) {
      plan.target.uwLevel = Math.max(1, Math.min(50, targetUwLevel));
    }

    const targetAffection = parseInt(getCell('targetAffection'));
    if (!isNaN(targetAffection)) plan.target.affection = Math.max(1, Math.min(100, targetAffection));

    // Skills (Current)
    const skillFields: Array<{ headerId: string; field: keyof typeof plan.current; max: number }> = [
      { headerId: 'currentEx', field: 'ex', max: 5 },
      { headerId: 'currentNormal', field: 'normal', max: 10 },
      { headerId: 'currentPassive', field: 'passive', max: 10 },
      { headerId: 'currentSub', field: 'sub', max: 10 },
    ];
    for (const { headerId, field, max } of skillFields) {
      const val = parseInt(getCell(headerId));
      if (!isNaN(val)) {
        plan.current[field] = Math.max(1, Math.min(max, val)) as never;
      }
    }

    // Skills (Target)
    const targetSkillFields: Array<{ headerId: string; field: keyof typeof plan.target; max: number }> = [
      { headerId: 'targetEx', field: 'ex', max: 5 },
      { headerId: 'targetNormal', field: 'normal', max: 10 },
      { headerId: 'targetPassive', field: 'passive', max: 10 },
      { headerId: 'targetSub', field: 'sub', max: 10 },
    ];
    for (const { headerId, field, max } of targetSkillFields) {
      const val = parseInt(getCell(headerId));
      if (!isNaN(val)) {
        plan.target[field] = Math.max(1, Math.min(max, val)) as never;
      }
    }

    // Equipment (Current)
    for (let j = 0; j < 3; j++) {
      const val = parseInt(getCell(`currentEquipment${j + 1}`));
      if (!isNaN(val)) {
        plan.current.equipment[j] = Math.max(0, val);
      }
    }

    const currentGear = parseInt(getCell('currentGear'));
    if (!isNaN(currentGear)) plan.current.gear = Math.max(0, currentGear);

    // Equipment (Target)
    for (let j = 0; j < 3; j++) {
      const val = parseInt(getCell(`targetEquipment${j + 1}`));
      if (!isNaN(val)) {
        plan.target.equipment[j] = Math.max(0, val);
      }
    }

    const targetGear = parseInt(getCell('targetGear'));
    if (!isNaN(targetGear)) plan.target.gear = Math.max(0, targetGear);

    // Others
    const acquiredDate = getCell('acquiredDate').trim();
    if (acquiredDate) plan.acquiredDate = acquiredDate;

    const eligmaUse = getCell('useEligma').toLowerCase().trim();
    plan.useEligmaForStar = eligmaUse !== 'no' && eligmaUse !== '';

    const eligmaPrice = parseInt(getCell('eligmaPrice'));
    if (!isNaN(eligmaPrice)) {
      plan.eligmaInfo = { ...plan.eligmaInfo, price: Math.max(0, Math.min(5, eligmaPrice)) };
    }

    const eligmaStock = parseInt(getCell('eligmaStock'));
    if (!isNaN(eligmaStock)) {
      plan.eligmaInfo = { ...plan.eligmaInfo, stock: Math.max(0, Math.min(20, eligmaStock)) };
    }

    updatedPlans.push(plan);
  }

  // Keep un-updated plans as is
  const updatedPlanIds = new Set(updatedPlans.map((p) => p.uuid));
  const allPlans = [...updatedPlans, ...existingPlans.filter((p) => !updatedPlanIds.has(p.uuid))];

  return {
    plans: allPlans,
    updatedCount: updatedPlans.length,
  };
}

export function downloadCsv(csvContent: string, filename: string = 'planner.csv'): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
