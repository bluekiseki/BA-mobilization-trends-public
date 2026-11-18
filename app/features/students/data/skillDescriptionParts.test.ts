import { describe, expect, it } from 'vitest';
import { skillDescriptionParts, skillDescription, type PublicSkill } from './publicStudent';

const skill = (Desc: string, Parameters: string[][]): PublicSkill => ({ Name: 'Skill', Desc, Parameters });

// Abydos Hoshino's EX skill: a knockback distance tag and a second parameter that carries its own tag and line break
const hoshino = skill('부채꼴범위 내의 적에게 공격력 <?1> 대미지, 1타마다 적을 <kb:1>씩 넉백<?2>', [
  ['435%', '501%', '566%', '632%', '697%'],
  ['', '', '/\n<c:Stunned>(1초간)', '/\n<c:Stunned>(1초간)', '/\n<c:Stunned>(1.4초간)'],
]);

describe('skillDescriptionParts', () => {
  it('keeps the knockback distance and resolves tags inside a parameter value', () => {
    const parts = skillDescriptionParts(hoshino, 5);
    expect(parts).toContainEqual({ kind: 'value', text: '697%' });
    expect(parts).toContainEqual({ kind: 'value', text: '1' });
    expect(parts).toContainEqual({ kind: 'tag', statKey: 'CC_Stunned', name: 'Stunned' });
    expect(parts.some((part) => part.kind === 'text' && part.text.includes('<'))).toBe(false);
  });

  it('shows nothing for an empty parameter at a level without the effect', () => {
    const text = skillDescriptionParts(hoshino, 1)
      .map((part) => (part.kind === 'tag' ? `[${part.name}]` : part.text))
      .join('');
    expect(text).toBe('부채꼴범위 내의 적에게 공격력 435% 대미지, 1타마다 적을 1씩 넉백');
  });

  it('reads sentence-like values as text, not as highlighted numbers', () => {
    const parts = skillDescriptionParts(skill('Hits<?1>', [[' and inflicts <c:Stunned> for 1s.']]), 1);
    expect(parts.filter((part) => part.kind === 'value')).toEqual([]);
    expect(parts).toContainEqual({ kind: 'tag', statKey: 'CC_Stunned', name: 'Stunned' });
  });
});

describe('skillDescription', () => {
  it('prints the knockback distance as a number', () => {
    expect(skillDescription(hoshino, 1, () => 'x')).toBe('부채꼴범위 내의 적에게 공격력 435% 대미지, 1타마다 적을 1씩 넉백');
  });
});
