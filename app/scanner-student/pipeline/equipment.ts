import { classifyBatch } from '~/scanner/classifier.client';
import type { CellBbox, IconEntry } from '~/scanner/types';
import { equipmentId } from '~/data/growthData';
import { imageDataToCanvas } from './image';

export type EquipmentPrediction = { type: string; score: number };

// Equipment pieces are inventory items (Equipment_<id>) already covered by the item scanner's embedding classifier, so this reuses that model instead of loading a second one.
const idToCategory = new Map<number, string>();
for (const [category, ids] of Object.entries(equipmentId)) for (const id of ids) idToCategory.set(id, category);

const resolveCategory = (icon: IconEntry | null): string => {
  if (!icon) return '?';
  const id = Number(icon.inventoryKey.split('_')[1]);
  return idToCategory.get(id) ?? '?';
};

const toImageBitmap = async (image: ImageData): Promise<ImageBitmap> => {
  const canvas = imageDataToCanvas(image);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) throw new Error('Failed to encode equipment crop for classification');
  return createImageBitmap(blob);
};

export const classifyEquipmentTypesBatch = async (images: ImageData[]): Promise<EquipmentPrediction[]> => {
  if (!images.length) return [];
  const results: EquipmentPrediction[] = [];
  for (const image of images) {
    const bitmap = await toImageBitmap(image);
    const cell: CellBbox = { x: 0, y: 0, w: image.width, h: image.height };
    const [{ icon, similarity }] = await classifyBatch(bitmap, [cell]);
    bitmap.close();
    results.push({ type: resolveCategory(icon), score: similarity });
  }
  return results;
};
