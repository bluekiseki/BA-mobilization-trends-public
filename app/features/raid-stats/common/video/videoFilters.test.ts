import { describe, expect, it } from 'vitest';
import type { VideoEntry } from './types';
import { createVideoFilters, getActiveVideoFilterCount, hasVideoPartyInfo, matchesVideoFilters, matchesVideoScore } from './videoFilters';

function video(ids: number[][]): VideoEntry {
  return {
    url: 'https://www.youtube.com/watch?v=test',
    title: 'Test clear',
    score: 100,
    difficulty: 'Torment',
    has_tl: true,
    is_target_type: true,
    boss_types: ['Mystic'],
    num_parties: 2,
    channel_name: 'Test',
    channel_id: 'test',
    parties: ids.map((party) => party.map((id) => ({ id, name_ja: '', name_en: '', grade: '' }))),
  };
}

describe('video filters', () => {
  it('shows missing party information by default and hides it only when requested', () => {
    for (const parties of [[], [[]], [[0, -1, Number.NaN, 1.5]]]) {
      const entry = video(parties);
      expect(hasVideoPartyInfo(entry)).toBe(false);
      expect(matchesVideoFilters(entry, createVideoFilters(), 'All')).toBe(true);
      expect(matchesVideoFilters(entry, { ...createVideoFilters(), partyInfoOnly: true }, 'All')).toBe(false);
    }
  });

  it('accepts partial recognition regardless of grades or reported party count', () => {
    const entry = { ...video([[], [1]]), num_parties: 0 };
    expect(hasVideoPartyInfo(entry)).toBe(true);
    expect(matchesVideoFilters(entry, { ...createVideoFilters(), partyInfoOnly: true }, 'All')).toBe(true);
  });

  it('combines party information, students, difficulty, TL, and boss type', () => {
    const filters = {
      ...createVideoFilters(),
      difficulty: 'Torment',
      tlOnly: true,
      targetTypeOnly: true,
      partyInfoOnly: true,
      students: { excludeIds: [1, 2], includeIds: [3, 4], allowAssist: true },
    };
    expect(
      matchesVideoFilters(
        video([
          [1, 3],
          [2, 4],
        ]),
        filters,
        'Unarmed',
      ),
    ).toBe(true);
    expect(matchesVideoFilters(video([[1, 2, 3], [4]]), filters, 'Unarmed')).toBe(false);
    expect(
      matchesVideoFilters(
        video([
          [1, 3],
          [2, 4],
        ]),
        filters,
        'LightArmor',
      ),
    ).toBe(false);
    expect(
      matchesVideoFilters(
        {
          ...video([
            [1, 3],
            [2, 4],
          ]),
          has_tl: false,
        },
        filters,
        'All',
      ),
    ).toBe(false);
    expect(
      matchesVideoFilters(
        {
          ...video([
            [1, 3],
            [2, 4],
          ]),
          is_target_type: false,
        },
        filters,
        'All',
      ),
    ).toBe(false);
    expect(
      matchesVideoFilters(
        {
          ...video([
            [1, 3],
            [2, 4],
          ]),
          difficulty: 'Insane',
        },
        filters,
        'All',
      ),
    ).toBe(false);
  });

  it('keeps the pre-score predicate independent of the selected range', () => {
    const filters = { ...createVideoFilters(), scoreMin: 101, scoreMax: 200 };
    expect(matchesVideoFilters(video([[1]]), filters, 'All')).toBe(true);
    expect(matchesVideoScore(video([[1]]), filters)).toBe(false);
    expect(matchesVideoScore({ ...video([[1]]), score: 101 }, filters)).toBe(true);
    expect(matchesVideoScore({ ...video([[1]]), score: 200 }, filters)).toBe(true);
    expect(matchesVideoScore({ ...video([[1]]), score: 201 }, filters)).toBe(false);
    expect(matchesVideoScore({ ...video([[1]]), score: undefined }, filters)).toBe(false);
    expect(matchesVideoScore({ ...video([[1]]), score: undefined }, createVideoFilters())).toBe(true);
  });

  it('counts range bounds as one group and assist as an exclusion modifier', () => {
    const filters = { ...createVideoFilters(), scoreMin: 1, scoreMax: 2, students: { excludeIds: [1, 2], includeIds: [3], allowAssist: true } };
    expect(getActiveVideoFilterCount(filters)).toBe(3);
    expect(getActiveVideoFilterCount({ ...filters, partyInfoOnly: true })).toBe(4);
    expect(getActiveVideoFilterCount(createVideoFilters())).toBe(0);
  });
});
