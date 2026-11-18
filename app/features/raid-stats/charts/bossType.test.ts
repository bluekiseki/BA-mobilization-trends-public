import { describe, expect, it } from 'vitest';
import type { RaidInfo } from '~/types/data';
import { getRaidArmorTypes, matchesBossType, type BossTypeSelect } from './bossType';

const raid = (extra: Partial<RaidInfo>): RaidInfo => ({ Id: 'R1', Boss: 'Boss', Location: 'Indoor', Date: '2026-01-01', MaxLv: 90, Cnt: { All: 1, Lunatic: 0, Torment: 0, Insane: 0 }, ...extra });
const select = (...types: BossTypeSelect[]) => new Set<BossTypeSelect>(types);

describe('matchesBossType', () => {
  it('matches everything, including raids without a type, when All is selected', () => {
    expect(matchesBossType(raid({}), select('All'))).toBe(true);
  });

  it('matches a season by any of its armor types', () => {
    const r = raid({ ArmorTypes: ['LightArmor', 'Unarmed'] });
    expect(matchesBossType(r, select('Unarmed'))).toBe(true);
    expect(matchesBossType(r, select('HeavyArmor'))).toBe(false);
  });

  it('falls back to the single Type of Grand Assault entries', () => {
    const r = raid({ Type: 'HeavyArmor' });
    expect(getRaidArmorTypes(r)).toEqual(['HeavyArmor']);
    expect(matchesBossType(r, select('HeavyArmor'))).toBe(true);
  });

  it('excludes raids with no known armor type once a type is selected', () => {
    expect(matchesBossType(raid({}), select('LightArmor'))).toBe(false);
  });
});
