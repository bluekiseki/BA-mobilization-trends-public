import { describe, expect, it } from 'vitest';
import { findMoodCircles, tenSegmentSampleIndices } from './layout';
import { SUB_FIELDS } from './calibration';

describe('fixed-layout sampling', () => {
  it('detects the three actual mood-circle centers from their edges', () => {
    const image = { width: 240, height: 140, data: new Uint8ClampedArray(240 * 140 * 4), colorSpace: 'srgb' } as ImageData;
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    const expected = [
      { x: 118, y: 95 },
      { x: 151, y: 95 },
      { x: 184, y: 95 },
    ];
    for (const center of expected)
      for (let y = center.y - 14; y <= center.y + 14; y += 1)
        for (let x = center.x - 14; x <= center.x + 14; x += 1) {
          const distance = Math.hypot(x - center.x, y - center.y);
          if (distance > 13) continue;
          const offset = (y * image.width + x) * 4;
          const value = distance > 10 ? 255 : 145;
          image.data.set([value, value, value, 255], offset);
        }
    const circles = findMoodCircles(image, { x: 40, y: 80, width: 60, height: 30 });
    expect(circles).toHaveLength(3);
    circles.forEach((circle, index) => {
      expect(circle.x).toBeCloseTo(expected[index].x, 0);
      expect(circle.y).toBeCloseTo(expected[index].y, 0);
      expect(circle.radius).toBeGreaterThanOrEqual(13);
      expect(circle.radius).toBeLessThanOrEqual(16);
    });
  });

  it('takes the first candidate of each of ten Python-compatible chunks', () => {
    expect(tenSegmentSampleIndices(100)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(tenSegmentSampleIndices(23)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  });

  it('handles a short candidate list without an empty chunk', () => {
    expect(tenSegmentSampleIndices(3)).toEqual([0, 1, 2]);
    expect(tenSegmentSampleIndices(0)).toEqual([]);
  });
});

describe('equipment calibration mapping', () => {
  it('maps slots 0-2 to equipment and slot 3 to gear', () => {
    expect(SUB_FIELDS.equipmentTier).toEqual([
      [0.0259, 0.6686, 0.0731, 0.1857],
      [0.195, 0.6543, 0.0757, 0.2114],
      [0.3698, 0.6829, 0.07, 0.1657],
    ]);
    expect(SUB_FIELDS.gearTier).toEqual([0.5423, 0.6705, 0.0485, 0.1818]);
  });
});
