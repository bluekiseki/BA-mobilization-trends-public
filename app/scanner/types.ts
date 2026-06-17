export interface CellBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IconEntry {
  inventoryKey: string; // "Item_5001", "Equipment_1", "Currency_1"
  name: string; // NameEn — kept for logging / non-UI use
  localizeEtc: { NameEn: string; NameKr: string; NameJp: string; NameTw?: string };
  dataUrl: string;
  isGift: boolean; // ItemCategory === 6
  numericId: string; // "5001" — used as ownedGifts key when isGift
}

export interface ScanResult {
  cell: CellBbox;
  icon: IconEntry | null;
  similarity: number;
  quantity: number;
}

export interface ImageScanResult {
  fileName: string;
  objectUrl: string; // URL.createObjectURL — for visual comparison in UI
  results: ScanResult[];
}

export type AggregatedScan = Record<string, number>; // inventoryKey → summed qty

export interface ComparisonRow {
  inventoryKey: string;
  icon: IconEntry | null;
  current: number; // from materialInventory or ownedGifts
  scanned: number;
  edited: number; // user-editable override
  confidence: number; // max similarity score across all detections (0–1)
}

export type ModelLoadPhase = 'idle' | 'consenting' | 'loading' | 'ready' | 'error';

export type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';

export interface LogEntry {
  time: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}
