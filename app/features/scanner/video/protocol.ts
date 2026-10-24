import type { PreviewFrame, VideoLogLevel, VideoScanOutput } from './types';

export type WorkerRequest =
  | { id: number; action: 'init' }
  | { id: number; action: 'video'; file: File }
  | { id: number; action: 'compat-start' }
  | { id: number; action: 'compat-frame'; bitmap: ImageBitmap; time: number; index: number }
  | { id: number; action: 'compat-finish'; duration: number }
  | { id: number; action: 'cancel' };

export type WorkerEvent =
  { id: number; event: 'log'; message: string; level?: VideoLogLevel } | { id: number; event: 'progress'; percent: number; step: string } | { id: number; event: 'preview'; frame: PreviewFrame };

export interface WorkerError {
  message: string;
  name: string;
  code?: string;
}

export type WorkerResponse = WorkerEvent | { id: number; result: VideoScanOutput | null } | { id: number; error: WorkerError };
