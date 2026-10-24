// Tactical Challenge seasons per server schedule (app/data/{jp,kr}/schedule/arena.csv). Records are stored one bucket per
// season, keyed "<server>-<official season number>"; records before the first listed season share the "<server>-0" bucket.
import jpArenaCsvRaw from '~/data/jp/schedule/arena.csv?raw';
import krArenaCsvRaw from '~/data/kr/schedule/arena.csv?raw';
import { getKstTime } from '~/data/globalRaidDates';
import { parseCsvString } from '~/utils/calender.data';
import type { ProfileServer } from '~/utils/profileServer';

// JP has its own schedule; every other server follows the global (KR) schedule.
export type ArenaServer = 'jp' | 'gl';

export const ARENA_SERVERS: { value: ArenaServer; label: string }[] = [
  { value: 'jp', label: 'JP' },
  { value: 'gl', label: 'Global' },
];

export const toArenaServer = (server: ProfileServer): ArenaServer => (server === 'jp' ? 'jp' : 'gl');

export interface ArenaSeason {
  key: string;
  server: ArenaServer;
  // Official season number; 0 = before the first listed season.
  season: number;
  start: number;
  terrain: string | null;
}

interface SeasonRow {
  season: number;
  startTime: string;
  endTime: string | null;
  terrain: string | null;
}

export const seasonKey = (server: ArenaServer, season: number) => `${server}-${season}`;

export function parseSeasonKey(key: string): { server: ArenaServer; season: number } | null {
  const match = /^(jp|gl)-(\d+)$/.exec(key);
  return match ? { server: match[1] as ArenaServer, season: Number(match[2]) } : null;
}

export function parseSeasons(server: ArenaServer, csv: string): ArenaSeason[] {
  return parseCsvString<SeasonRow>(csv)
    .filter((row) => Number.isInteger(row.season) && typeof row.startTime === 'string')
    .map((row) => ({ key: seasonKey(server, row.season), server, season: row.season, start: getKstTime(row.startTime), terrain: row.terrain || null }))
    .sort((a, b) => a.start - b.start);
}

const SEASONS: Record<ArenaServer, ArenaSeason[]> = {
  jp: parseSeasons('jp', jpArenaCsvRaw),
  gl: parseSeasons('gl', krArenaCsvRaw),
};

export const arenaSeasons = (server: ArenaServer): ArenaSeason[] => SEASONS[server];

// A season lasts until the next one starts (the settlement gap belongs to the season that just ended).
export function seasonAt(seasons: ArenaSeason[], server: ArenaServer, at: number): string {
  let key = seasonKey(server, 0);
  for (const season of seasons) if (season.start <= at) key = season.key;
  return key;
}

export const seasonKeyFor = (server: ArenaServer, at: number) => seasonAt(SEASONS[server], server, at);

export const currentSeasonKey = (server: ArenaServer, now = Date.now()) => seasonKeyFor(server, now);

// e.g. "Season 11 · Outdoor"; the pre-schedule bucket is "Before season 10".
export function seasonLabel(key: string): string {
  const parsed = parseSeasonKey(key);
  if (!parsed) return key;
  const seasons = SEASONS[parsed.server];
  if (parsed.season === 0) return seasons.length ? `Before season ${seasons[0].season}` : 'All seasons';
  const terrain = seasons.find((s) => s.key === key)?.terrain;
  return terrain ? `Season ${parsed.season} · ${terrain}` : `Season ${parsed.season}`;
}
