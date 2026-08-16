import { describe, expect, it } from 'vitest';
import { filterByEquipment, matchStudents, parsePosition, uniqueEquipmentMatch } from './match';
import type { StudentRecord } from '../types';

const student: StudentRecord = {
  Id: 1,
  Name: 'Test Student',
  StarGrade: 3,
  SquadType: 'Main',
  Position: 'Back',
  BulletType: 'Explosion',
  ArmorType: 'LightArmor',
  StreetBattleAdaptation: 2,
  OutdoorBattleAdaptation: 0,
  IndoorBattleAdaptation: 4,
  Equipment: ['Hat', 'Hairpin', 'Watch'],
  Weapon: { AdaptationType: 'Street', AdaptationValue: 1 },
};

describe('student matching', () => {
  it('normalizes the observed MIDOLE OCR typo to Middle', () => {
    expect(parsePosition('MIDOLE')).toBe('Middle');
    expect(parsePosition('MIDDLE')).toBe('Middle');
  });

  it('matches categorical fields and allows raised displayed stars', () => {
    expect(matchStudents([student], { bullet: 'Explosion', armor: 'LightArmor', stars: 5 })).toHaveLength(1);
    expect(matchStudents([student], { bullet: 'Mystic' })).toHaveLength(0);
    expect(matchStudents([student], { stars: 2 })).toHaveLength(0);
  });

  it('only applies the terrain bonus with a three-star weapon', () => {
    expect(matchStudents([student], { terrain: ['A', 'D', 'A'], weaponStars: 3 })).toHaveLength(1);
    expect(matchStudents([student], { terrain: ['A', 'D', 'A'], weaponStars: 2 })).toHaveLength(0);
    expect(matchStudents([student], { terrain: ['B', 'D', 'A'], weaponStars: 2 })).toHaveLength(1);
  });

  it('separates Hikari and Nozomi by their ONNX equipment result', () => {
    const hikari: StudentRecord = { ...student, Id: 10117, Name: 'Hikari', Equipment: ['Gloves', 'Hairpin', 'Charm'] };
    const nozomi: StudentRecord = { ...student, Id: 10118, Name: 'Nozomi', Equipment: ['Hat', 'Hairpin', 'Watch'] };
    expect(filterByEquipment([hikari, nozomi], ['Gloves', 'Hairpin', 'Charm']).map((entry) => entry.Name)).toEqual(['Hikari']);
    expect(filterByEquipment([hikari, nozomi], ['Hat', 'Hairpin', 'Watch']).map((entry) => entry.Name)).toEqual(['Nozomi']);
  });

  it('recovers only an unambiguous three-slot equipment match', () => {
    const yuzu: StudentRecord = { ...student, Id: 10018, Name: 'Yuzu', Equipment: ['Hat', 'Hairpin', 'Watch'] };
    const other: StudentRecord = { ...student, Id: 2, Name: 'Other Student', Equipment: ['Shoes', 'Hairpin', 'Necklace'] };
    expect(uniqueEquipmentMatch([yuzu, other], ['Hat', 'Hairpin', 'Watch'])).toEqual([yuzu]);
    expect(uniqueEquipmentMatch([yuzu, { ...yuzu, Id: 3 }], ['Hat', 'Hairpin', 'Watch'])).toEqual([]);
  });
});
