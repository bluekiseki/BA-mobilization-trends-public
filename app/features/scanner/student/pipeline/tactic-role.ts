import { fetchJsonWithProgress, type DownloadProgress } from '~/utils/fetchWithProgress';
import { cdn } from '~/utils/cdn';
import type { Box, TacticRole } from '../types';

type Template = { role: TacticRole; width: number; height: number; pixels: number[]; centered: Float32Array; norm: number };
type TemplateData = Pick<Template, 'role' | 'width' | 'height' | 'pixels'>;

let templates: Template[] = [];

export const loadTacticRoleTemplates = async (onProgress: (progress: DownloadProgress) => void): Promise<void> => {
  const source = await fetchJsonWithProgress<TemplateData[]>(cdn('/student-scanner/models/tactic-role-templates.json'), onProgress);
  templates = source.map(({ role, width, height, pixels }) => {
    const mean = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
    const centered = Float32Array.from(pixels, (pixel) => pixel - mean);
    return { role, width, height, pixels, centered, norm: Math.hypot(...centered) };
  });
};

const grayAt = (image: ImageData, x: number, y: number): number => {
  const index = (y * image.width + x) * 4;
  return image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
};

const resizedGrayAt = (image: ImageData, x: number, y: number, scale: number): number => {
  const sourceX = Math.max(0, Math.min(image.width - 1, (x + 0.5) / scale - 0.5));
  const sourceY = Math.max(0, Math.min(image.height - 1, (y + 0.5) / scale - 0.5));
  const left = Math.floor(sourceX);
  const top = Math.floor(sourceY);
  const right = Math.min(image.width - 1, left + 1);
  const bottom = Math.min(image.height - 1, top + 1);
  const dx = sourceX - left;
  const dy = sourceY - top;
  return (1 - dy) * ((1 - dx) * grayAt(image, left, top) + dx * grayAt(image, right, top)) + dy * ((1 - dx) * grayAt(image, left, bottom) + dx * grayAt(image, right, bottom));
};

const correlation = (region: Float32Array, regionWidth: number, x: number, y: number, template: Template): number => {
  const count = template.pixels.length;
  let sum = 0;
  let sumSquare = 0;
  let dot = 0;
  for (let row = 0; row < template.height; row += 1)
    for (let col = 0; col < template.width; col += 1) {
      const index = row * template.width + col;
      const value = region[(y + row) * regionWidth + x + col];
      sum += value;
      sumSquare += value * value;
      dot += value * template.centered[index];
    }
  const variance = sumSquare - (sum * sum) / count;
  return variance > 0 ? dot / (Math.sqrt(variance) * template.norm) : 0;
};

export type TacticRolePrediction = { role: TacticRole; score: number; margin: number };
export type TacticRoleRanking = { rankings: { role: TacticRole; score: number }[]; accepted: boolean; margin: number };

/** Match the icon beside the translated role label and retain all five scores. */
export const rankTacticRoles = (image: ImageData, damageBadge: Box): TacticRoleRanking | null => {
  if (damageBadge.height < 10 || templates.length === 0) return null;
  const scale = 36 / damageBadge.height;
  const scaledWidth = Math.round(image.width * scale);
  const scaledHeight = Math.round(image.height * scale);
  const badgeX = Math.round(damageBadge.x * scale);
  const badgeY = Math.round(damageBadge.y * scale);
  const badgeWidth = Math.round(damageBadge.width * scale);
  const left = Math.max(0, badgeX - Math.round(2 * badgeWidth));
  // The icon sits in the left half of the role label; stop before its text.
  const right = Math.min(scaledWidth, badgeX - Math.round(0.65 * badgeWidth));
  const top = Math.max(0, badgeY - 6);
  const bottom = Math.min(scaledHeight, badgeY + 42);
  const width = right - left;
  const height = bottom - top;
  if (width < 30 || height < 30) return null;
  const region = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      region[y * width + x] = resizedGrayAt(image, left + x, top + y, scale);
    }
  const scores = new Map<TacticRole, number>();
  for (const template of templates) {
    let best = -1;
    for (let y = 0; y <= height - template.height; y += 1)
      for (let x = 0; x <= width - template.width; x += 1) {
        best = Math.max(best, correlation(region, width, x, y, template));
      }
    scores.set(template.role, Math.max(scores.get(template.role) ?? -1, best));
  }
  const rankings = [...scores].sort((a, b) => b[1] - a[1]).map(([role, score]) => ({ role, score }));
  const margin = rankings[0].score - rankings[1].score;
  return { rankings, accepted: rankings[0].score >= 0.82 && margin >= 0.03, margin };
};

/** Low-confidence rankings abstain so student matching is not over-filtered. */
export const classifyTacticRole = (image: ImageData, damageBadge: Box): TacticRolePrediction | null => {
  const result = rankTacticRoles(image, damageBadge);
  return result?.accepted ? { role: result.rankings[0].role, score: result.rankings[0].score, margin: result.margin } : null;
};
