import { crop, rgbToHsv } from './image';
import type { Box, StudentRecord } from '../types';

const grade = (value: number) => (value <= 1 ? 'D' : value === 2 ? 'B' : 'A');
const terrainFields = ['StreetBattleAdaptation', 'OutdoorBattleAdaptation', 'IndoorBattleAdaptation'] as const;
const adaptField: Record<string, (typeof terrainFields)[number]> = { Street: 'StreetBattleAdaptation', Outdoor: 'OutdoorBattleAdaptation', Indoor: 'IndoorBattleAdaptation' };

export const parsePosition = (raw: string): StudentRecord['Position'] | undefined => {
  const normalized = raw.toLowerCase();
  if (normalized.includes('front')) return 'Front';
  if (normalized.includes('middle') || normalized.includes('midole')) return 'Middle';
  if (normalized.includes('back')) return 'Back';
  return undefined;
};

export const matchStudents = (
  students: StudentRecord[],
  observed: { bullet?: string; armor?: string; squad?: string; position?: string; stars?: number; terrain?: string[]; weaponStars?: number },
): StudentRecord[] =>
  students.filter((student) => {
    if (observed.bullet && student.BulletType !== observed.bullet) return false;
    if (observed.armor && student.ArmorType !== observed.armor) return false;
    if (observed.squad && student.SquadType !== observed.squad) return false;
    if (observed.position && student.Position !== observed.position) return false;
    if (observed.stars !== undefined && observed.stars < student.StarGrade) return false;
    if (observed.terrain?.length === 3) {
      const bonusField = student.Weapon?.AdaptationType ? adaptField[student.Weapon.AdaptationType] : undefined;
      for (let index = 0; index < 3; index += 1) {
        const shown = observed.terrain[index];
        if (!['D', 'B', 'A'].includes(shown)) continue;
        const field = terrainFields[index];
        const accepted = new Set([grade(student[field])]);
        if (field === bonusField && (observed.weaponStars ?? 0) >= 3 && student.Weapon?.AdaptationValue) accepted.add(grade(Math.min(4, student[field] + student.Weapon.AdaptationValue)));
        if (!accepted.has(shown)) return false;
      }
    }
    return true;
  });

export const filterByEquipment = (students: StudentRecord[], equipmentTypes: string[]): StudentRecord[] => {
  if (equipmentTypes.length !== 3) return students;
  const filtered = students.filter((student) => student.Equipment.every((type, index) => type === equipmentTypes[index]));
  return filtered.length ? filtered : students;
};

export const uniqueEquipmentMatch = (students: StudentRecord[], equipmentTypes: string[]): StudentRecord[] => {
  if (equipmentTypes.length !== 3) return [];
  const matched = students.filter((student) => student.Equipment.every((type, index) => type === equipmentTypes[index]));
  return matched.length === 1 ? matched : [];
};

const histogram = (image: ImageData, box?: Box): Float64Array => {
  const source = box ? crop(image, box) : image;
  const bins = new Float64Array(50 * 60);
  for (let i = 0; i < source.data.length; i += 4) {
    const [hue, saturation] = rgbToHsv(source.data[i], source.data[i + 1], source.data[i + 2]);
    const h = Math.min(49, Math.floor((hue / 180) * 50));
    const s = Math.min(59, Math.floor((saturation / 256) * 60));
    bins[h * 60 + s] += 1;
  }
  const norm = Math.sqrt(bins.reduce((sum, value) => sum + value * value, 0)) || 1;
  for (let i = 0; i < bins.length; i += 1) bins[i] /= norm;
  return bins;
};

const correlation = (a: Float64Array, b: Float64Array): number => {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  return numerator / (Math.sqrt(denomA * denomB) || 1);
};

// Same students reappear as candidates across frames, so cache by student Id for the page's
// lifetime instead of re-fetching/decoding per (frame, candidate) pair.
const portraitHistogramCache = new Map<number, Float64Array | null>();

// Seeds the cache from precomputed histograms so getReferenceHistogram skips loadPortrait
// entirely for any id already seeded.
export const preloadPortraitHistograms = (entries: Iterable<[number, Float64Array]>): void => {
  for (const [id, hist] of entries) portraitHistogramCache.set(id, hist);
};

const getReferenceHistogram = async (id: number, loadPortrait: (id: number) => Promise<ImageBitmap | null>): Promise<Float64Array | null> => {
  const cached = portraitHistogramCache.get(id);
  if (cached !== undefined) return cached;
  let result: Float64Array | null = null;
  try {
    const bitmap = await loadPortrait(id);
    if (bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('2D canvas context not available');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      result = histogram(context.getImageData(0, 0, canvas.width, canvas.height));
    }
  } catch {
    result = null;
  }
  portraitHistogramCache.set(id, result);
  return result;
};

export const rankByPortrait = async (
  image: ImageData,
  panelLeft: number,
  candidates: StudentRecord[],
  loadPortrait: (id: number) => Promise<ImageBitmap | null>,
): Promise<{ student: StudentRecord; score: number | null }[]> => {
  const artBox = { x: panelLeft * 0.2, y: image.height * 0.1, width: panelLeft * 0.75, height: image.height * 0.45 };
  const query = histogram(image, artBox);
  const ranked = await Promise.all(
    candidates.map(async (student) => {
      const reference = await getReferenceHistogram(student.Id, loadPortrait);
      return { student, score: reference ? correlation(query, reference) : null };
    }),
  );
  return ranked.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
};
