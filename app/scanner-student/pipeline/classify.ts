import { connectedComponents, crop, medianRgb, rgbToHsv } from './image';
import type { Box, Circle } from '../types';

const TYPE_REFS: [string, [number, number, number]][] = [
  ['red', [0x93, 0x00, 0x08]],
  ['gold', [0xbe, 0x88, 0x01]],
  ['blue', [0x22, 0x6f, 0x9d]],
  ['blue', [0x39, 0x6d, 0x99]],
  ['purple', [0x9b, 0x46, 0xa9]],
  ['teal', [0x13, 0x79, 0x74]],
];
const BULLET: Record<string, string> = { red: 'Explosion', gold: 'Pierce', blue: 'Mystic', purple: 'Sonic', teal: 'Chemical' };
const ARMOR: Record<string, string> = { red: 'LightArmor', gold: 'HeavyArmor', blue: 'Unarmed', purple: 'ElasticArmor', teal: 'CompositeArmor' };
// matchStudents' grade() only ever produces D/B/A from the raw adaptation value — no S tier
// exists in this pipeline's matching logic, so a reference color for it would only ever steal
// a classification away from the correct D/B/A grade.
const TERRAIN: [string, [number, number, number]][] = [
  ['D', [0xff, 0x86, 0x7c]],
  ['D', [0xf4, 0x8b, 0x7c]],
  ['D', [0xfd, 0x83, 0x77]],
  ['B', [0xf8, 0xea, 0x67]],
  ['B', [0xfe, 0xe7, 0x54]],
  ['A', [0xb7, 0xef, 0x96]],
];

const nearestTypeColor = (image: ImageData) => {
  const rgb = medianRgb(image);
  return TYPE_REFS.reduce(
    (best, current) => (Math.hypot(...current[1].map((v, i) => v - rgb[i])) < best.distance ? { label: current[0], distance: Math.hypot(...current[1].map((v, i) => v - rgb[i])) } : best),
    { label: '', distance: Infinity },
  ).label;
};

export const classifyBullet = (image: ImageData, box: Box) => BULLET[nearestTypeColor(crop(image, box))];
export const classifyArmor = (image: ImageData, box: Box) => ARMOR[nearestTypeColor(crop(image, box))];

export const classifySquad = (image: ImageData): 'Main' | 'Support' => {
  let r = 0;
  let b = 0;
  const count = image.width * image.height;
  for (let i = 0; i < image.data.length; i += 4) {
    r += image.data[i];
    b += image.data[i + 2];
  }
  return r / count > b / count ? 'Main' : 'Support';
};

export const classifyTerrain = (image: ImageData, circle: Circle): string => {
  // Exact equivalent of Python's:
  // crop[int(cy-r):int(cy-r)+int(2r), int(cx-r):int(cx-r)+int(2r)]
  // followed by the central half of that crop.
  const diameter = Math.trunc(circle.radius * 2);
  const circleCrop = crop(image, { x: Math.trunc(circle.x - circle.radius), y: Math.trunc(circle.y - circle.radius), width: diameter, height: diameter });
  const half = Math.max(1, Math.floor(Math.min(circleCrop.width, circleCrop.height) / 4));
  const center = crop(circleCrop, { x: Math.floor(circleCrop.width / 2) - half, y: Math.floor(circleCrop.height / 2) - half, width: half * 2, height: half * 2 });
  let rgb: [number, number, number] = [0, 0, 0];
  const count = Math.max(1, center.width * center.height);
  for (let i = 0; i < center.data.length; i += 4) {
    rgb = [rgb[0] + center.data[i] / count, rgb[1] + center.data[i + 1] / count, rgb[2] + center.data[i + 2] / count];
  }
  return TERRAIN.reduce(
    (best, current) => {
      const distance = Math.hypot(...current[1].map((value, index) => value - rgb[index]));
      return distance < best.distance ? { label: current[0], distance } : best;
    },
    { label: '', distance: Infinity },
  ).label;
};

export const countStars = (image: ImageData, box: Box, blue = false): number => {
  const target = crop(image, box);
  const mask = new Uint8Array(target.width * target.height);
  for (let p = 0; p < mask.length; p += 1) {
    const i = p * 4;
    const [h, s, v] = rgbToHsv(target.data[i], target.data[i + 1], target.data[i + 2]);
    const inside = blue ? h >= 85 && h <= 110 : h >= 15 && h <= 60;
    if (inside && s > 50 && v > 100) mask[p] = 1;
  }
  const biggest = connectedComponents(mask, target.width, target.height).sort((a, b) => b.area - a.area)[0];
  return biggest ? Math.max(0, Math.min(5, Math.round(biggest.width / (target.width / 5)))) : 0;
};

// The game has no "defense" potential-release stat — confirmed, not a guess (see GROWTHPLAN_MAPPING.md).
// This detector still splits the stat box into a naive 2x2 grid, so whatever lands in the
// bottom-left quadrant gets labeled 'defense'; that's misdetected noise or a misplaced 'heal'
// badge, not a real 4th stat. Needs recalibration against real screenshots to find the true
// 3-badge layout — until then, 'defense' output must be treated as spurious by every caller.
export const findPotentialBadges = (stat: ImageData): { quadrant: 'hp' | 'attack' | 'defense' | 'heal'; image: ImageData; box: Box }[] => {
  const mask = new Uint8Array(stat.width * stat.height);
  for (let p = 0; p < mask.length; p += 1) {
    const i = p * 4;
    if (Math.hypot(stat.data[i] - 0x42, stat.data[i + 1] - 0x66, stat.data[i + 2] - 0x94) < 25) mask[p] = 1;
  }
  // Python's 200px threshold was calibrated on a roughly 969x229 stat box.
  // Browser candidates are resized to at most 1280px wide, so preserve the
  // same normalized component area instead of requiring 200 resized pixels.
  const minimumArea = Math.max(20, Math.round(stat.width * stat.height * (200 / (969 * 229))));
  return connectedComponents(mask, stat.width, stat.height, minimumArea).map((component) => ({
    quadrant: component.cx < stat.width / 2 ? (component.cy < stat.height / 2 ? 'hp' : 'defense') : component.cy < stat.height / 2 ? 'attack' : 'heal',
    image: crop(stat, component),
    box: { x: component.x, y: component.y, width: component.width, height: component.height },
  }));
};
