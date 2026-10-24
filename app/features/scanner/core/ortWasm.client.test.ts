import { afterEach, describe, expect, it, vi } from 'vitest';
import { threadedWasmPaths } from './ortWasm.client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared threaded WASM worker paths', () => {
  it('uses a blob worker module and the matching hosted WASM binary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('export default {};')));
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ort-worker');
    expect(await threadedWasmPaths()).toEqual({ mjs: 'blob:ort-worker', wasm: '/scanner/ort/ort-wasm-simd-threaded.jsep.wasm' });
    expect(create).toHaveBeenCalledOnce();
  });
  it.each(['network', 'http'])('returns null on %s failure', async (failure) => {
    vi.stubGlobal('fetch', failure === 'network' ? vi.fn().mockRejectedValue(new Error('Offline')) : vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect(await threadedWasmPaths()).toBeNull();
  });
});
