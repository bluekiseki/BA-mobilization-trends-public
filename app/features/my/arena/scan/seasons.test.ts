import { describe, expect, it } from 'vitest';
import { getKstTime } from '~/data/globalRaidDates';
import { parseSeasonKey, parseSeasons, seasonAt, seasonKeyFor, seasonLabel, toArenaServer } from './seasons';

const gmt_9 = (date: string) => getKstTime(date);

describe('seasonAt', () => {
  const seasons = parseSeasons('jp', 'season,startTime,endTime,terrain\n11,2026-05-20 11:00:00,,Outdoor\n10,2025-11-05 11:00:00,2026-05-20 10:59:59,Urban\n');

  it('files a time into the latest season that started by then', () => {
    expect(seasonAt(seasons, 'jp', gmt_9('2025-11-05 11:00:00'))).toBe('jp-10');
    expect(seasonAt(seasons, 'jp', gmt_9('2026-05-20 10:59:59'))).toBe('jp-10');
    expect(seasonAt(seasons, 'jp', gmt_9('2026-05-20 11:00:00'))).toBe('jp-11');
    expect(seasonAt(seasons, 'jp', gmt_9('2030-01-01 00:00:00'))).toBe('jp-11');
  });

  it('uses bucket 0 before the first listed season', () => {
    expect(seasonAt(seasons, 'jp', gmt_9('2025-11-05 10:59:59'))).toBe('jp-0');
    expect(seasonAt([], 'gl', Date.now())).toBe('gl-0');
  });
});

describe('schedule data', () => {
  it('JP and global are both in season 11 (2026-10-05)', () => {
    expect(seasonKeyFor('jp', gmt_9('2026-10-05 12:00:00'))).toBe('jp-11');
    expect(seasonKeyFor('gl', gmt_9('2026-10-05 12:00:00'))).toBe('gl-11');
    expect(seasonKeyFor('gl', gmt_9('2026-09-08 10:59:59'))).toBe('gl-10');
  });

  it('maps every non-JP server to the global schedule', () => {
    expect(toArenaServer('jp')).toBe('jp');
    expect(['kr', 'tw', 'asia', 'global', 'na'].map((s) => toArenaServer(s as Parameters<typeof toArenaServer>[0]))).toEqual(['gl', 'gl', 'gl', 'gl', 'gl']);
  });

  it('labels seasons with their official number and terrain', () => {
    expect(seasonLabel('gl-11')).toBe('Season 11 · Outdoor');
    expect(seasonLabel('jp-10')).toBe('Season 10 · Urban');
    expect(seasonLabel('jp-0')).toBe('Before season 1');
  });

  it('parses only well-formed keys', () => {
    expect(parseSeasonKey('gl-11')).toEqual({ server: 'gl', season: 11 });
    expect(parseSeasonKey('kr-11')).toBeNull();
    expect(parseSeasonKey('gl-x')).toBeNull();
  });
});
