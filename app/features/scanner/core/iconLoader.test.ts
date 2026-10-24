import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = { Item: { '5001': { Id: 5001, LocalizeEtc: { NameEn: 'Test item', NameJp: 'Test', NameKr: 'Test' } } } };
const img = { Item: { '5001': 'dGVzdA==' } };

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function successfulFetch() {
  return vi.fn((input: string) => Promise.resolve(Response.json(input.includes('icon_info') ? info : img)));
}

describe('icon metadata preparation', () => {
  it('shares concurrent downloads and keeps metadata available without model sessions', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const { loadIcons, isIconsLoaded, getRawIconInfo, getRawIconImg } = await import('./iconLoader');
    expect(isIconsLoaded()).toBe(false);
    const progressA = vi.fn();
    const progressB = vi.fn();
    const [a, b] = await Promise.all([loadIcons(progressA), loadIcons(progressB)]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progressA).toHaveBeenCalled();
    expect(progressB).toHaveBeenCalled();
    expect(isIconsLoaded()).toBe(true);
    expect(getRawIconInfo()).toEqual(info);
    expect(getRawIconImg()).toEqual(img);
    expect(a.iconMap.get('Item_5001')?.dataUrl).toBe('data:image/webp;base64,dGVzdA==');
    expect(await loadIcons()).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('allows retry after a failed download instead of caching the rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    );
    const { loadIcons, isIconsLoaded } = await import('./iconLoader');
    await expect(loadIcons()).rejects.toThrow(/503/);
    expect(isIconsLoaded()).toBe(false);
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadIcons()).icons).toHaveLength(1);
    expect(isIconsLoaded()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
