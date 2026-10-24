import type { GameServer } from '~/types/data';

const googleStorage = { name: "Someone's Google Storage API", url: 'https://storage.googleapis.com/info.herdatasam.me' };
const planaStats = { name: 'Plana Stats', url: 'https://www.plana-stats.com/' };

export const RAID_TEAM_DATA_SOURCES = {
  total: [
    { from: 43, through: 46, ...googleStorage },
    { from: 47, through: 79, name: 'Arona.AI Total Assault Report', url: 'https://arona.ai/raidreport', unavailable: true },
    { from: 80, through: Infinity, ...planaStats },
  ],
  grand: [
    { from: 1, through: 23, name: 'Arona.AI Grand Assault Report', url: 'https://arona.ai/eraidreport', unavailable: true },
    { from: 24, through: Infinity, ...planaStats },
  ],
  kr: [{ name: 'Total Assault & Grand Assault Distribution Google Spreadsheets', url: 'https://docs.google.com/spreadsheets/d/1JGBeDCu8KtVIsWd4QbQhNJekeG1YD8ZmGmbfXYznT7k' }, googleStorage],
};

const credit = (source: { name: string; url: string }): string => `${source.name} (${source.url})`;

export function getRaidTeamDataSource(server: GameServer, raidId: string): string {
  if (server === 'kr') return RAID_TEAM_DATA_SOURCES.kr.map(credit).join(', ');
  const sources = raidId.startsWith('E') ? RAID_TEAM_DATA_SOURCES.grand : RAID_TEAM_DATA_SOURCES.total;
  const season = Number(raidId.slice(1));
  return credit(sources.find((source) => season <= source.through) ?? sources[sources.length - 1]);
}
