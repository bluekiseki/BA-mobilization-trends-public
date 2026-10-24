import { describe, it, expect } from 'vitest';
import { buildStudentResourceGroups, type ResourceEntry } from './inventoryDashboard';
import { calcLevelNeeds } from '../../../utils/calculatedGrowthNeeds';
import { compactPoolDeficit, FUNGIBLE_POOLS } from '../../../utils/groupMaterialNeeds';
import type { GrowthPlan } from '~/types/growthPlan';
import type { Student, StudentData } from '~/types/plannerData';

// Minimal growth-plan stat block. Only `level` differs from its target in these tests — every
// other field is held equal so calculatedGrowthNeeds' other cost branches (equipment/skill/gear/
// potential/star/uw) all short-circuit on their own current>=target checks and never touch
// student data we haven't bothered to fill in below.
const statBlock = (level: number) => ({
  level,
  star: 1,
  uw: 0,
  uwLevel: 0,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  affection: 1,
  equipment: [0, 0, 0] as [number, number, number],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
});

const makePlan = (studentId: number, fromLevel: number, toLevel: number): GrowthPlan => ({
  uuid: `plan-${studentId}`,
  studentId,
  current: { ...statBlock(fromLevel), eleph: 0, affectionExp: 0 },
  target: statBlock(toLevel),
  includedInEvents: [],
  useEligmaForStar: false,
  eligmaInfo: { price: 0, stock: 0 },
  isSelected: true,
});

// Only the fields calculatedGrowthNeeds' current===target-gated branches would otherwise need are
// filled in with real values; the rest are irrelevant here since those branches never run (see
// statBlock above), so this is deliberately not a full Student fixture.
const makeStudent = (id: number, name: string): Student =>
  ({
    Id: id,
    Name: name,
    Equipment: ['Hat', 'Hairpin', 'Watch'],
    SkillExMaterial: [],
    SkillExMaterialAmount: [],
    SkillMaterial: [],
    SkillMaterialAmount: [],
    PotentialMaterial: 0,
    Gear: {},
  }) as unknown as Student;

const makeEntry = (key: string, owned: number): ResourceEntry => ({
  key,
  category: key.split('_')[0],
  id: key.split('_')[1],
  itemType: 'ExpGrowth',
  rarity: 0,
  owned,
  needed: 0,
  name: key,
  school: null,
  tacticRole: null,
  squadType: null,
  shopCategories: [],
  tags: [],
});

describe('buildStudentResourceGroups', () => {
  it('keeps a fungible-pool tier in the group even when this student needs none of that specific tier', () => {
    // A big enough level jump that calcLevelNeeds allocates from the top report tier down —
    // in practice this means studentNeeds ends up wanting Item_13/Item_12/etc., not Item_10.
    const TARGET_LEVEL = 60;
    const studentNeeds = calcLevelNeeds(0, TARGET_LEVEL);
    expect(studentNeeds['Item_13']).toBeGreaterThan(0); // sanity check: this scenario needs the top tier

    // Shared inventory holds only low-tier reports, deliberately not enough to fully cover the need.
    const pool = FUNGIBLE_POOLS.xpReports[0];
    const requiredXp = pool.keys.reduce((sum, key, i) => sum + (studentNeeds[key] ?? 0) * pool.xpPer[i], 0);
    const ownedItem10 = Math.floor(requiredXp / pool.xpPer[0] / 2); // roughly half covered, in the bottom tier only
    const sharedInventory = { Item_10: ownedItem10 };

    const students: StudentData = { 10001: makeStudent(10001, 'Test Student') };
    const plans = [makePlan(10001, 0, TARGET_LEVEL)];
    // Full catalog the page would normally pass in — every report tier, regardless of whether
    // this specific student's own `needed` for that tier happens to be 0.
    const filteredEntries = ['Item_10', 'Item_11', 'Item_12', 'Item_13'].map((k) => makeEntry(k, k === 'Item_10' ? ownedItem10 : 0));

    const groups = buildStudentResourceGroups(plans, students, filteredEntries, sharedInventory);
    expect(groups).toHaveLength(1);
    const group = groups[0];

    // Item_13 (needed>0 for this student) obviously survives the filter; the regression this
    // guards against is Item_10 (needed=0 for this student) being dropped even though the shared
    // pool has active demand and could actually cover part of it.
    const keys = group.entries.map((e) => e.key);
    expect(keys).toContain('Item_13');
    expect(keys).toContain('Item_10');

    // The pool-corrected deficit matches compactPoolDeficit applied to the same (shared inventory,
    // studentNeeds) pair directly — buildStudentResourceGroups should just be wiring that
    // already-tested calculation to per-student data, not reimplementing it differently.
    const expectedDeficit = compactPoolDeficit(pool, sharedInventory, studentNeeds);
    const expectedByKey = Object.fromEntries(expectedDeficit.map(({ key, amount }) => [key, amount]));
    for (const key of pool.keys) {
      expect(group.fungibleDeficitByKey[key]).toBe(expectedByKey[key] ?? 0);
    }
  });

  it('omits a fungible pool entirely when this student has no demand from it at all', () => {
    const students: StudentData = { 10001: makeStudent(10001, 'Test Student') };
    const plans = [makePlan(10001, 5, 5)]; // no level change -> no report demand at all
    const sharedInventory = { Item_10: 190 };
    const filteredEntries = [makeEntry('Item_10', 190), makeEntry('Item_11', 0)];

    const groups = buildStudentResourceGroups(plans, students, filteredEntries, sharedInventory);
    // No uwDemand (uwLevel unchanged) and no report demand -> this student contributes no group at all.
    expect(groups).toHaveLength(0);
  });
});
