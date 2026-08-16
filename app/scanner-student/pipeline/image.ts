import type { Box } from '../types';

export const clampBox = (box: Box, width: number, height: number): Box => {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(width, Math.ceil(box.x + box.width));
  const bottom = Math.min(height, Math.ceil(box.y + box.height));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
};

export const crop = (image: ImageData, box: Box): ImageData => {
  const b = clampBox(box, image.width, image.height);
  const out = new ImageData(b.width, b.height);
  for (let y = 0; y < b.height; y += 1) {
    const sourceStart = ((b.y + y) * image.width + b.x) * 4;
    out.data.set(image.data.subarray(sourceStart, sourceStart + b.width * 4), y * b.width * 4);
  }
  return out;
};

export const imageDataFromBitmap = (bitmap: ImageBitmap): ImageData => {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas context not available');
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

export const imageDataToCanvas = (image: ImageData): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context not available');
  context.putImageData(image, 0, 0);
  return canvas;
};

export const fractionBox = (reference: Box, values: readonly [number, number, number, number]): Box => ({
  x: reference.x + values[0] * reference.width,
  y: reference.y + values[1] * reference.height,
  width: values[2] * reference.width,
  height: values[3] * reference.height,
});

export const unionBoxes = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
};

export const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === rf) hue = ((gf - bf) / d) % 6;
    else if (max === gf) hue = (bf - rf) / d + 2;
    else hue = (rf - gf) / d + 4;
  }
  hue = ((hue * 60 + 360) % 360) / 2;
  return [hue, max === 0 ? 0 : (d / max) * 255, max * 255];
};

export type Component = Box & { area: number; cx: number; cy: number };

export const connectedComponents = (mask: Uint8Array, width: number, height: number, minArea = 1): Component[] => {
  const seen = new Uint8Array(mask.length);
  const result: Component[] = [];
  const stackX = new Int32Array(mask.length);
  const stackY = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stackX[0] = start % width;
    stackY[0] = Math.floor(start / width);
    seen[start] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (top >= 0) {
      const x = stackX[top];
      const y = stackY[top];
      top -= 1;
      area += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const index = ny * width + nx;
          if (mask[index] && !seen[index]) {
            seen[index] = 1;
            top += 1;
            stackX[top] = nx;
            stackY[top] = ny;
          }
        }
    }
    if (area >= minArea) result.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area, cx: sumX / area, cy: sumY / area });
  }
  return result;
};

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const medianRgb = (image: ImageData): [number, number, number] => {
  const channels = [[], [], []] as number[][];
  for (let i = 0; i < image.data.length; i += 4) {
    channels[0].push(image.data[i]);
    channels[1].push(image.data[i + 1]);
    channels[2].push(image.data[i + 2]);
  }
  return channels.map(median) as [number, number, number];
};
