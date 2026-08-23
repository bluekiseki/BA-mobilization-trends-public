import { cdn } from '~/utils/cdn';
import { preloadPortraitHistograms } from './pipeline/match';

// StudentPortraitData renders each student on a background, unlike the plain cutout art
// rankByPortrait's histogram comparison expects. Fetch SchaleDB's collection art instead,
// pre-combined into one JSON file so a scan does one fetch instead of one per candidate.
let referencePortraitsPromise: Promise<Record<string, string>> | null = null;

const getReferencePortraits = (): Promise<Record<string, string>> => {
  if (!referencePortraitsPromise) {
    referencePortraitsPromise = fetch(cdn('/student-scanner/reference/student_collection.json')).then((res) => res.json());
  }
  return referencePortraitsPromise;
};

// Fallback path — only reached for a student id missing from the precomputed histogram set
// (e.g. a new SchaleDB student not yet covered by build-reference-portrait-histograms.mjs).
export async function loadReferencePortrait(id: number): Promise<ImageBitmap | null> {
  const portraits = await getReferencePortraits();
  const b64 = portraits[id];
  if (!b64) return null;
  const blob = await (await fetch(`data:image/webp;base64,${b64}`)).blob();
  return createImageBitmap(blob);
}

interface HistogramsFile {
  dim: number;
  keys: string[];
  data: string;
}

let histogramsLoaded = false;

// Loads precomputed portrait histograms and seeds match.ts's cache so rankByPortrait skips
// decode+histogram work. Call once, before scanning starts.
export async function loadPortraitHistograms(): Promise<void> {
  if (histogramsLoaded) return;
  const file: HistogramsFile = await (await fetch(cdn('/student-scanner/reference/student_collection_histograms.json'))).json();
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const flat = new Float32Array(bytes.buffer);
  const entries: [number, Float64Array][] = file.keys.map((key, index) => [Number(key), new Float64Array(flat.subarray(index * file.dim, (index + 1) * file.dim))]);
  preloadPortraitHistograms(entries);
  histogramsLoaded = true;
}
