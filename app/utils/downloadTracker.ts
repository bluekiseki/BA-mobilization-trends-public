import type { DownloadProgress } from './fetchWithProgress';

interface TrackedDownload {
  estimate: number;
  loaded: number;
  // Best known total: the estimate until a real Content-Length (or a larger loaded count) is seen.
  total: number;
  done: boolean;
}

export interface DownloadTracker {
  // Returns a progress callback to hand to fetchWithProgress / a loader's onProgress param.
  report(key: string): (progress: DownloadProgress) => void;
  // Marks a download fully complete — for loaders whose byte stream we cannot observe.
  settle(key: string): void;
}

// Aggregates several concurrent downloads into a single integer percent within
// [bandStart, bandEnd]. Downloads without a Content-Length fall back to an estimated size so
// the bar still advances; the estimate is replaced as soon as the real total is known.
// onPercent fires only when the mapped integer percent changes, to avoid excess re-renders.
export function createDownloadTracker(estimates: Record<string, number>, bandStart: number, bandEnd: number, onPercent: (percent: number) => void): DownloadTracker {
  const downloads = new Map<string, TrackedDownload>();
  for (const [key, estimate] of Object.entries(estimates)) {
    downloads.set(key, { estimate, loaded: 0, total: estimate, done: false });
  }
  let lastPercent = -1;

  const emit = (): void => {
    let sumLoaded = 0;
    let sumTotal = 0;
    for (const entry of downloads.values()) {
      sumLoaded += entry.done ? entry.total : Math.min(entry.loaded, entry.total);
      sumTotal += entry.total;
    }
    const fraction = sumTotal > 0 ? Math.min(1, sumLoaded / sumTotal) : 0;
    const percent = Math.round(bandStart + fraction * (bandEnd - bandStart));
    if (percent !== lastPercent) {
      lastPercent = percent;
      onPercent(percent);
    }
  };

  const get = (key: string): TrackedDownload => {
    const entry = downloads.get(key);
    if (!entry) throw new Error(`Unknown download key: ${key}`);
    return entry;
  };

  return {
    report(key) {
      const entry = get(key);
      return (progress) => {
        // Content-Length reports the compressed size while the stream yields decompressed
        // bytes, so loaded can exceed it — never let total fall below what we've received.
        const declared = progress.total ?? entry.estimate;
        entry.total = Math.max(declared, progress.loaded, 1);
        entry.loaded = progress.loaded;
        emit();
      };
    },
    settle(key) {
      const entry = get(key);
      entry.done = true;
      emit();
    },
  };
}
