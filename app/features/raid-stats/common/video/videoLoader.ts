import { cdn } from '~/utils/cdn';
import { videoDumpURL } from '~/data/livedataServer.json';
import type { VideoEntry, VideoOrigin } from './types';
import { combineScopes, findLinkedSeasons, mergeVideoLists, parseLegacyVideos, parseRaidLinks, parseRemoteFile, parseUnifiedVideos, toDataServer, type RaidLink, type WebServer } from './videoMerge';

export type RemoteStatus = 'loading' | 'ok' | 'failed';

export interface MergedVideoState {
  videos: VideoEntry[];
  remote: RemoteStatus;
  /** First linked season, if any. Linked videos retain their own server and season. */
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
    // Existing per-season files may be legacy arrays or unified documents on either server.
    optional(cdn(`/video/raid-${server}-${origin.raidId}.json`), signal),
    withRemote && videoDumpURL
      ? getJson(`${videoDumpURL}/${server}-${origin.raidId}.json`, signal).then(
          (doc) => ({ doc, failed: false }),
          () => ({ doc: null, failed: true }),
        )
      : Promise.resolve({ doc: null, failed: false }),
  ]);
  // The newest local run goes first so it wins over older per-season files for the same video.
  const localVideos = mergeVideoLists(parseUnifiedVideos(local, origin), mergeVideoLists(parseUnifiedVideos(legacy, origin), parseLegacyVideos(legacy, origin)));
  return { videos: mergeVideoLists(localVideos, parseRemoteFile(remote.doc, origin)), links: [...parseRaidLinks(local), ...parseRaidLinks(legacy)], remoteFailed: remote.failed };
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

  // The season itself is shown first; linked cross-server seasons are added once the link is known.
  const currentSeason = loadSeason(origin, signal, true).then((season) => {
    publish({ videos: season.videos, remote: season.remoteFailed ? 'failed' : 'ok' });
    return season;
  });
  const [current, remoteRaids] = await Promise.all([currentSeason, videoDumpURL ? optional(`${videoDumpURL}/raids.json`, signal) : Promise.resolve(null)]);

  const linked = findLinkedSeasons([...current.links, ...parseRaidLinks(remoteRaids)], origin);
  if (linked.length === 0 || signal.aborted) {
    publish({ done: true });
    return;
  }
  const references = await Promise.all(linked.map((season) => loadSeason(season, signal, season.server === 'kr')));
  publish({
    videos: combineScopes(
      current.videos,
      references.flatMap((season) => season.videos),
    ),
    referenceRaidId: linked[0].raidId,
    remote: current.remoteFailed || references.some((season) => season.remoteFailed) ? 'failed' : 'ok',
    done: true,
  });
}
