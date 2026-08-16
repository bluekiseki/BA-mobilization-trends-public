import { connectedComponents, median } from './image';
import type { Anchors, Box, Circle, FixedLayout } from '../types';

const BADGE_RGB = ['930008', '226f9d', '396d99', '137974', 'be8801', '9b46a9'].map((hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4), 16)]);

const iou = (a: Box, b: Box) => {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
};

export const findMoodCircles = (image: ImageData, armorBadge: Box): Circle[] => {
  const { width, height, data } = image;
  const sx0 = Math.floor(armorBadge.x + armorBadge.width);
  const sx1 = Math.min(width, Math.floor(armorBadge.x + armorBadge.width * 2.75));
  const centerY = armorBadge.y + armorBadge.height / 2;
  const sy0 = Math.max(0, Math.floor(centerY - armorBadge.height * 0.75));
  const sy1 = Math.min(height, Math.floor(centerY + armorBadge.height * 0.75));
  const searchWidth = sx1 - sx0;
  const searchHeight = sy1 - sy0;
  if (searchWidth <= 0 || searchHeight <= 0) return [];

  const gray = new Float32Array(searchWidth * searchHeight);
  for (let y = 0; y < searchHeight; y += 1)
    for (let x = 0; x < searchWidth; x += 1) {
      const source = ((sy0 + y) * width + sx0 + x) * 4;
      gray[y * searchWidth + x] = data[source] * 0.299 + data[source + 1] * 0.587 + data[source + 2] * 0.114;
    }
  // Python uses medianBlur(..., 5) before HoughCircles. The search area is
  // tiny, so an exact 5x5 median is inexpensive here.
  const blurred = new Float32Array(gray.length);
  const window: number[] = [];
  for (let y = 0; y < searchHeight; y += 1)
    for (let x = 0; x < searchWidth; x += 1) {
      window.length = 0;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1) {
          const px = Math.max(0, Math.min(searchWidth - 1, x + dx));
          const py = Math.max(0, Math.min(searchHeight - 1, y + dy));
          window.push(gray[py * searchWidth + px]);
        }
      window.sort((a, b) => a - b);
      blurred[y * searchWidth + x] = window[12];
    }

  const gx = new Float32Array(gray.length);
  const gy = new Float32Array(gray.length);
  for (let y = 1; y < searchHeight - 1; y += 1)
    for (let x = 1; x < searchWidth - 1; x += 1) {
      const top = (y - 1) * searchWidth;
      const middle = y * searchWidth;
      const bottom = (y + 1) * searchWidth;
      gx[middle + x] = -blurred[top + x - 1] + blurred[top + x + 1] - 2 * blurred[middle + x - 1] + 2 * blurred[middle + x + 1] - blurred[bottom + x - 1] + blurred[bottom + x + 1];
      gy[middle + x] = -blurred[top + x - 1] - 2 * blurred[top + x] - blurred[top + x + 1] + blurred[bottom + x - 1] + 2 * blurred[bottom + x] + blurred[bottom + x + 1];
    }

  const radiusLow = Math.max(3, Math.floor(armorBadge.height * 0.45));
  const radiusHigh = Math.max(radiusLow + 2, Math.floor(armorBadge.height * 0.55));
  const accumulators = Array.from({ length: radiusHigh - radiusLow + 1 }, () => new Uint16Array(gray.length));
  for (let y = 1; y < searchHeight - 1; y += 1)
    for (let x = 1; x < searchWidth - 1; x += 1) {
      const index = y * searchWidth + x;
      const magnitude = Math.hypot(gx[index], gy[index]);
      if (magnitude <= 80) continue;
      const ux = gx[index] / magnitude;
      const uy = gy[index] / magnitude;
      for (let radius = radiusLow; radius <= radiusHigh; radius += 1)
        for (const direction of [-1, 1]) {
          const cx = Math.round(x + direction * ux * radius);
          const cy = Math.round(y + direction * uy * radius);
          if (cx < radius || cy < radius || cx >= searchWidth - radius || cy >= searchHeight - radius) continue;
          accumulators[radius - radiusLow][cy * searchWidth + cx] += 1;
        }
    }

  const candidates: { score: number; x: number; y: number; radius: number }[] = [];
  accumulators.forEach((accumulator, radiusIndex) => {
    const radius = radiusLow + radiusIndex;
    for (let index = 0; index < accumulator.length; index += 1)
      if (accumulator[index] >= 6) {
        candidates.push({ score: accumulator[index], x: index % searchWidth, y: Math.floor(index / searchWidth), radius });
      }
  });
  candidates.sort((a, b) => b.score - a.score);
  const kept: typeof candidates = [];
  const minimumDistance = radiusLow * 1.3;
  for (const candidate of candidates) {
    if (kept.some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < minimumDistance)) continue;
    kept.push(candidate);
    if (kept.length === 3) break;
  }
  return kept.map((circle) => ({ x: sx0 + circle.x, y: sy0 + circle.y, radius: circle.radius })).sort((a, b) => a.x - b.x);
};

export const locateAnchors = (image: ImageData): Anchors | null => {
  const { width, height, data } = image;
  const y0 = Math.floor(height * 0.5);
  const searchWidth = Math.floor(width * 0.5);
  const searchHeight = height - y0;
  const candidates: (Box & { area: number })[] = [];
  for (const ref of BADGE_RGB) {
    const mask = new Uint8Array(searchWidth * searchHeight);
    for (let y = 0; y < searchHeight; y += 1)
      for (let x = 0; x < searchWidth; x += 1) {
        const source = ((y + y0) * width + x) * 4;
        const distance = Math.hypot(data[source] - ref[0], data[source + 1] - ref[1], data[source + 2] - ref[2]);
        if (distance < 35) mask[y * searchWidth + x] = 1;
      }
    for (const component of connectedComponents(mask, searchWidth, searchHeight, 150)) {
      const aspect = component.width / component.height;
      if (aspect < 2.3 || aspect > 3.5 || component.area / (component.width * component.height) < 0.5) continue;
      const box = { x: component.x, y: component.y + y0, width: component.width, height: component.height, area: component.area };
      const cx = (box.x + box.width / 2) / width;
      const cy = (box.y + box.height / 2) / height;
      if (cx >= 0.05 && cx <= 0.3 && cy >= 0.75) candidates.push(box);
    }
  }
  candidates.sort((a, b) => b.area - a.area);
  const kept = candidates
    .filter((box, index, all) => !all.slice(0, index).some((other) => iou(box, other) > 0.3))
    .slice(0, 2)
    .sort((a, b) => a.y - b.y);
  if (kept.length < 2) return null;
  const [damageBadge, armorBadge] = kept;
  const moodCircles = findMoodCircles(image, armorBadge);
  if (moodCircles.length !== 3) return null;
  return { damageBadge, armorBadge, moodCircles };
};

export const locatePanelBorders = (image: ImageData): [number, number] | null => {
  const { width, height, data } = image;
  const y0 = Math.floor(height * 0.15);
  const y1 = Math.floor(height * 0.5);
  const white = new Float32Array(width);
  const border = new Float32Array(width);
  const rows = y1 - y0;
  for (let y = y0; y < y1; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      white[x] += 1 / (Math.hypot(r - 255, g - 255, b - 255) + 1) / rows;
      border[x] += 1 / (Math.hypot(r - 212, g - 233, b - 241) + 1) / rows;
    }
  const find = (lo: number, hi: number, rightward: boolean) => {
    let best = -1;
    let bestScore = -Infinity;
    for (let x = lo; x < hi; x += 1) {
      let interior = 0;
      const from = rightward ? x + 2 : Math.max(0, x - 14);
      const to = rightward ? Math.min(width, x + 14) : x - 2;
      for (let j = from; j < to; j += 1) interior = Math.max(interior, white[j]);
      const score = border[x] + interior;
      if (score > bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  };
  const left = find(Math.floor(width * 0.35), Math.floor(width * 0.7), true);
  const right = find(Math.floor(width * 0.8), Math.floor(width * 0.97), false);
  return left < 0 ? null : [left, right < 0 ? Math.floor(width * 0.98) : right];
};

const medianBox = (boxes: Box[]): Box => ({
  x: Math.trunc(median(boxes.map((b) => b.x))),
  y: Math.trunc(median(boxes.map((b) => b.y))),
  width: Math.trunc(median(boxes.map((b) => b.width))),
  height: Math.trunc(median(boxes.map((b) => b.height))),
});

export const voteFixedLayout = (samples: ImageData[], minVotes = 3): FixedLayout | null => {
  const detections = samples.map((image) => ({ anchors: locateAnchors(image), borders: locatePanelBorders(image) }));
  // Match Python vote_fixed_layout exactly: anchor and border votes are
  // independent, so a frame may contribute successfully to only one pool.
  const anchorVotes = detections.map((entry) => entry.anchors).filter((anchors): anchors is Anchors => anchors !== null);
  const borderVotes = detections.map((entry) => entry.borders).filter((borders): borders is [number, number] => borders !== null);
  if (anchorVotes.length < minVotes || borderVotes.length < minVotes) return null;
  const damageBadge = medianBox(anchorVotes.map((anchors) => anchors.damageBadge));
  const armorBadge = medianBox(anchorVotes.map((anchors) => anchors.armorBadge));
  return {
    anchors: {
      damageBadge,
      armorBadge,
      moodCircles: [0, 1, 2].map((index) => ({
        x: median(anchorVotes.map((anchors) => anchors.moodCircles[index].x)),
        y: median(anchorVotes.map((anchors) => anchors.moodCircles[index].y)),
        radius: median(anchorVotes.map((anchors) => anchors.moodCircles[index].radius)),
      })),
    },
    panelBorders: [Math.trunc(median(borderVotes.map((borders) => borders[0]))), Math.trunc(median(borderVotes.map((borders) => borders[1])))],
    votes: Math.min(anchorVotes.length, borderVotes.length),
  };
};

export const tenSegmentSampleIndices = (length: number, segments = 10): number[] => {
  if (length <= 0) return [];
  const chunk = Math.max(1, Math.floor(length / segments));
  const result: number[] = [];
  for (let index = 0; index < length; index += chunk) result.push(index);
  return result;
};
