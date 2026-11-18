import { describe, expect, it } from 'vitest';
import {
  combineScopes,
  findLinkedSeasons,
  findJpReference,
  matchesScope,
  mergeVideoLists,
  parseLegacyVideos,
  parseRaidLinks,
  parseRemoteFile,
  parseUnifiedVideos,
  toDataServer,
  toWebServer,
} from './videoMerge';
import type { VideoEntry } from './types';

const id = 'abcdefghijk';
const origin = { server: 'kr', raidId: 'R87' } as const;
const local = (patch: Partial<VideoEntry> = {}): VideoEntry => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  title: 'old',
  score: 30_000_000,
  difficulty: 'Torment',
  has_tl: false,
  boss_types: ['Explosion'],
  is_target_type: true,
  num_parties: 2,
  parties: [[{ id: 1, name_ja: '', name_en: '', grade: '3' }]],
  channel_name: 'c',
  channel_id: 'x',
  ...patch,
});
const remoteFile = {
  videos: [{ platform: 'youtube', video_id: id, title: 'new title', description: 'new', score: 1, difficulty: 'Normal', defense: 'LightArmor', num_parties: 3, published_at: '2026-10-21T00:00:00Z' }],
};

describe('server mapping', () => {
  it('converts kr<->gl only at the boundary', () => {
    expect(toDataServer('kr')).toBe('gl');
    expect(toDataServer('jp')).toBe('jp');
    expect(toWebServer('gl')).toBe('kr');
  });
});

describe('parsers', () => {
  it('reads legacy arrays and ignores malformed rows', () => {
    const videos = parseLegacyVideos([local(), { nope: 1 }, null], origin);
    expect(videos).toHaveLength(1);
    expect(videos[0].videoId).toBe(id);
    expect(parseLegacyVideos({ not: 'array' }, origin)).toEqual([]);
  });
  it('selects unified videos by raid ref using the gl server name', () => {
    const doc = {
      videos: [
        { ...local(), raid_ref: { server: 'gl', raid_id: 'R87' } },
        { ...local({ url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' }), raid_ref: { server: 'jp', raid_id: 'R87' } },
      ],
      raid_links: [{ gl: 'R87', jp: 'R90' }],
    };
    expect(parseUnifiedVideos(doc, origin).map((v) => v.videoId)).toEqual([id]);
    expect(findJpReference(parseRaidLinks(doc), 'R87')).toBe('R90');
    expect(findJpReference(parseRaidLinks(doc), 'R88')).toBeNull();
  });
  it('maps remote items to title-level candidates', () => {
    const videos = parseRemoteFile(remoteFile, origin);
    expect(videos[0]).toMatchObject({ remoteCandidate: true, basicAnalysis: true, boss_types: ['Explosion'], parties: [] });
    expect(parseRemoteFile('garbage', origin)).toEqual([]);
  });
});

describe('mergeVideoLists', () => {
  it('dedupes by video ID, keeps local analysis and takes the freshest metadata', () => {
    const merged = mergeVideoLists(parseLegacyVideos([local()], origin), parseRemoteFile(remoteFile, origin));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ title: 'new title', score: 30_000_000, difficulty: 'Torment', num_parties: 2 });
    expect(merged[0].parties).toHaveLength(1);
    expect(merged[0].remoteCandidate).toBeUndefined();
  });
  it('fills only blank local fields from the remote analysis', () => {
    const blank = parseLegacyVideos([local({ score: undefined, difficulty: '', boss_types: [], num_parties: 0, parties: [] })], origin);
    const merged = mergeVideoLists(blank, parseRemoteFile(remoteFile, origin))[0];
    expect(merged).toMatchObject({ score: 1, difficulty: 'Normal', boss_types: ['Explosion'], num_parties: 3 });
  });
  it('keeps remote-only candidates', () => {
    expect(mergeVideoLists([], parseRemoteFile(remoteFile, origin))[0].remoteCandidate).toBe(true);
  });
});

describe('scopes', () => {
  const current = parseLegacyVideos([local()], origin);
  const jpRef = parseLegacyVideos([local({ url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' }), local()], { server: 'jp', raidId: 'R90' });
  it('marks JP reference videos but never hides a direct match', () => {
    const all = combineScopes(current, jpRef);
    expect(all).toHaveLength(2);
    expect(all.filter((v) => v.isReference).map((v) => v.videoId)).toEqual(['zzzzzzzzzzz']);
    expect(all.find((v) => v.isReference)?.origin).toEqual({ server: 'jp', raidId: 'R90' });
  });
  it('filters by scope', () => {
    const all = combineScopes(current, jpRef);
    expect(all.filter((v) => matchesScope(v, 'all'))).toHaveLength(2);
    expect(all.filter((v) => matchesScope(v, 'current'))).toHaveLength(1);
    expect(all.filter((v) => matchesScope(v, 'reference'))).toHaveLength(1);
  });
});

describe('cross-server season links', () => {
  it('resolves JP to all explicitly linked GL seasons without duplicate requests', () => {
    const links = [
      { jp: 'R90', gl: 'R87' },
      { jp: 'R90', gl: 'R88' },
      { jp: 'R90', gl: 'R87' },
      { jp: 'E90', gl: 'E87' },
    ];
    expect(findLinkedSeasons(links, { server: 'jp', raidId: 'R90' })).toEqual([
      { server: 'kr', raidId: 'R87' },
      { server: 'kr', raidId: 'R88' },
    ]);
    expect(findLinkedSeasons(links, { server: 'kr', raidId: 'R87' })).toEqual([{ server: 'jp', raidId: 'R90' }]);
    expect(findLinkedSeasons(links, { server: 'jp', raidId: 'R91' })).toEqual([]);
  });
});
