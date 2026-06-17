import { detectCells } from './detector.client';
import { classifyBatch } from './classifier.client';
import { readQuantity, parseQtyString } from './ocr.client';
import type { ImageScanResult, ScanResult } from './types';

interface PipelineCallbacks {
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (step: string, percent: number) => void;
}

export async function processFile(file: File, cb: PipelineCallbacks): Promise<ImageScanResult> {
  const { onLog, onProgress } = cb;

  onLog(`Processing ${file.name}…`);
  onProgress('Decoding image…', 0);

  const objectUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  onLog(`Image size: ${bitmap.width}×${bitmap.height}`);

  onProgress('Detecting cells…', 20);
  const cells = await detectCells(bitmap);
  onLog(`Detected ${cells.length} cells`);

  onProgress('Classifying icons…', 50);
  const classifications = await classifyBatch(bitmap, cells);

  onProgress('Reading quantities…', 75);
  const results: ScanResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const { icon, similarity } = classifications[i];

    const rawQty = await readQuantity(bitmap, cell);
    const quantity = parseQtyString(rawQty);

    if (icon) {
      onLog(`  ${icon.name}: qty=${quantity} (sim=${similarity.toFixed(3)})`);
    } else {
      onLog(`  [unknown] sim=${similarity.toFixed(3)}`, 'warn');
    }

    results.push({ cell, icon, similarity, quantity });
  }

  bitmap.close();
  onProgress('Done', 100);
  onLog(`Done: ${results.filter((r) => r.icon).length}/${results.length} recognized`);

  return { fileName: file.name, objectUrl, results };
}
