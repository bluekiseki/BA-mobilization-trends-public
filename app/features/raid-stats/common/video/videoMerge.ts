import type { VideoEntry, VideoOrigin } from './types';

export type DataServer = 'jp' | 'gl';
export type WebServer = 'jp' | 'kr';
export type VideoScope = 'all' | 'current' | 'reference';

/** The web uses `kr`; stored data and the Worker use `gl`. Convert only at the loading boundary. */
export const toDataServer = (server: WebServer): DataServer => (server === 'kr' ? 'gl' : 'jp');
export const toWebServer = (server: DataServer): WebServer => (server === 'gl' ? 'kr' : 'jp');

export interface RaidLink {
  gl: string;
  jp: string;
}

const DEFENSE_TO_BULLET: Record<string, string> = {
  LightArmor: 'Explosion',
  HeavyArmor: 'Pierce',
  Unarmed: 'Mystic',
  ElasticArmor: 'Sonic',
  CompositeArmor: 'Chemical',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function videoIdFromUrl(url: string): string | null {
  return url.match(/[?&]v=([\w-]{11})/)?.[1] ?? url.match(/bilibili\.com\/video\/((?:BV|av)\w+)/)?.[1] ?? null;
}

function withOrigin(video: VideoEntry, origin: VideoOrigin): VideoEntry {
  return { ...video, videoId: video.videoId ?? videoIdFromUrl(video.url) ?? video.url, origin };
}

/** Legacy per-raid file: a plain array of parsed videos. */
export function parseLegacyVideos(data: unknown, origin: VideoOrigin): VideoEntry[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is VideoEntry => isRecord(item) && typeof item.url === 'string').map((video) => withOrigin(video, origin));
}

/** A video belongs to exactly one season, so the file carries a single `raid_ref`. */
function refOf(item: Record<string, unknown>): { server: string; raid_id: string } | null {
  return isRecord(item.raid_ref) ? { server: str(item.raid_ref.server), raid_id: str(item.raid_ref.raid_id) } : null;
}

/** Locally analyzed season file: keep the videos that reference the given season. */
export function parseUnifiedVideos(doc: unknown, origin: VideoOrigin): VideoEntry[] {
  if (!isRecord(doc) || !Array.isArray(doc.videos)) return [];
  const server = toDataServer(origin.server);
  return doc.videos
    .filter(isRecord)
    .filter((item) => typeof item.url === 'string' && refOf(item)?.server === server && refOf(item)?.raid_id === origin.raidId)
    .map((item) => {
      const video = item as unknown as VideoEntry;
      return withOrigin({ ...video, parties: video.parties ?? [], boss_types: video.boss_types ?? [], difficulty: video.difficulty ?? '' }, origin);
    });
}

export function parseRaidLinks(doc: unknown): RaidLink[] {
  const links = isRecord(doc) ? doc.raid_links : undefined;
  if (!Array.isArray(links)) return [];
  return links.filter(isRecord).flatMap((link) => (typeof link.gl === 'string' && typeof link.jp === 'string' ? [{ gl: link.gl, jp: link.jp }] : []));
}

/** The remote season dump (video/remote/{server}-{raid}.json). Items carry only title-level analysis. */
export function parseRemoteFile(file: unknown, origin: VideoOrigin): VideoEntry[] {
  if (!isRecord(file) || !Array.isArray(file.videos)) return [];
  return file.videos.filter(isRecord).flatMap((item): VideoEntry[] => {
    const id = str(item.video_id);
    if (!id || item.platform !== 'youtube') return [];
    const bullet = DEFENSE_TO_BULLET[str(item.defense)];
    const published = Date.parse(str(item.published_at));
    return [
      {
        url: `https://www.youtube.com/watch?v=${id}`,
        videoId: id,
        title: str(item.title),
        description: str(item.description) || null,
        score: num(item.score),
        difficulty: str(item.difficulty),
        has_tl: false,
        boss_types: bullet ? [bullet] : [],
        is_target_type: true,
        num_parties: num(item.num_parties) ?? 0,
        parties: [],
        channel_name: str(item.channel_title),
        channel_id: str(item.channel_id),
        timestamp: Number.isFinite(published) ? Math.floor(published / 1000) : undefined,
        origin,
        remoteCandidate: true,
        basicAnalysis: true,
      },
    ];
  });
}

/**
 * Merge by video ID. Parties and scores prefer the local result and remote analysis only fills blanks;
 * title and description come from the freshest metadata (remote when it has one).
 */
export function mergeVideoLists(local: VideoEntry[], remote: VideoEntry[]): VideoEntry[] {
  const byId = new Map<string, VideoEntry>();
  const idOf = (video: VideoEntry) => video.videoId ?? videoIdFromUrl(video.url) ?? video.url;
  for (const video of local) byId.set(idOf(video), video);
  for (const incoming of remote) {
    const key = idOf(incoming);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, incoming);
      continue;
    }
    byId.set(key, {
      ...existing,
      title: incoming.title || existing.title,
      description: incoming.description || existing.description,
      channel_name: incoming.channel_name || existing.channel_name,
      score: existing.score ?? incoming.score,
      difficulty: existing.difficulty || incoming.difficulty,
      boss_types: existing.boss_types.length > 0 ? existing.boss_types : incoming.boss_types,
      num_parties: existing.num_parties || incoming.num_parties,
      timestamp: existing.timestamp ?? incoming.timestamp,
      basicAnalysis: (existing.score === undefined && incoming.score !== undefined) || existing.basicAnalysis,
      remoteCandidate: existing.remoteCandidate && incoming.remoteCandidate ? true : undefined,
    });
  }
  return [...byId.values()];
}

export function markReference(videos: VideoEntry[]): VideoEntry[] {
  return videos.map((video) => ({ ...video, isReference: true }));
}

/**
 * Combine this season's videos with linked JP reference videos. A video that exists in both
 * is kept as a direct (current) video so reference status never hides a direct match.
 */
export function combineScopes(current: VideoEntry[], reference: VideoEntry[]): VideoEntry[] {
  const idOf = (video: VideoEntry) => video.videoId ?? video.url;
  const direct = new Set(current.map(idOf));
  return [...current, ...markReference(reference.filter((video) => !direct.has(idOf(video))))];
}

export function matchesScope(video: VideoEntry, scope: VideoScope): boolean {
  if (scope === 'all') return true;
  return scope === 'reference' ? video.isReference === true : video.isReference !== true;
}

export function findJpReference(links: RaidLink[], glRaidId: string): string | null {
  return links.find((link) => link.gl === glRaidId)?.jp ?? null;
}
