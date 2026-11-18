import { scanStableFrames, detectVideoLayout, computeCandidateSignature, isDuplicateSignature, loadImageData, type VideoProgressMessages } from './pipeline/video';
import { extractStudent, extractStudentFromImage } from './pipeline/extract';
import { locateAnchors } from './pipeline/layout';
import type { CandidateFrame, StudentRecord, StudentResult } from './types';

export interface StudentScanCallbacks {
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (step: string, percent: number) => void;
  progressMessages: VideoProgressMessages & {
    analyzingFrame: (current: number, total: number) => string;
    analyzingImage: (current: number, total: number) => string;
  };
  // Fired as soon as each candidate frame finishes, so the caller can update its review table
  // live instead of waiting for the whole video to finish.
  onResult?: (result: StudentResult) => void;
}

type LoadPortrait = (id: number) => Promise<ImageBitmap | null>;

// Shared shape so the caller can pick a runner (video vs. screenshots) at runtime.
export type BatchScanRunner = (files: File[], database: StudentRecord[], loadPortrait: LoadPortrait, cb: StudentScanCallbacks, signal?: AbortSignal) => Promise<StudentResult[]>;

// Scan stable frames (0-40%), detect layout (40-43%), then deduplicate and extract (43-100%).
// Keep the last frame of each duplicate run and reuse its decoded image for extraction.
export async function processVideo(file: File, database: StudentRecord[], loadPortrait: LoadPortrait, cb: StudentScanCallbacks, signal?: AbortSignal): Promise<StudentResult[]> {
  cb.onLog('Scanning video for stable frames…');
  const rawCandidates = await scanStableFrames(file, (fraction, detail) => cb.onProgress(detail, fraction * 40), cb.progressMessages, signal);
  cb.onLog(`Found ${rawCandidates.length} candidate frames`);

  cb.onLog('Detecting layout…');
  const layout = await detectVideoLayout(rawCandidates, (fraction, detail) => cb.onProgress(detail, 40 + fraction * 3), cb.progressMessages);
  cb.onLog(layout ? `Voted layout (${layout.votes} votes)` : 'No stable layout found — falling back to per-frame detection');

  const results: StudentResult[] = [];
  let rejected = 0;
  let kept = 0;

  type Pending = { candidate: CandidateFrame; image: ImageData; signature: Uint8Array; rawIndex: number };
  let pending: Pending | null = null;

  const flushPending = async () => {
    if (!pending) return;
    kept += 1;
    const label = `Frame ${pending.rawIndex + 1}/${rawCandidates.length}`;
    try {
      const result = await extractStudentFromImage(pending.image, pending.candidate, database, layout, undefined, loadPortrait);
      results.push(result);
      cb.onResult?.(result);
      cb.onLog(result.student ? `${label}: recognized ${result.student.name}` : `${label}: no confident match (${result.candidates} candidates)`);
    } catch (error) {
      cb.onLog(`${label}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
  };

  for (let i = 0; i < rawCandidates.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    const candidate = rawCandidates[i];
    const image = await loadImageData(candidate.blob);
    const anchors = layout?.anchors ?? locateAnchors(image);
    // A motionless loading/title frame is stable too but not a student page — when layout voting
    // falls back to per-frame detection, exclude such frames here instead of aborting the run.
    if (!anchors) {
      rejected += 1;
      cb.onProgress(cb.progressMessages.deduplicateRejected(rejected, i + 1, rawCandidates.length), 43 + ((i + 1) / rawCandidates.length) * 57);
      continue;
    }
    const signature = computeCandidateSignature(image, anchors);
    if (!pending || !isDuplicateSignature(pending.signature, signature)) await flushPending();
    pending = { candidate, image, signature, rawIndex: i };
    cb.onProgress(cb.progressMessages.deduplicate(i + 1, rawCandidates.length), 43 + ((i + 1) / rawCandidates.length) * 57);
  }
  await flushPending();

  cb.onLog(`${kept} unique student frames after dedup${layout ? ` (voted layout, ${layout.votes} votes)` : ' (per-frame layout)'}`);
  return results;
}

// Screenshot scan: no frame extraction / dedup / layout voting — each file is fed straight
// to extractStudent with per-frame layout detection (layout = null). One bad screenshot
// (e.g. not a profile screen) is logged as a warning and skipped, not fatal to the batch;
// mergeReviewRow on the caller side deduplicates the same student across multiple shots.
export const processImages: BatchScanRunner = async (files, database, loadPortrait, cb, signal) => {
  const results: StudentResult[] = [];
  for (let i = 0; i < files.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    cb.onProgress(cb.progressMessages.analyzingImage(i + 1, files.length), (i / files.length) * 100);
    const candidate: CandidateFrame = { frameIndex: i, time: i, blob: files[i] };
    try {
      const result = await extractStudent(candidate, database, null, undefined, loadPortrait);
      results.push(result);
      cb.onResult?.(result);
      cb.onLog(result.student ? `Screenshot ${i + 1}/${files.length}: recognized ${result.student.name}` : `Screenshot ${i + 1}/${files.length}: no confident match (${result.candidates} candidates)`);
    } catch (error) {
      cb.onLog(`Screenshot ${i + 1}/${files.length}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
  }
  cb.onProgress(cb.progressMessages.analyzingImage(files.length, files.length), 100);
  return results;
};

// Adapts processVideo (single file) to the BatchScanRunner shape.
export const processVideoBatch: BatchScanRunner = (files, database, loadPortrait, cb, signal) => processVideo(files[0], database, loadPortrait, cb, signal);
