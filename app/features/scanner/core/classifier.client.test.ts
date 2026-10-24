import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IconEntry } from './types';

const { run } = vi.hoisted(() => ({ run: vi.fn<(feeds: { input: { dims: number[]; data: Float32Array } }) => Promise<{ embedding: { data: Float32Array } }>>() }));
vi.mock('onnxruntime-web', () => ({
  InferenceSession: { create: () => Promise.resolve({ run }) },
  Tensor: class {
    constructor(
      readonly type: string,
      readonly data: Float32Array,
      readonly dims: number[],
    ) {}
  },
}));

const icon: IconEntry = {
  inventoryKey: 'Item_5001',
  name: 'Test',
  localizeEtc: { NameEn: 'Test', NameJp: 'Test', NameKr: 'Test' },
  dataUrl: '',
  isGift: false,
  numericId: '5001',
};

beforeEach(() => {
  vi.resetModules();
  run.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function prepare() {
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(224 * 224 * 4).fill(255) }));
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { clearRect: vi.fn(), drawImage, getImageData };
      }
    },
  );
  const { initClassifier, classifyBatch } = await import('./classifier.client');
  const embeddings = new Float32Array([1, 0]);
  await initClassifier(['wasm'], [icon], () => {}, new Uint8Array(), {
    dim: 2,
    keys: [icon.inventoryKey],
    data: btoa(String.fromCharCode(...new Uint8Array(embeddings.buffer))),
  });
  return { classifyBatch, drawImage, getImageData, source: new OffscreenCanvas(500, 500) };
}

describe('classifier crop reuse', () => {
  it('reads a confident cell once for both color features and inference', async () => {
    run.mockResolvedValue({ embedding: { data: new Float32Array([1, 0]) } });
    const { classifyBatch, drawImage, getImageData, source } = await prepare();
    const onMetrics = vi.fn();
    expect(await classifyBatch(source, [{ x: 10, y: 20, w: 100, h: 80 }], onMetrics)).toEqual([{ icon, similarity: 1 }]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(getImageData).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ inferenceCalls: 1, retries: 0 }));
  });

  it('keeps the best allowed key below the threshold without retrying in closed-set mode', async () => {
    run.mockResolvedValue({ embedding: { data: new Float32Array([0, 1]) } });
    const { classifyBatch, getImageData, source } = await prepare();
    const cell = { x: 10, y: 20, w: 100, h: 80 };
    expect(await classifyBatch(source, [cell], undefined, 1, new Set([icon.inventoryKey]))).toEqual([{ icon, similarity: 0 }]);
    expect(getImageData).toHaveBeenCalledTimes(1);
    expect(await classifyBatch(source, [cell])).toEqual([{ icon: null, similarity: 0 }]);
  });

  it('rejects a closed set with no matching embeddings', async () => {
    const { classifyBatch, source } = await prepare();
    await expect(classifyBatch(source, [{ x: 0, y: 0, w: 10, h: 10 }], undefined, 1, new Set(['Equipment_1000']))).rejects.toThrow('allowed keys');
  });

  it('preserves margin retry and chooses its better prediction', async () => {
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([0, 1]) } });
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([1, 0]) } });
    const { classifyBatch, drawImage, getImageData, source } = await prepare();
    const onMetrics = vi.fn();
    expect(await classifyBatch(source, [{ x: 10, y: 20, w: 100, h: 80 }], onMetrics)).toEqual([{ icon, similarity: 1 }]);
    expect(getImageData).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenNthCalledWith(2, source, 18, 26.4, 84, 67.2, 0, 0, 224, 224);
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ inferenceCalls: 2, retries: 1 }));
  });

  it('keeps batch order, margin retries, and the final partial batch', async () => {
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1]) } });
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([1, 0]) } });
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([0, 1]) } });
    run.mockResolvedValueOnce({ embedding: { data: new Float32Array([1, 0, 1, 0]) } });
    const { classifyBatch, getImageData, source } = await prepare();
    const onMetrics = vi.fn();
    const boxes = Array.from({ length: 6 }, (_, i) => ({ x: i * 50, y: 10, w: 40, h: 40 }));
    const result = await classifyBatch(source, boxes, onMetrics, 4);
    expect(result.map((match) => match.icon)).toEqual([icon, icon, icon, null, icon, icon]);
    expect(run.mock.calls.map(([feeds]) => feeds.input.dims)).toEqual([
      [4, 3, 224, 224],
      [1, 3, 224, 224],
      [1, 3, 224, 224],
      [2, 3, 224, 224],
    ]);
    expect(getImageData).toHaveBeenCalledTimes(8);
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ inferenceCalls: 4, retries: 2 }));
  });

  it('falls back to single cells without duplicating or losing cells when batching fails', async () => {
    run.mockRejectedValueOnce(new Error('Provider cannot allocate a batch'));
    run.mockResolvedValue({ embedding: { data: new Float32Array([1, 0]) } });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { classifyBatch, source } = await prepare();
      const boxes = Array.from({ length: 6 }, (_, i) => ({ x: i * 50, y: 10, w: 40, h: 40 }));
      const result = await classifyBatch(source, boxes, undefined, 4);
      expect(result).toHaveLength(6);
      expect(result.every((match) => match.icon === icon)).toBe(true);
      expect(run.mock.calls.map(([feeds]) => feeds.input.dims[0])).toEqual([4, 1, 1, 1, 1, 1, 1]);
      await classifyBatch(source, boxes.slice(0, 2), undefined, 4);
      expect(run.mock.calls.map(([feeds]) => feeds.input.dims[0])).toEqual([4, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
