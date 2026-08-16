import type { Box } from '../types';

export const SECTION_TEMPLATE = [0.226, 0.422, 0.618, 0.784, 0.934] as const;
const SECTION_NAMES = ['header', 'stat', 'skill', 'weapon', 'equipment', 'bottom'] as const;
const GOOD_ENOUGH_RESIDUAL = 0.01;

type Band = [center: number, width: number];
type Alignment = { residual: number; bandIndices: number[]; templateIndices: number[]; a: number; b: number };

const combinations = (length: number, size: number): number[][] => {
  const result: number[][] = [];
  const visit = (start: number, picked: number[]) => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= length - (size - picked.length); index += 1) {
      picked.push(index);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
};

const dominantColorFraction = (image: ImageData, y: number, left: number, right: number, tolerance = 10): number => {
  const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let x = left; x < right; x += 1) {
    const source = (y * image.width + x) * 4;
    const r = image.data[source];
    const g = image.data[source + 1];
    const b = image.data[source + 2];
    const key = Math.floor(r / 8) * 10_000 + Math.floor(g / 8) * 100 + Math.floor(b / 8);
    const value = counts.get(key);
    if (value) {
      value.count += 1;
      value.r += r;
      value.g += g;
      value.b += b;
    } else counts.set(key, { count: 1, r, g, b });
  }
  let modeKey = Infinity;
  let mode = { count: 0, r: 0, g: 0, b: 0 };
  for (const [key, value] of counts)
    if (value.count > mode.count || (value.count === mode.count && key < modeKey)) {
      modeKey = key;
      mode = value;
    }
  if (!mode.count || right <= left) return 0;
  const mr = mode.r / mode.count;
  const mg = mode.g / mode.count;
  const mb = mode.b / mode.count;
  let close = 0;
  for (let x = left; x < right; x += 1) {
    const source = (y * image.width + x) * 4;
    if (Math.hypot(image.data[source] - mr, image.data[source + 1] - mg, image.data[source + 2] - mb) < tolerance) close += 1;
  }
  return close / (right - left);
};

export const findUniformBands = (image: ImageData, rawLeft: number, rawRight: number, yStartFraction = 0.15, threshold = 0.92, minWidthFraction = 0.006): Band[] => {
  const left = Math.max(0, Math.floor(rawLeft));
  const right = Math.min(image.width, Math.ceil(rawRight));
  const y0 = Math.floor(image.height * yStartFraction);
  const uniform = new Uint8Array(image.height);
  for (let y = y0; y < image.height; y += 1) if (dominantColorFraction(image, y, left, right) > threshold) uniform[y] = 1;
  const minimumWidth = image.height * minWidthFraction;
  const bands: Band[] = [];
  for (let y = y0; y < image.height;) {
    if (!uniform[y]) {
      y += 1;
      continue;
    }
    let end = y;
    while (end < image.height && uniform[end]) end += 1;
    if (end - y >= minimumWidth) bands.push([(y + end) / 2 / image.height, (end - y) / image.height]);
    y = end;
  }
  return bands;
};

const bestAlignmentAtK = (centers: number[], template: readonly number[], size: number): Alignment | null => {
  const bandCombinations = combinations(centers.length, size);
  const templateCombinations = combinations(template.length, size);
  let best: Alignment | null = null;
  for (const templateIndices of templateCombinations) {
    const templateMean = templateIndices.reduce((sum, index) => sum + template[index], 0) / size;
    const variance = templateIndices.reduce((sum, index) => sum + (template[index] - templateMean) ** 2, 0);
    for (const bandIndices of bandCombinations) {
      const detectedMean = bandIndices.reduce((sum, index) => sum + centers[index], 0) / size;
      let covariance = 0;
      for (let index = 0; index < size; index += 1) covariance += (template[templateIndices[index]] - templateMean) * (centers[bandIndices[index]] - detectedMean);
      const a = covariance / variance;
      const b = detectedMean - a * templateMean;
      let squaredError = 0;
      for (let index = 0; index < size; index += 1) squaredError += (a * template[templateIndices[index]] + b - centers[bandIndices[index]]) ** 2;
      const residual = Math.sqrt(squaredError / size);
      if (!best || residual < best.residual) best = { residual, bandIndices, templateIndices, a, b };
    }
  }
  return best;
};

export const fitTemplate = (bands: Band[], template: readonly number[] = SECTION_TEMPLATE) => {
  const centers = bands.map(([center]) => center).sort((a, b) => a - b);
  let best: Alignment | null = null;
  for (let size = Math.min(centers.length, template.length); size >= 2; size -= 1) {
    const candidate = bestAlignmentAtK(centers, template, size);
    if (candidate && (!best || candidate.residual < best.residual)) best = candidate;
    if (best && best.residual < GOOD_ENOUGH_RESIDUAL) break;
  }
  if (!best) return { predicted: [...template], matches: [] as [number, number, number][], fit: [1, 0] as [number, number] };
  const alignment = best;
  const matched = new Map(alignment.templateIndices.map((templateIndex, index) => [templateIndex, centers[alignment.bandIndices[index]]]));
  return {
    predicted: template.map((value, index) => matched.get(index) ?? alignment.a * value + alignment.b),
    matches: alignment.templateIndices.map((templateIndex, index) => [template[templateIndex], centers[alignment.bandIndices[index]], 0] as [number, number, number]),
    fit: [alignment.a, alignment.b] as [number, number],
  };
};

export const getSections = (image: ImageData, left: number, right: number): Record<(typeof SECTION_NAMES)[number], Box> => {
  const { predicted } = fitTemplate(findUniformBands(image, left, right));
  const boundaries = [0, ...predicted, 1];
  return Object.fromEntries(
    SECTION_NAMES.map((name, index) => {
      const y0 = Math.floor(boundaries[index] * image.height);
      const y1 = Math.floor(boundaries[index + 1] * image.height);
      return [name, { x: Math.floor(left), y: y0, width: Math.floor(right) - Math.floor(left), height: y1 - y0 }];
    }),
  ) as Record<(typeof SECTION_NAMES)[number], Box>;
};
