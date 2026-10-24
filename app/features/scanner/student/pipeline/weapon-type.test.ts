import { describe, expect, it } from 'vitest';
import { coverFromWeaponTypeMode, hasWeaponTypeIcon, parseWeaponType, selectWeaponType } from './weapon-type';

describe('weapon type position', () => {
  it('accepts only known weapon abbreviations', () => {
    expect(parseWeaponType(' SMG ')).toBe('SMG');
    expect(parseWeaponType('S-M-G')).toBe('SMG');
    expect(parseWeaponType('JMG')).toBeUndefined();
  });

  it('chooses the location with an emblem independent of text length', () => {
    expect(selectWeaponType('SMG', 'JMG', false)).toEqual({ type: 'SMG', raw: 'SMG', mode: 'plain' });
    expect(selectWeaponType('suc', 'SMG', true)).toEqual({ type: 'SMG', raw: 'SMG', mode: 'with-icon' });
    expect(selectWeaponType('HG', 'noise', true)).toEqual({ type: 'HG', raw: 'HG', mode: 'plain' });
  });

  it('maps the selected upper and lower text positions to cover', () => {
    expect(coverFromWeaponTypeMode(selectWeaponType('SMG', 'noise', false).mode)).toBe(false);
    expect(coverFromWeaponTypeMode(selectWeaponType('noise', 'SMG', true).mode)).toBe(true);
    expect(coverFromWeaponTypeMode(selectWeaponType('HG', 'noise', true).mode)).toBe(false);
  });

  it('detects the icon in the upper part of a weapon card', () => {
    const image = new ImageData(100, 100);
    image.data.fill(255);
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(hasWeaponTypeIcon(image, box)).toBe(false);
    for (let y = 10; y < 30; y += 1)
      for (let x = 7; x < 12; x += 1) {
        const index = (y * image.width + x) * 4;
        image.data[index] = image.data[index + 1] = image.data[index + 2] = 100;
      }
    expect(hasWeaponTypeIcon(image, box)).toBe(true);
  });
});
