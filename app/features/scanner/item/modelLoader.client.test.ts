import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initDetector: vi.fn(),
  initClassifier: vi.fn(),
  initOCR: vi.fn(),
  loadIcons: vi.fn(),
  fetchBytes: vi.fn(),
  fetchJson: vi.fn(),
}));
vi.mock('onnxruntime-web', () => ({ env: { wasm: {} } }));
vi.mock('./detector.client', () => ({ initDetector: mocks.initDetector }));
vi.mock('../core/classifier.client', () => ({ initClassifier: mocks.initClassifier }));
vi.mock('./ocr.client', () => ({ initOCR: mocks.initOCR }));
vi.mock('../core/iconLoader', () => ({ loadIcons: mocks.loadIcons }));
vi.mock('../../../utils/fetchWithProgress', () => ({ fetchWithProgress: mocks.fetchBytes, fetchJsonWithProgress: mocks.fetchJson }));

const messages = { loadingData: 'Data', loadingCellDetector: 'Detector', loadingClassifier: 'Classifier', loadingOcr: 'OCR', ready: 'Ready' };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.loadIcons.mockResolvedValue({ icons: [] });
  mocks.fetchBytes.mockResolvedValue(new Uint8Array());
  mocks.fetchJson.mockResolvedValue({ dim: 2, keys: [], data: '' });
  mocks.initDetector.mockResolvedValue(undefined);
  mocks.initClassifier.mockResolvedValue(undefined);
  mocks.initOCR.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response())),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('model session initialization', () => {
  it('shares in-flight initialization and reuses sessions on later calls', async () => {
    const { loadAllModels, isModelsLoaded } = await import('./modelLoader.client');
    expect(isModelsLoaded()).toBe(false);
    const a = loadAllModels(vi.fn(), vi.fn(), messages);
    const b = loadAllModels(vi.fn(), vi.fn(), messages);
    expect(a).toBe(b);
    await Promise.all([a, b]);
    await loadAllModels(vi.fn(), vi.fn(), messages);
    expect(isModelsLoaded()).toBe(true);
    expect(mocks.initDetector).toHaveBeenCalledTimes(1);
    expect(mocks.initClassifier).toHaveBeenCalledTimes(1);
    expect(mocks.initOCR).toHaveBeenCalledTimes(1);
    expect(mocks.initDetector.mock.invocationCallOrder[0]).toBeLessThan(mocks.initClassifier.mock.invocationCallOrder[0]);
    expect(mocks.initClassifier.mock.invocationCallOrder[0]).toBeLessThan(mocks.initOCR.mock.invocationCallOrder[0]);
  });

  it('allows a failed initialization to be retried', async () => {
    mocks.initDetector.mockRejectedValueOnce(new Error('Detector failed'));
    const { loadAllModels, isModelsLoaded } = await import('./modelLoader.client');
    await expect(loadAllModels(vi.fn(), vi.fn(), messages)).rejects.toThrow('Detector failed');
    expect(isModelsLoaded()).toBe(false);
    await loadAllModels(vi.fn(), vi.fn(), messages);
    expect(isModelsLoaded()).toBe(true);
    expect(mocks.initDetector).toHaveBeenCalledTimes(2);
    expect(mocks.initClassifier).toHaveBeenCalledTimes(1);
  });

  it('reports provider preferences without claiming every model runs on the GPU', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: () => Promise.resolve({}) } });
    const { loadAllModels, getRequestedProviders } = await import('./modelLoader.client');
    const onLog = vi.fn();
    await loadAllModels(vi.fn(), onLog, messages);
    expect(getRequestedProviders()).toEqual(['webgpu', 'wasm']);
    expect(onLog).toHaveBeenCalledWith('Requested execution providers: webgpu, wasm (OCR: wasm)');
    const copy = getRequestedProviders();
    copy.pop();
    expect(getRequestedProviders()).toEqual(['webgpu', 'wasm']);
  });

  it('falls back to a single thread on the URL path when the threaded worker cannot be fetched', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.stubGlobal('crossOriginIsolated', true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    const runtime = await import('onnxruntime-web');
    const { loadAllModels } = await import('./modelLoader.client');
    const onLog = vi.fn();
    await loadAllModels(vi.fn(), onLog, messages);
    expect(runtime.env.wasm.numThreads).toBe(1);
    expect(runtime.env.wasm.wasmPaths).toBe('/scanner/ort/');
    expect(onLog).toHaveBeenCalledWith('WASM threads: 1');
  });
});
