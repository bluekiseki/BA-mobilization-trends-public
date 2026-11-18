import type { CellBbox } from './geometry';
import type { VideoReplay, VideoScanMetrics } from '../video/types';

/** Anything the scanner can read pixels from: a decoded still, or a canvas produced by a video decoder. */
export type FrameSource = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

export interface IconEntry {
  inventoryKey: string; // "Item_5001", "Equipment_1", "Currency_1"
  name: string; // NameEn — kept for logging / non-UI use
  localizeEtc: { NameEn: string; NameKr: string; NameJp: string; NameTw?: string };
  dataUrl: string;
  isGift: boolean; // ItemCategory === 6
  itemCategory?: number; // raw ItemCategory from icon_info (2 = eleph, 3 = materials incl. OOParts)
  numericId: string; // "5001" — used as ownedGifts key when isGift
}

export interface ScanResult {
  cell: CellBbox;
  icon: IconEntry | null;
  similarity: number; // icon classifier confidence — how sure the model is this is the matched item
  quantity: number;
  quantityConfidence: number; // OCR confidence for the read quantity text — independent of `similarity`
  /** Video scans only: id of the reconstructed grid cell, used to find the cell on the replay frames. */
  cellId?: string;
  /** Video scans only: whether the cell's observations across frames agreed on kind and quantity. */
  videoStatus?: 'confirmed' | 'uncertain';
}

export interface ImageScanResult {
  kind: 'image';
  id: string; // stable per-image identity — fileName alone isn't unique across re-uploads
  fileName: string;
  objectUrl: string; // URL.createObjectURL — for visual comparison in UI
  results: ScanResult[];
}

/** One scanned inventory scroll video; each reconstructed cell is one `ScanResult` so confirm/edit state works as for images. */
export interface VideoScanResult {
  kind: 'video';
  id: string;
  fileName: string;
  objectUrl: string; // URL.createObjectURL of the video file, played back with the overlay
  results: ScanResult[];
  video: VideoReplay;
  metrics: VideoScanMetrics;
}

/** A listed scan: a still image or a video. Both expose `id`, `fileName`, `objectUrl` and `results`. */
export type ScanEntry = ImageScanResult | VideoScanResult;

export type AggregatedScan = Record<string, number>; // inventoryKey → summed qty

/** Identifies one detected cell within one scanned image — confirm/edit state is tracked per instance, not per item type. */
export function makeInstanceKey(imageId: string, index: number): string {
  return `${imageId}::${index}`;
}

export interface ComparisonRow {
  inventoryKey: string;
  icon: IconEntry | null;
  current: number; // from materialInventory or ownedGifts
  scanned: number; // maximum per-file sum of confirmed quantities, including instance edits
  edited: number; // aggregated quantity before an optional final table override
  confidence: number; // max similarity score across all detections (0–1)
  duplicates?: { parts: number[]; mode: 'sum' | 'max' }; // set when the item was confirmed on several cells of the winning file
  confirmed: boolean; // true when at least one instance of this item has been confirmed
}

export type ModelLoadPhase = 'idle' | 'consenting' | 'loading' | 'ready' | 'error';

export type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';

export interface LogEntry {
  time: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
