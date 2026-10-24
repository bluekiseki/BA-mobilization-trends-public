import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  classifier: vi.fn(),
  ocr: vi.fn(),
  icons: vi.fn(),
  portraits: vi.fn(),
  roles: vi.fn(),
  bytes: vi.fn(),
  json: vi.fn(),
  paths: vi.fn(),
}));
vi.mock('onnxruntime-web', () => ({ env: { wasm: {} } }));
vi.mock('~/features/scanner/core/classifier.client', () => ({ initClassifier: mocks.classifier }));
vi.mock('./pipeline/ocr', () => ({ initOCR: mocks.ocr }));
vi.mock('~/features/scanner/core/iconLoader', () => ({ loadIcons: mocks.icons }));
vi.mock('./portraitLoader', () => ({ loadPortraitHistograms: mocks.portraits }));
vi.mock('./pipeline/tactic-role', () => ({ loadTacticRoleTemplates: mocks.roles }));
vi.mock('~/utils/fetchWithProgress', () => ({ fetchWithProgress: mocks.bytes, fetchJsonWithProgress: mocks.json }));
vi.mock('~/features/scanner/core/ortWasm.client', () => ({ threadedWasmPaths: mocks.paths }));

const messages = { loadingData: 'Data', loadingClassifier: 'Classifier', loadingOcr: 'OCR', ready: 'Ready' };
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
  vi.stubGlobal('crossOriginIsolated', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  mocks.icons.mockResolvedValue({ icons: [] });
  mocks.bytes.mockResolvedValue(new Uint8Array());
  mocks.json.mockResolvedValue({ dim: 2, keys: [], data: '' });
  mocks.paths.mockResolvedValue({ mjs: 'blob:ort-worker', wasm: '/scanner/ort/runtime.wasm' });
});
afterEach(() => vi.unstubAllGlobals());

describe('student shared runtime initialization', () => {
  it('configures the adaptive pool before creating classifier and OCR sessions', async () => {
    const runtime = await import('onnxruntime-web');
    mocks.classifier.mockImplementation(() => {
      expect(runtime.env.wasm.numThreads).toBe(4);
      return Promise.resolve();
    });
    mocks.ocr.mockImplementation(() => {
      expect(runtime.env.wasm.numThreads).toBe(4);
      return Promise.resolve();
    });
    const { loadAllModels } = await import('./modelLoader.client');
    const a = loadAllModels(vi.fn(), vi.fn(), messages);
    const b = loadAllModels(vi.fn(), vi.fn(), messages);
    expect(a).toBe(b);
    await a;
    expect(mocks.paths).toHaveBeenCalledOnce();
    expect(mocks.classifier).toHaveBeenCalledOnce();
    expect(mocks.ocr).toHaveBeenCalledOnce();
    expect(mocks.classifier.mock.invocationCallOrder[0]).toBeLessThan(mocks.ocr.mock.invocationCallOrder[0]);
    await loadAllModels(vi.fn(), vi.fn(), messages);
    expect(mocks.ocr).toHaveBeenCalledOnce();
  });
  it('retains the ordinary single-thread URL path on unsupported documents', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    const runtime = await import('onnxruntime-web');
    const { loadAllModels } = await import('./modelLoader.client');
    await loadAllModels(vi.fn(), vi.fn(), messages);
    expect(runtime.env.wasm.numThreads).toBe(1);
    expect(runtime.env.wasm.wasmPaths).toBe('/scanner/ort/');
    expect(mocks.paths).not.toHaveBeenCalled();
  });
  it('falls back to a single thread on the URL path when the threaded worker is unavailable', async () => {
    mocks.paths.mockResolvedValue(null);
    const runtime = await import('onnxruntime-web');
    const { loadAllModels } = await import('./modelLoader.client');
    await loadAllModels(vi.fn(), vi.fn(), messages);
    expect(mocks.paths).toHaveBeenCalledOnce();
    expect(runtime.env.wasm.numThreads).toBe(1);
    expect(runtime.env.wasm.wasmPaths).toBe('/scanner/ort/');
  });
});
