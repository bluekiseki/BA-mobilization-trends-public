import { useEffect, useState } from 'react';
import { loadMergedVideos, type MergedVideoState } from './videoLoader';
import type { WebServer } from './videoMerge';

const EMPTY: MergedVideoState = { videos: [], remote: 'loading', referenceRaidId: null, done: false };

/** Shared by the video list and the composition video search so both show the same set. */
export function useMergedVideos(server: WebServer, raidId: string): MergedVideoState & { loaded: boolean } {
  const [result, setResult] = useState<{ key: string; state: MergedVideoState }>({ key: '', state: EMPTY });
  const key = `${server}:${raidId}`;

  useEffect(() => {
    const controller = new AbortController();
    // Results are tagged with their key, so a late response for a previous season can never be shown.
    loadMergedVideos(server, raidId, controller.signal, (state) => setResult({ key, state })).catch(() => {
      if (!controller.signal.aborted) setResult({ key, state: { ...EMPTY, remote: 'failed', done: true } });
    });
    return () => controller.abort();
  }, [server, raidId, key]);

  const state = result.key === key ? result.state : EMPTY;
  return { ...state, loaded: result.key === key && (state.videos.length > 0 || state.done) };
}
