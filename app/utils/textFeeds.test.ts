import { describe, expect, it } from 'vitest';
import { buildRaidUsage, formatSchedule, getFavorStatAt, jstToIso } from './textFeeds';
import type { RaidInfo } from '~/types/data';
import type { ScheduleItemV2 } from './calender.data.v2';
import type { I18nLike } from './scheduleDisplay';

const ctx = { baseUrl: 'https://example.test', generatedAt: new Date('2026-10-15T00:00:00Z') };
const i18n: I18nLike = { t: (key) => key, language: 'en', getFixedT: () => (key) => key };

const item = (id: string, start: string, end: string): ScheduleItemV2 => ({ id, type: 'misc', startTime: start, endTime: end, i18nKey: id });

describe('formatSchedule', () => {
  it('keeps the full history sorted by start', () => {
    const tracks = {
      misc: [
        item('late', '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
        item('old', '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
        item('ongoing', '2026-09-01T00:00:00.000Z', '2026-10-20T00:00:00.000Z'),
      ],
    };
    const out = formatSchedule(tracks, 'jp', {}, 'en', i18n, ctx);
    const rows = out
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .slice(1);
    expect(rows.map((r) => r.split('\t')[1])).toEqual(['old', 'ongoing', 'late']);
    expect(rows[0].split('\t')[2]).toBe('2026-08-01T00:00:00Z');
  });
});

describe('getFavorStatAt', () => {
  // Eimi: DefensePower / MaxHP per-rank gains for ranks 2-5, 6-10, 11-15, 16-20, 21-30, 31-40, 41-50.
  const eimi = [
    [1, 0],
    [2, 0],
    [2, 128],
    [3, 153],
    [1, 27],
    [1, 40],
    [2, 67],
  ];
  it('accumulates per-rank gains bracket by bracket', () => {
    expect(getFavorStatAt(eimi, 1)).toEqual([0, 0]);
    expect(getFavorStatAt(eimi, 5)).toEqual([4, 0]);
    expect(getFavorStatAt(eimi, 15)).toEqual([24, 640]);
    expect(getFavorStatAt(eimi, 50)).toEqual([79, 2745]);
    expect(getFavorStatAt(eimi, 99)).toEqual([79, 2745]);
  });
});

describe('jstToIso', () => {
  it('converts JST game timestamps to UTC', () => {
    expect(jstToIso('2026-10-07 11:00:00')).toBe('2026-10-07T02:00:00Z');
    expect(jstToIso(undefined)).toBe('');
  });
});

describe('buildRaidUsage', () => {
  const raid = (Id: string, Type?: RaidInfo['Type']): RaidInfo => ({
    Id,
    Boss: 'Boss',
    Type,
    Date: '2026-01-01',
    Location: 'Street',
    MaxLv: 90,
    Cnt: { All: 100, Lunatic: 0, Torment: 100, Insane: 0 },
  });
  const raids = [raid('R1'), raid('E1', 'LightArmor'), raid('E1', 'HeavyArmor'), raid('R2')];

  it('keeps the latest seasons (all Grand Assault entries), newest first, splitting own and borrowed', () => {
    const usage = buildRaidUsage({ '3|10000|5|1': 30, '3|10000|-5|1': 2, '2|10000|6|0': 7, '0|10000|5|1': 99 }, raids, 'jp', 2);
    const rows = usage.get(10000) ?? [];
    expect(rows.map((r) => r.label)).toEqual(['R2 Boss (Street)', 'E1 Boss HeavyArmor (Street)', 'E1 Boss LightArmor (Street)']);
    expect(rows[0]).toMatchObject({ own: 30, borrowed: 2, sample: 100 });
    expect(rows[1]).toMatchObject({ own: 7, borrowed: 0 });
    expect(rows[2]).toMatchObject({ own: 0, borrowed: 0 });
  });
});

describe('fillSkillParamsAllLevels', () => {
  it('lists every level and collapses values that never change', async () => {
    const { fillSkillParamsAllLevels } = await import('./skillDescTags');
    expect(
      fillSkillParamsAllLevels('ATK <?1> for <?2>s', [
        ['100%', '150%', '200%'],
        ['5', '5', '5'],
      ]),
    ).toBe('ATK {100%/150%/200%} for 5s');
  });
});

describe('shared feed and page data rules', () => {
  it('resolves archived and rerun event entries without changing the original id', async () => {
    const { findEventEntry, getPlannerEventName, isRerunEvent } = await import('./eventList');
    const entry = { Name: 'Event', Kr: 'KR', Jp: 'JP', En: null, Tw: null, OpenTime: '', CloseTime: '' };
    const events = { '849': entry, '60849': { ...entry, En: 'Archive' } };
    expect(findEventEntry(events, 10849)).toBe(entry);
    expect(getPlannerEventName(events, 10849, 'en')).toBe('JP');
    expect(getPlannerEventName(events, 60849, 'en')).toBe('Archive');
    expect(getPlannerEventName(events, 999, 'en', 'Missing')).toBe('Missing');
    expect(isRerunEvent(10849)).toBe(true);
    expect(isRerunEvent(60849)).toBe(false);
  });

  it('selects team sources at the documented season boundaries', async () => {
    const { getRaidTeamDataSource } = await import('../data/raidTeamDataSources');
    expect(getRaidTeamDataSource('jp', 'R46')).toContain('storage.googleapis.com');
    expect(getRaidTeamDataSource('jp', 'R47')).toContain('arona.ai/raidreport');
    expect(getRaidTeamDataSource('jp', 'R79')).toContain('arona.ai/raidreport');
    expect(getRaidTeamDataSource('jp', 'R80')).toContain('plana-stats.com');
    expect(getRaidTeamDataSource('jp', 'E23')).toContain('arona.ai/eraidreport');
    expect(getRaidTeamDataSource('jp', 'E24')).toContain('plana-stats.com');
    expect(getRaidTeamDataSource('kr', 'R80')).toContain('docs.google.com/spreadsheets');
  });
});
