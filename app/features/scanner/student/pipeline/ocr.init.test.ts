import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('onnxruntime-web', () => ({ env: { wasm: { numThreads: 3 } }, InferenceSession: { create } }));

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe('student OCR runtime configuration', () => {
  it('keeps the shared thread pool and creates one OCR session', async () => {
    const ort = await import('onnxruntime-web');
    const { initOCR } = await import('./ocr');
    create.mockResolvedValue({});
    const bytes = new Uint8Array();
    const first = initOCR(['wasm'], bytes);
    expect(initOCR(['wasm'], bytes)).toBe(first);
    await first;
    expect(ort.env.wasm.numThreads).toBe(3);
    expect(create).toHaveBeenCalledOnce();
  });
});
