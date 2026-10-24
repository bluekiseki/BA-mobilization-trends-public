// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { classifyTerrain, findPotentialBadges } from './classify';

describe('terrain classification', () => {
  it('uses the same circle and central crop geometry as Python', () => {
    const image = new ImageData(50, 50);
    for (let y = 14; y < 36; y += 1)
      for (let x = 14; x < 36; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data.set([0xb7, 0xef, 0x96, 255], offset);
      }
    expect(classifyTerrain(image, { x: 25.7, y: 24.3, radius: 11.9 })).toBe('A');
  });
});

describe('potential-release badge detection', () => {
  it("scales Python's component-area threshold for resized browser frames", () => {
    const image = { width: 400, height: 100, data: new Uint8ClampedArray(400 * 100 * 4), colorSpace: 'srgb' } as ImageData;
    for (let y = 10; y < 17; y += 1)
      for (let x = 30; x < 40; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data.set([0x42, 0x66, 0x94, 255], offset);
      }
    const badges = findPotentialBadges(image);
    expect(badges).toHaveLength(1);
    expect(badges[0].quadrant).toBe('hp');
  });

  it('still rejects tiny color noise', () => {
    const image = { width: 400, height: 100, data: new Uint8ClampedArray(400 * 100 * 4), colorSpace: 'srgb' } as ImageData;
    for (let y = 2; y < 5; y += 1)
      for (let x = 2; x < 5; x += 1) {
        const offset = (y * image.width + x) * 4;
        image.data.set([0x42, 0x66, 0x94, 255], offset);
      }
    expect(findPotentialBadges(image)).toHaveLength(0);
  });
});
