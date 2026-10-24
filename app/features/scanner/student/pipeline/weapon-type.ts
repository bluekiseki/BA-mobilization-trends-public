import { clampBox, fractionBox } from './image';
import type { Box, StudentRecord } from '../types';

const WEAPON_TYPES = new Set<StudentRecord['WeaponType']>(['SR', 'SG', 'AR', 'MG', 'SMG', 'RG', 'HG', 'GL', 'RL', 'FT', 'MT']);

export const parseWeaponType = (raw: string): StudentRecord['WeaponType'] | undefined => {
  const normalized = raw.toUpperCase().replace(/[^A-Z]/g, '') as StudentRecord['WeaponType'];
  return WEAPON_TYPES.has(normalized) ? normalized : undefined;
};

// Some weapon cards show an emblem above the type text. On those cards the
// text sits lower; this region is blank on cards with centered type text.
export const hasWeaponTypeIcon = (image: ImageData, weaponBox: Box): boolean => {
  const region = clampBox(fractionBox(weaponBox, [0.065, 0.1, 0.065, 0.25]), image.width, image.height);
  if (!region.width || !region.height) return false;
  let dark = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const luminance = (image.data[index] * 299 + image.data[index + 1] * 587 + image.data[index + 2] * 114) / 1000;
      if (luminance < 190) dark += 1;
    }
  }
  return dark / (region.width * region.height) > 0.025;
};

export const selectWeaponType = (plainRaw: string, withIconRaw: string, hasIcon: boolean): { type?: StudentRecord['WeaponType']; raw: string; mode: 'plain' | 'with-icon' } => {
  const primary = hasIcon ? { raw: withIconRaw, mode: 'with-icon' as const } : { raw: plainRaw, mode: 'plain' as const };
  const alternate = hasIcon ? { raw: plainRaw, mode: 'plain' as const } : { raw: withIconRaw, mode: 'with-icon' as const };
  const primaryType = parseWeaponType(primary.raw);
  if (primaryType) return { type: primaryType, ...primary };
  const alternateType = parseWeaponType(alternate.raw);
  return alternateType ? { type: alternateType, ...alternate } : { ...primary };
};

// The upper weapon-type label indicates no cover; the lower label indicates cover.
export const coverFromWeaponTypeMode = (mode: 'plain' | 'with-icon'): boolean => mode === 'with-icon';
