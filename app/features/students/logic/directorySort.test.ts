import { describe, expect, it } from 'vitest';
import { parseDirectorySort, sortDirectory } from './directorySort';

const base = {
  FamilyName: '',
  SearchTags: [],
  School: '',
  Club: '',
  BulletType: '',
  ArmorType: '',
  TacticRole: '',
  SquadType: '',
  StarGrade: 3,
  StreetBattleAdaptation: 0,
  OutdoorBattleAdaptation: 0,
  IndoorBattleAdaptation: 0,
  Weapon: null,
  AttackPower100: 0,
  MaxHP100: 0,
  DefensePower100: 0,
  HealPower100: 0,
};
const list = [
  { ...base, Id: 3, Name: 'C', DefaultOrder: 0, BirthDay: '', CharHeightMetric: '' },
  { ...base, Id: 1, Name: 'A', DefaultOrder: 2, BirthDay: '12/1', CharHeightMetric: '170cm' },
  { ...base, Id: 2, Name: 'B', DefaultOrder: 1, BirthDay: '3/20', CharHeightMetric: '150cm' },
];
const ids = (sort: Parameters<typeof sortDirectory>[1], reversed = false) => sortDirectory(list, sort, reversed).map((s) => s.Id);

const plan = (level: number) => ({ current: { level, star: 1, uw: 0 }, target: { level: 90, star: 5, uw: 0 } }) as unknown as import('~/types/growthPlan').GrowthPlan;

describe('directory sort', () => {
  it('sorts by plan values and leaves students without a plan last in both directions', () => {
    const planOf = (id: number) => (id === 1 ? plan(80) : id === 2 ? plan(50) : undefined);
    expect(sortDirectory(list, 'planCurrentLevel', false, planOf).map((s) => s.Id)).toEqual([2, 1, 3]);
    expect(sortDirectory(list, 'planCurrentLevel', true, planOf).map((s) => s.Id)).toEqual([1, 2, 3]);
  });
  it('sorts by a stat worked out from the plan and leaves students without a value last', () => {
    const values: Record<number, number | null> = { 1: 500, 2: 900, 3: null };
    const statOf = (id: number) => values[id] ?? null;
    expect(sortDirectory(list, 'planTargetAttack', false, undefined, statOf).map((s) => s.Id)).toEqual([1, 2, 3]);
    expect(sortDirectory(list, 'planCurrentHp', true, undefined, statOf).map((s) => s.Id)).toEqual([2, 1, 3]);
  });
  it('orders by the in-game order by default', () => expect(ids('default')).toEqual([3, 2, 1]));
  it('reverses a key', () => expect(ids('height', true)).toEqual([1, 2, 3]));
  it('sorts birthdays by month then day and keeps unknown ones last in both directions', () => {
    expect(ids('birthday')).toEqual([2, 1, 3]);
    expect(ids('birthday', true)).toEqual([1, 2, 3]);
  });
  it('falls back to the default for an unknown value', () => expect(parseDirectorySort('nope')).toBe('default'));
});
