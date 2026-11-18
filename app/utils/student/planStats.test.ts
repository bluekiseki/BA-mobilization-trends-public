import { describe, expect, it } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import { computePlanStats, parseStatStudent, resolvePlanStats } from './planStats';

const student = parseStatStudent({
  AttackPower1: 369,
  AttackPower100: 3690,
  MaxHP1: 2236,
  MaxHP100: 19390,
  DefensePower1: 19,
  DefensePower100: 119,
  HealPower1: 1408,
  HealPower100: 4225,
  Equipment: ['Hat', 'Hairpin', 'Watch'],
  FavorStatType: ['AttackPower', 'MaxHP'],
  FavorStatValue: [
    [4, 0],
    [6, 0],
    [7, 48],
    [9, 58],
    [2, 10],
    [4, 15],
    [6, 25],
  ],
  Weapon: { AttackPower1: 162, AttackPower100: 1621, MaxHP1: 561, MaxHP100: 5607, HealPower1: 0, HealPower100: 0, StatLevelUpType: 'Standard' },
  Gear: { StatType: ['AccuracyPoint_Base'], StatValue: [[150, 150]] },
});

const block = { level: 1, star: 1, uw: 0, uwLevel: 1, passive: 1, affection: 1, equipment: [0, 0, 0] as [number, number, number], gear: 0, potential: { hp: 0, atk: 0, heal: 0 } };

describe('plan stats', () => {
  if (!student) throw new Error('fixture does not match the schema');
  it('reads the raw stats at the ends of the level range', () => {
    expect(computePlanStats(student, block)).toEqual({ MaxHP: 2236, AttackPower: 369, DefensePower: 19, HealPower: 1408 });
    expect(computePlanStats(student, { ...block, level: 100 })).toMatchObject({ MaxHP: 19390, AttackPower: 3690, DefensePower: 119 });
  });
  it('adds the star bonus to everything but defense', () => {
    expect(computePlanStats(student, { ...block, level: 100, star: 5 })).toMatchObject({ MaxHP: 26177, AttackPower: 5646, DefensePower: 119 });
  });
  it('adds the cumulative bond bonus, whatever the star grade', () => {
    // Ranks 2-5 give 4 attack each and 6-10 give 6 each
    expect(computePlanStats(student, { ...block, level: 100, affection: 10 }).AttackPower).toBe(3690 + 4 * 4 + 5 * 6);
    expect(computePlanStats(student, { ...block, level: 100, affection: 50 }).AttackPower).toBe(3690 + 246);
  });
  it('ignores potential below level 90 and applies it from there', () => {
    const potential = { hp: 0, atk: 10, heal: 0 };
    expect(computePlanStats(student, { ...block, level: 89, potential }).AttackPower).toBe(computePlanStats(student, { ...block, level: 89 }).AttackPower);
    expect(computePlanStats(student, { ...block, level: 100, potential }).AttackPower).toBe(3690 + Math.round(3690 * 0.02));
  });
  it('counts an equipment slot only once its level is reached', () => {
    const equipment: [number, number, number] = [1, 1, 1];
    const low = computePlanStats(student, { ...block, level: 14, equipment });
    const high = computePlanStats(student, { ...block, level: 35, equipment });
    expect(high.AttackPower).toBeGreaterThan(low.AttackPower);
  });
  it('adds the unique weapon only for a 5-star student', () => {
    const weapon = { ...block, level: 100, uw: 1, uwLevel: 30 };
    expect(computePlanStats(student, weapon).AttackPower).toBe(3690);
    expect(computePlanStats(student, { ...weapon, star: 5 }).AttackPower).toBeGreaterThan(computePlanStats(student, { ...block, level: 100, star: 5 }).AttackPower);
  });
  it('adds the bond bonus of another outfit at its own rank', () => {
    const alt = { student: { FavorStatType: ['AttackPower'], FavorStatValue: [[10], [20]] }, rank: 6 };
    // Ranks 2-5 give 10 each and rank 6 gives 20
    expect(computePlanStats(student, { ...block, level: 100 }, [alt]).AttackPower).toBe(3690 + 4 * 10 + 20);
  });
  it('rejects a catalog entry without stats', () => expect(parseStatStudent({ Id: 1 })).toBeNull());
  it('matches the in-game health and attack of a 4-star student at level 90 with tier 9 equipment and bond rank 23', () => {
    const momiji = parseStatStudent({
      AttackPower1: 905,
      AttackPower100: 9053,
      MaxHP1: 2219,
      MaxHP100: 16980,
      DefensePower1: 19,
      DefensePower100: 118,
      HealPower1: 1418,
      HealPower100: 4255,
      Equipment: ['Hat', 'Hairpin', 'Watch'],
      FavorStatType: ['AttackPower', 'MaxHP'],
      FavorStatValue: [
        [9, 0],
        [14, 0],
        [18, 42],
        [23, 51],
        [6, 8],
        [8, 13],
        [14, 21],
      ],
      Gear: { StatType: ['CriticalPoint_Base'], StatValue: [[250, 250]] },
    });
    if (!momiji) throw new Error('fixture does not match the schema');
    const stats = computePlanStats(momiji, { ...block, level: 90, star: 4, affection: 23, equipment: [9, 9, 9], gear: 2 });
    // Skill buffs such as the passive are not part of the in-game student screen
    expect(stats).toMatchObject({ MaxHP: 34161, AttackPower: 17053 });
  });
  it('adds the passive skill buff only when asked to', () => {
    const withPassive = parseStatStudent({
      AttackPower1: 100,
      AttackPower100: 1000,
      MaxHP1: 100,
      MaxHP100: 1000,
      DefensePower1: 10,
      DefensePower100: 100,
      HealPower1: 10,
      HealPower100: 100,
      Equipment: ['Hat', 'Hairpin', 'Watch'],
      FavorStatType: [],
      FavorStatValue: [],
      Skills: { Passive: { Effects: [{ Stat: 'AttackPower_Coefficient', Value: [[1000, 2000]] }] } },
    });
    if (!withPassive) throw new Error('fixture does not match the schema');
    const plain = { ...block, level: 100, passive: 2 };
    expect(computePlanStats(withPassive, plain).AttackPower).toBe(1000);
    expect(computePlanStats(withPassive, plain, [], { includePassive: true }).AttackPower).toBe(1200);
  });

  it("counts an unrecruited outfit's bond goal toward the target but not the current stats", () => {
    const entry = (id: number) => ({
      AttackPower1: 100,
      AttackPower100: 1000,
      MaxHP1: 100,
      MaxHP100: 1000,
      DefensePower1: 10,
      DefensePower100: 100,
      HealPower1: 10,
      HealPower100: 100,
      Equipment: ['Hat', 'Hairpin', 'Watch'],
      FavorStatType: ['AttackPower'],
      FavorStatValue: [[10], [20]],
      FavorAlts: id === 1 ? [2] : [],
    });
    const catalog = { '1': entry(1), '2': entry(2) };
    const makePlan = (studentId: number, affection: number, recruited?: boolean) =>
      ({ studentId, ...(recruited === false ? { recruited } : {}), current: { ...block, level: 100, affection }, target: { ...block, level: 100, affection } }) as unknown as GrowthPlan;
    const main = makePlan(1, 1);
    const alt = makePlan(2, 6, false);
    // Ranks 2-5 give 10 each and rank 6 gives 20
    expect(resolvePlanStats(main, 'target', catalog, [main, alt])?.AttackPower).toBe(1000 + 4 * 10 + 20);
    expect(resolvePlanStats(main, 'current', catalog, [main, alt])?.AttackPower).toBe(1000);
  });
});
