import { scanStableFrames, prepareVideoCandidates, type VideoProgressMessages } from './pipeline/video';
import { extractStudent } from './pipeline/extract';
import type { StudentRecord, StudentResult } from './types';

export interface StudentScanCallbacks {
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (step: string, percent: number) => void;
  progressMessages: VideoProgressMessages & { analyzingFrame: (current: number, total: number) => string };
  // Fired as soon as each candidate frame finishes, so the caller can update its review table
  // live instead of waiting for the whole video to finish.
  onResult?: (result: StudentResult) => void;
}

// Orchestrates a full video scan: scanStableFrames (0-40%) -> prepareVideoCandidates
// (40-55%) -> extractStudent per remaining candidate (55-100%). Runs as one batch call
// (unlike item scanner's per-file loop) since a single video yields many candidate frames.
export async function processVideo(
  file: File,
  database: StudentRecord[],
  loadPortrait: (id: number) => Promise<ImageBitmap | null>,
  cb: StudentScanCallbacks,
  signal?: AbortSignal,
): Promise<StudentResult[]> {
  cb.onLog('Scanning video for stable frames…');
  const rawCandidates = await scanStableFrames(file, (fraction, detail) => cb.onProgress(detail, fraction * 40), cb.progressMessages, signal);
  cb.onLog(`Found ${rawCandidates.length} candidate frames`);

  cb.onLog('Deduplicating frames and detecting layout…');
  const { candidates, layout } = await prepareVideoCandidates(rawCandidates, (fraction, detail) => cb.onProgress(detail, 40 + fraction * 15), cb.progressMessages);
  cb.onLog(`${candidates.length} unique student frames after dedup${layout ? ` (voted layout, ${layout.votes} votes)` : ' (per-frame layout)'}`);

  const results: StudentResult[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    const candidate = candidates[i];
    try {
      const result = await extractStudent(candidate, database, layout, undefined, loadPortrait);
      results.push(result);
      cb.onResult?.(result);
      cb.onLog(result.student ? `Frame ${i + 1}/${candidates.length}: recognized ${result.student.name}` : `Frame ${i + 1}/${candidates.length}: no confident match (${result.candidates} candidates)`);
    } catch (error) {
      cb.onLog(`Frame ${i + 1}/${candidates.length}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
    cb.onProgress(cb.progressMessages.analyzingFrame(i + 1, candidates.length), 55 + ((i + 1) / candidates.length) * 45);
  }
  return results;
}
