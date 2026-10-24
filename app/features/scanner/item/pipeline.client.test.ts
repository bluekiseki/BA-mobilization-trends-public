import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockVideoScanOutput } from '../core/__test__/fixtures/videoScanOutput';
import type { IconEntry } from '../core/types';
import { processFile } from './pipeline.client';

const mocks = vi.hoisted(() => ({
  loadAllModels: vi.fn(),
  loadIcons: vi.fn(),
  scanVideo: vi.fn(),
  detect: vi.fn(),
  classify: vi.fn(),
  readQuantity: vi.fn(),
}));
vi.mock('./modelLoader.client', () => ({ loadAllModels: mocks.loadAllModels }));
vi.mock('../core/iconLoader', () => ({ loadIcons: mocks.loadIcons }));
vi.mock('../video/client', () => ({ scanVideo: mocks.scanVideo }));
vi.mock('./detector.client', () => ({ detectCells: mocks.detect }));
vi.mock('../core/classifier.client', () => ({ classifyBatch: mocks.classify }));
vi.mock('./ocr.client', () => ({ readQuantity: mocks.readQuantity, parseQtyString: () => 12 }));

const icon: IconEntry = {
  inventoryKey: 'Item_5001',
  name: 'Test',
  localizeEtc: { NameEn: 'Test', NameJp: 'Test', NameKr: 'Test' },
  dataUrl: '',
  isGift: false,
  numericId: '5001',
};
const callbacks = () => ({ onLog: vi.fn(), onProgress: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadAllModels.mockResolvedValue(undefined);
  mocks.loadIcons.mockResolvedValue({ icons: [icon], iconMap: new Map([[icon.inventoryKey, icon]]) });
  mocks.scanVideo.mockResolvedValue(makeMockVideoScanOutput());
  mocks.detect.mockResolvedValue([{ x: 0, y: 0, w: 100, h: 80 }]);
  mocks.classify.mockResolvedValue([{ icon, similarity: 0.95 }]);
  mocks.readQuantity.mockResolvedValue({ text: 'x12', confidence: 0.99 });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 500, height: 300, close: vi.fn() })),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('file-specific model initialization', () => {
  it('maps a video using metadata without initializing main-thread models, and preserves diagnostics', async () => {
    const result = await processFile(new File(['video'], 'inventory.mp4', { type: 'video/mp4' }), callbacks());
    expect(mocks.loadAllModels).not.toHaveBeenCalled();
    expect(mocks.scanVideo).toHaveBeenCalledTimes(1);
    expect(result.results[0].icon).toEqual(icon);
    if (result.kind !== 'video') throw new Error('Expected a video result');
    expect(result.metrics.timings.classifyMs).toBe(60);
    expect(result.metrics.decoder).toBe('webcodecs');
  });

  it.each(['image-first', 'video-first'])('initializes main-thread models only for images in a mixed batch (%s)', async (order) => {
    const image = new File(['image'], 'inventory.webp', { type: 'image/webp' });
    const video = new File(['video'], 'inventory.mp4', { type: 'video/mp4' });
    const files = order === 'image-first' ? [image, video] : [video, image];
    for (const file of files) expect((await processFile(file, callbacks())).results[0].quantity).toBe(12);
    expect(mocks.loadAllModels).toHaveBeenCalledTimes(1);
    expect(mocks.detect).toHaveBeenCalledTimes(1);
    expect(mocks.scanVideo).toHaveBeenCalledTimes(1);
  });

  it('does not start image inference after cancellation during model loading', async () => {
    const controller = new AbortController();
    mocks.loadAllModels.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve();
    });
    await expect(processFile(new File(['image'], 'inventory.webp', { type: 'image/webp' }), { ...callbacks(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.detect).not.toHaveBeenCalled();
  });
});
