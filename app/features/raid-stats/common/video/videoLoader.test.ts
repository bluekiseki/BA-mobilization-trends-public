import { afterEach, expect, it, vi } from 'vitest';
import { loadMergedVideos, type MergedVideoState } from './videoLoader';
import { videoDumpURL } from '~/data/livedataServer.json';

afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown) => Promise.resolve(Response.json(body));
const missingResponse = () => Promise.resolve(new Response(null, { status: 404 }));

it('publishes the current season before the cross-server catalog responds', async () => {
  const catalog = Promise.withResolvers<Response>();
  const firstResult = Promise.withResolvers<MergedVideoState>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => (url === `${videoDumpURL}/raids.json` ? catalog.promise : missingResponse())),
  );
  const loading = loadMergedVideos('jp', 'R91', new AbortController().signal, firstResult.resolve);
  try {
    expect(await firstResult.promise).toMatchObject({ done: false, referenceRaidId: null });
  } finally {
    catalog.resolve(Response.json({ raid_links: [] }));
    await loading;
  }
});

it('retains GL party analysis from the existing raid-gl season file when merging remote metadata', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === `${videoDumpURL}/raids.json`) return jsonResponse({ raid_links: [{ jp: 'R91', gl: 'R88' }] });
      if (url.endsWith('/video/raid-gl-R88.json'))
        return jsonResponse({
          videos: [
            {
              url: 'https://www.youtube.com/watch?v=abcdefghijk',
              raid_ref: { server: 'gl', raid_id: 'R88' },
              title: 'Analyzed GL run',
              parties: [[{ id: 10000, grade: 'ue50', name_en: 'Student', name_ja: '' }]],
            },
          ],
        });
      if (url === `${videoDumpURL}/gl-R88.json`) return jsonResponse({ videos: [{ platform: 'youtube', video_id: 'abcdefghijk', title: 'Fresh title' }] });
      return missingResponse();
    }),
  );
  const states: MergedVideoState[] = [];
  await loadMergedVideos('jp', 'R91', new AbortController().signal, (state) => states.push(state));
  expect(states.at(-1)?.videos).toHaveLength(1);
  expect(states.at(-1)?.videos[0]).toMatchObject({ title: 'Fresh title', parties: [[{ id: 10000 }]], origin: { server: 'kr', raidId: 'R88' } });
});

it.each(['R', 'E'])('loads linked GL %s videos from the live dump on a JP dashboard', async (prefix) => {
  const jp = `${prefix}90`;
  const gl = `${prefix}87`;
  const fetchMock = vi.fn((url: string) => {
    if (url === `${videoDumpURL}/raids.json`) return jsonResponse({ raid_links: [{ jp, gl }] });
    if (url === `${videoDumpURL}/gl-${gl}.json`) return jsonResponse({ videos: [{ platform: 'youtube', video_id: 'abcdefghijk', title: 'GL run', score: 30000000 }] });
    return missingResponse();
  });
  vi.stubGlobal('fetch', fetchMock);
  const states: MergedVideoState[] = [];
  await loadMergedVideos('jp', jp, new AbortController().signal, (state) => states.push(state));
  expect(states.at(-1)).toMatchObject({
    done: true,
    referenceRaidId: gl,
    videos: [{ title: 'GL run', isReference: true, origin: { server: 'kr', raidId: gl } }],
  });
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith(`/gl-${gl}.json`))).toBe(true);
});

it('does not emit results after the caller aborts', async () => {
  vi.stubGlobal('fetch', vi.fn(missingResponse));
  const controller = new AbortController();
  controller.abort();
  const emit = vi.fn();
  await loadMergedVideos('jp', 'R90', controller.signal, emit);
  expect(emit).not.toHaveBeenCalled();
});
