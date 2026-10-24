import type { Student } from '~/types/data';
import { cdn } from './cdn';
import JsonProcessorWorker from '~/workers/jsonProcessor.worker?worker';

/** Student whose portrait is shown when a profile has no avatar set (display-only; DB stays null). */
export const DEFAULT_AVATAR_STUDENT_ID = 13003;

/** Mirror CSV portrait keys (x10148) under normalized numeric key (10148) for lookups. */
export const normalizePortraitMap = (raw: Record<string, string>): Record<string, string> => {
  const normalized = { ...raw };
  for (const key of Object.keys(raw)) {
    const match = /^x(\d+)$/i.exec(key);
    if (match && !(match[1] in normalized)) normalized[match[1]] = raw[key];
  }
  return normalized;
};

// Module-level singletons: both maps are fetched at most once per page load and shared by
// every consumer (nav avatar, settings picker). Neither is edge-cached.
let portraitMapPromise: Promise<Record<string, string>> | null = null;
let studentMetaPromise: Promise<Record<string, Student>> | null = null;

/** Base64 student portrait map (~3MB). */
export function loadPortraitMap(): Promise<Record<string, string>> {
  portraitMapPromise ??= (async () => {
    const res = await fetch(cdn('/w/students_portrait.json'));
    const raw: Record<string, string> = await res.json();
    return normalizePortraitMap(raw);
  })().catch((err: unknown) => {
    portraitMapPromise = null; // allow a retry on the next call
    throw err;
  });
  return portraitMapPromise;
}

/** Lightweight student metadata (Name / BulletType / ...) from the ~5KB XOR+XZ .bin.
 *  BulletType is locale-independent, so a single fixed locale is fetched for everyone. */
export function loadStudentMeta(): Promise<Record<string, Student>> {
  studentMetaPromise ??= new Promise<Record<string, Student>>((resolve, reject) => {
    const worker = new JsonProcessorWorker();
    worker.onmessage = (e: MessageEvent<{ status: string; data?: Record<string, Student>; error?: string }>) => {
      const { status, data, error } = e.data;
      if (status === 'success' && data) resolve(data);
      else reject(new Error(error ?? 'Worker failed to return student metadata.'));
      worker.terminate();
    };
    worker.onerror = (e: ErrorEvent) => {
      reject(new Error(e.message || 'Worker error'));
      worker.terminate();
    };
    worker.postMessage({ url: cdn('/w/ko.students.bin'), doXor: true });
  }).catch((err: unknown) => {
    studentMetaPromise = null;
    throw err;
  });
  return studentMetaPromise;
}
