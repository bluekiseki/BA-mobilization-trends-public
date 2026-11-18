import { describe, expect, it } from 'vitest';
import type { Skill, Skills } from '~/types/plannerData';
import { createSkillFilter, getSkillTraits, matchesSkillFilter, withSkillCategories } from './skillFilter';

type Effect = Skill['Effects'][number];
const effect = (fields: Partial<Effect> & Pick<Effect, 'Type'>): Effect => ({ Block: 0, CriticalCheck: 'Check', Hits: [], DescParamId: 0, Scale: [], ...fields });
const skill = (effects: Effect[], radius = false): Skill => ({ Name: '', Desc: '', Parameters: [], Icon: '', Radius: radius ? [{ Type: 'Circle', Radius: 200 }] : undefined, Effects: effects });
const empty = skill([]);
const skills = (overrides: Partial<Skills>): Skills => ({ Ex: empty, Public: empty, Passive: empty, ExtraPassive: empty, WeaponPassive: empty, ...overrides });

describe('getSkillTraits', () => {
  it('classifies target by radius and enemy effects', () => {
    expect(getSkillTraits(skill([effect({ Type: 'Damage' })], true)).target).toBe('aoe');
    expect(getSkillTraits(skill([effect({ Type: 'Damage' })])).target).toBe('single');
    expect(getSkillTraits(skill([effect({ Type: 'Buff', Target: ['Self'], Stat: 'AttackPower_Base' })])).target).toBeNull();
    expect(getSkillTraits(skill([effect({ Type: 'Buff', Target: ['Enemy'], Stat: 'DefensePower_Coefficient' })])).target).toBeNull();
  });

  it('splits buffs and debuffs by target and names the stat', () => {
    const traits = getSkillTraits(
      skill([
        effect({ Type: 'Buff', Target: ['AllyMain'], Stat: 'AttackPower_Coefficient' }),
        effect({ Type: 'Buff', Target: ['Enemy'], Stat: 'DefensePower_Coefficient' }),
        effect({ Type: 'Heal', Target: 'AllySelf' }),
      ]),
    );
    expect([...traits.effects].sort()).toEqual(['buff:ATK', 'debuff:DEF', 'heal:heal']);
  });

  it('falls back to "etc" for unknown stats and CC icons', () => {
    const traits = getSkillTraits(skill([effect({ Type: 'Buff', Target: ['Self'], Stat: 'IgnoreDelayCount_Base' }), effect({ Type: 'CrowdControl', Icon: 'Mystery' })]));
    expect([...traits.effects].sort()).toEqual(['buff:etc', 'cc:etc']);
  });
});

describe('matchesSkillFilter', () => {
  const exAoeDebuff = skill([effect({ Type: 'Damage' }), effect({ Type: 'Buff', Target: ['Enemy'], Stat: 'DefensePower_Coefficient' })], true);
  const passiveAtkBuff = skill([effect({ Type: 'Buff', Target: ['Self'], Stat: 'AttackPower_Coefficient' })]);
  const student = skills({ Ex: exAoeDebuff, Passive: passiveAtkBuff });

  it('matches everything while inactive', () => {
    expect(matchesSkillFilter(undefined, createSkillFilter())).toBe(true);
  });

  it('requires one skill to satisfy all groups', () => {
    const filter = createSkillFilter();
    filter.types.add('passive');
    filter.targets.add('aoe');
    expect(matchesSkillFilter(student, filter)).toBe(false);
    filter.types.add('ex');
    expect(matchesSkillFilter(student, filter)).toBe(true);
  });

  it('judges the damage range on the EX skill when no type is picked', () => {
    const hifumi = skills({ Ex: skill([effect({ Type: 'Damage' }), effect({ Type: 'Summon' })], true), Public: skill([effect({ Type: 'Damage' })]) });
    const single = { ...createSkillFilter(), targets: new Set(['single' as const]) };
    expect(matchesSkillFilter(hifumi, single)).toBe(false);
    expect(matchesSkillFilter(hifumi, { ...single, types: new Set(['normal' as const]) })).toBe(true);
    expect(matchesSkillFilter(hifumi, { ...createSkillFilter(), targets: new Set(['aoe' as const]) })).toBe(true);
  });

  it('ORs picks within a group and narrows a category by its subs', () => {
    let filter = withSkillCategories(createSkillFilter(), new Set(['buff', 'cc']));
    expect(matchesSkillFilter(student, filter)).toBe(true);
    filter = { ...filter, subs: new Set(['buff:MAXHP']) };
    expect(matchesSkillFilter(student, filter)).toBe(false);
    filter = { ...filter, subs: new Set(['buff:MAXHP', 'buff:ATK']) };
    expect(matchesSkillFilter(student, filter)).toBe(true);
  });

  it('drops sub picks when their category is unpicked', () => {
    const picked = { ...withSkillCategories(createSkillFilter(), new Set(['buff', 'debuff'])), subs: new Set(['buff:ATK', 'debuff:DEF'] as const) };
    expect([...withSkillCategories(picked, new Set(['debuff'])).subs]).toEqual(['debuff:DEF']);
  });
});
