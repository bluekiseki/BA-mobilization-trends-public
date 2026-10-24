import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithProgress, fetchJsonWithProgress, type DownloadProgress } from './fetchWithProgress';

const encoder = new TextEncoder();

function streamedResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

function stubFetch(factory: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(factory())),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithProgress', () => {
  it('reports monotonic byte progress and returns the full payload', async () => {
    const chunks = ['abc', 'defg', 'hi'];
    const totalBytes = chunks.join('').length;
    stubFetch(() => streamedResponse(chunks, { 'content-length': String(totalBytes) }));

    const seen: DownloadProgress[] = [];
    const bytes = await fetchWithProgress('https://example.test/model.bin', (p) => seen.push(p));

    expect(new TextDecoder().decode(bytes)).toBe('abcdefghi');
    expect(seen.map((p) => p.loaded)).toEqual([3, 7, 9]);
    expect(seen.every((p) => p.total === totalBytes)).toBe(true);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i].loaded).toBeGreaterThanOrEqual(seen[i - 1].loaded);
  });

  it('passes total = null when there is no Content-Length header', async () => {
    stubFetch(() => streamedResponse(['x', 'y']));
    const seen: DownloadProgress[] = [];
    await fetchWithProgress('https://example.test/model.bin', (p) => seen.push(p));
    expect(seen.every((p) => p.total === null)).toBe(true);
    expect(seen.at(-1)?.loaded).toBe(2);
  });

  it('falls back to a buffered read when the response has no body', async () => {
    const seen: DownloadProgress[] = [];
    stubFetch(() => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, 'body', { value: null });
      response.arrayBuffer = () => Promise.resolve(encoder.encode('buffered').buffer);
      return response;
    });

    const bytes = await fetchWithProgress('https://example.test/model.bin', (p) => seen.push(p));
    expect(new TextDecoder().decode(bytes)).toBe('buffered');
    expect(seen).toEqual([{ loaded: 8, total: 8 }]);
  });

  it('throws on a non-ok response', async () => {
    stubFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(fetchWithProgress('https://example.test/missing.bin', () => {})).rejects.toThrow(/404/);
  });
});

describe('fetchJsonWithProgress', () => {
  it('decodes the streamed bytes as JSON', async () => {
    const payload = { keys: ['a', 'b'], dim: 2 };
    const text = JSON.stringify(payload);
    stubFetch(() => streamedResponse([text.slice(0, 5), text.slice(5)], { 'content-length': String(text.length) }));
    const result = await fetchJsonWithProgress<typeof payload>('https://example.test/data.json', () => {});
    expect(result).toEqual(payload);
  });
});
