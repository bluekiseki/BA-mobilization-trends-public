import { cdn } from '~/utils/cdn';
import { videoDumpURL } from '~/data/livedataServer.json';
import type { VideoEntry, VideoOrigin } from './types';
import { combineScopes, findJpReference, mergeVideoLists, parseLegacyVideos, parseRaidLinks, parseRemoteFile, parseUnifiedVideos, toDataServer, type RaidLink, type WebServer } from './videoMerge';

export type RemoteStatus = 'loading' | 'ok' | 'failed';

export interface MergedVideoState {
  videos: VideoEntry[];
  remote: RemoteStatus;
  /** JP season whose videos are shown as reference for this GL season, if linked. */
  referenceRaidId: string | null;
  /** True once every source settled. Partial results are emitted earlier. */
  done: boolean;
}

// Every source is a static file: local results on the CDN, the remote dump in its own public bucket.
// Nothing here reaches a backend Worker, D1 or YouTube.
async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json().then((doc: unknown) => doc);
}

/** A missing or unreadable optional file is simply "no data". */
const optional = (url: string, signal: AbortSignal): Promise<unknown> => getJson(url, signal).catch(() => null);

interface Season {
  videos: VideoEntry[];
  links: RaidLink[];
  remoteFailed: boolean;
}

async function loadSeason(origin: VideoOrigin, signal: AbortSignal, withRemote: boolean): Promise<Season> {
  const server = toDataServer(origin.server);
  const [local, legacy, remote] = await Promise.all([
    optional(cdn(`/video/${server}-${origin.raidId}.json`), signal),
    // Per-season files from before the merge existed are JP only.
    server === 'jp' ? optional(cdn(`/video/raid-jp-${origin.raidId}.json`), signal) : Promise.resolve(null),
    withRemote && videoDumpURL
      ? getJson(`${videoDumpURL}/${server}-${origin.raidId}.json`, signal).then(
          (doc) => ({ doc, failed: false }),
          () => ({ doc: null, failed: true }),
        )
      : Promise.resolve({ doc: null, failed: false }),
  ]);
  // The newest local run goes first so it wins over older per-season files for the same video.
  const localVideos = mergeVideoLists(parseUnifiedVideos(local, origin), parseLegacyVideos(legacy, origin));
  return { videos: mergeVideoLists(localVideos, parseRemoteFile(remote.doc, origin)), links: parseRaidLinks(local), remoteFailed: remote.failed };
}

/**
 * Loads the local season file, the legacy file and the remote dump in parallel and emits as soon as
 * any of them is usable. A superseded call must be aborted: its emits are ignored.
 */
export async function loadMergedVideos(server: WebServer, raidId: string, signal: AbortSignal, emit: (state: MergedVideoState) => void): Promise<void> {
  const origin: VideoOrigin = { server, raidId };
  const state: MergedVideoState = { videos: [], remote: 'loading', referenceRaidId: null, done: false };
  const publish = (patch: Partial<MergedVideoState>) => {
    Object.assign(state, patch);
    if (!signal.aborted) emit({ ...state });
  };

  // The season itself is shown first; the JP reference season is added once the link is known.
  const [current, remoteRaids] = await Promise.all([loadSeason(origin, signal, true), server === 'kr' && videoDumpURL ? optional(`${videoDumpURL}/raids.json`, signal) : Promise.resolve(null)]);
  publish({ videos: current.videos, remote: current.remoteFailed ? 'failed' : 'ok' });

  const referenceId = server === 'kr' ? findJpReference([...current.links, ...parseRaidLinks(remoteRaids)], raidId) : null;
  if (!referenceId || signal.aborted) {
    publish({ done: true });
    return;
  }
  const reference = await loadSeason({ server: 'jp', raidId: referenceId }, signal, false);
  publish({ videos: combineScopes(current.videos, reference.videos), referenceRaidId: referenceId, done: true });
}
