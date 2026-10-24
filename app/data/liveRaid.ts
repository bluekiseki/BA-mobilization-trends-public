import type { GameServer, RaidInfo } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';

interface BossDataEntry {
  name: Record<string, string>;
  teran: string;
  armorType: string;
}

type BossDataMap = Record<string, BossDataEntry>;

// live is a beta service and is not always updated. The metadata of this file is updated only when the live data is updated.

// export const LiveRaidInfos = [
// { Id: 'R92', Boss: 'Perorozilla', Location: 'Indoor', Date: '2026-09-02 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'LightArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'HeavyArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'ElasticArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'R91', Boss: 'Hieronymus_Street', Location: 'Street', Date: '2026-08-05 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E35', Boss: 'HOD_Indoor', Location: 'Indoor', Type: 'HeavyArmor', Date: '2026-07-15 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E35', Boss: 'HOD_Indoor', Location: 'Indoor', Type: 'ElasticArmor', Date: '2026-07-15 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E35', Boss: 'HOD_Indoor', Location: 'Indoor', Type: 'LightArmor', Date: '2026-07-15 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'R90', Boss: 'EN0005', Location: 'Indoor', Date: '2026-07-01 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E34', Boss: 'HoverCraft', Location: 'Outdoor', Type: 'Unarmed', Date: '2026-06-17 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E34', Boss: 'HoverCraft', Location: 'Outdoor', Type: 'ElasticArmor', Date: '2026-06-17 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E34', Boss: 'HoverCraft', Location: 'Outdoor', Type: 'LightArmor', Date: '2026-06-17 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'R89', Boss: 'EN0022', Location: 'Street', Date: '2026-06-03 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E33', Boss: 'EN0006', Location: 'Street', Type: 'Unarmed', Date: '2026-05-13 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E33', Boss: 'EN0006', Location: 'Street', Type: 'LightArmor', Date: '2026-05-13 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E33', Boss: 'EN0006', Location: 'Street', Type: 'ElasticArmor', Date: '2026-05-13 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'R88', Boss: 'Kaitenger_Street', Location: 'Outdoor', Date: '2026-04-29 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E32', Boss: 'Perorozilla_Outdoor', Location: 'Outdoor', Type: 'HeavyArmor', Date: '2026-04-08 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E32', Boss: 'Perorozilla_Outdoor', Location: 'Outdoor', Type: 'Unarmed', Date: '2026-04-08 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E32', Boss: 'Perorozilla_Outdoor', Location: 'Outdoor', Type: 'ElasticArmor', Date: '2026-04-08 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'R87', Boss: 'Goz', Location: 'Outdoor', Date: '2026-03-25 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },
// { Id: 'E31', Boss: 'Hieronymus_Street', Location: 'Street', Type: 'HeavyArmor', Date: '2026-03-04 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E31', Boss: 'Hieronymus_Street', Location: 'Street', Type: 'Unarmed', Date: '2026-03-04 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
// { Id: 'E31', Boss: 'Hieronymus_Street', Location: 'Street', Type: 'LightArmor', Date: '2026-03-04 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
// { Id: 'E30', Boss: 'ShiroKuro', Location: 'Street', Type: 'Unarmed', Date: '2026-01-14', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 },},
// { Id: 'E30', Boss: 'ShiroKuro', Location: 'Street', Type: 'ElasticArmor', Date: '2026-01-14', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 },},
// { Id: 'E30', Boss: 'ShiroKuro', Location: 'Street', Type: 'HeavyArmor', Date: '2026-01-14', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 },},
// { "Id": "R85", "Boss": "HoverCraft", "Location": "Outdoor", "Date": "2025-12-31", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Lunatic": 1, "Torment": 1, "Insane": 1 } },
// { "Id": "E29", "Boss": "Kaitenger", "Location": "Street", "Type": "LightArmor", "Date": "2025-12-10", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Insane": 1 } },
// { "Id": "E29", "Boss": "Kaitenger", "Location": "Street", "Type": "HeavyArmor", "Date": "2025-12-10", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1, "Insane": 1 } },
// { "Id": "E29", "Boss": "Kaitenger", "Location": "Street", "Type": "Unarmed", "Date": "2025-12-10", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1, "Insane": 1 } },
// { "Id": "R84", "Boss": "EN0006", "Location": "Street", "Date": "2025-11-26", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Lunatic": 1, "Torment": 1, "Insane": 1 } },
// { "Id": "E28", "Boss": "Hieronymus", "Location": "Street", "Type": "Unarmed", "Date": "2025-11-12", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1, "Insane": 1 } },
// { "Id": "E28", "Boss": "Hieronymus", "Location": "Street", "Type": "LightArmor", "Date": "2025-11-12", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1, "Insane": 1 } },
// { "Id": "E28", "Boss": "Hieronymus", "Location": "Street", "Type": "ElasticArmor", "Date": "2025-11-12", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Insane": 1 } }
// { "Id": "R83", "Boss": "Yesod", "Location": "Street", "Date": "2025-10-29", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Lunatic": 1, "Torment": 1, "Insane": 1 } },
// { "Id": "E27", "Boss": "Shiro&Kuro", "Location": "Indoor", "Type": "LightArmor", "Date": "2025-10-15", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1,  "Insane": 1 } },
// { "Id": "E27", "Boss": "Shiro&Kuro", "Location": "Indoor", "Type": "ElasticArmor", "Date": "2025-10-15", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Torment": 1,  "Insane": 1 } },
// { "Id": "E27", "Boss": "Shiro&Kuro", "Location": "Indoor", "Type": "Unarmed", "Date": "2025-10-15", "Alias": "", "MaxLv": 90, "Cnt": { "All": 20000, "Insane": 1} }
// ] as RaidInfo[];

// Cutoff scores / max level are not part of the schedule; the /live page pulls the real numbers from R2.
const PLACEHOLDER_CNT: RaidInfo['Cnt'] = { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 };
const PLACEHOLDER_MAX_LV = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// GMT+9 wall-clock string ("YYYY-MM-DD HH:mm:ss"), matching the format the entries used to be written in by hand.
const toKstDateString = (iso: string) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

// Derived from the JP raid schedule instead of a hand-maintained list: the most recently started raid.
function getCurrentLiveRaid(server: GameServer = 'jp') {
  const now = Date.now();
  const raidTrack = loadScheduleDataV2({ server, tracksToLoad: ['raid'] }).tracks.raid ?? [];

  return raidTrack
    .filter((item) => (item.type === 'raid' || item.type === 'eraid') && new Date(item.startTime).getTime() <= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .at(-1);
}

// Round a partial day up: a 4-day, 4-hour raid is displayed as 5 days.
export function getLiveRaidDuration(): number {
  const current = getCurrentLiveRaid();
  if (!current) return 0;

  const duration = new Date(current.endTime).getTime() - new Date(current.startTime).getTime();
  // console.log('getLiveRaidDuration', Math.max(0, Math.ceil(duration / MILLISECONDS_PER_DAY)));
  return Math.max(0, Math.ceil(duration / MILLISECONDS_PER_DAY));
}

// Start/end dates (GMT+9, "YYYY-MM-DD") of every past or current JP raid / elimination raid season, keyed by season number.
export function getRaidSeasonPeriods(type: 'raid' | 'eraid'): Record<string, { start: string; end: string }> {
  const track = loadScheduleDataV2({ server: 'jp', tracksToLoad: ['raid'] }).tracks.raid ?? [];
  const periods: Record<string, { start: string; end: string }> = {};
  for (const item of track) {
    if (item.type !== type) continue;
    periods[item.id.split('-')[1]] = { start: toKstDateString(item.startTime).slice(0, 10), end: toKstDateString(item.endTime).slice(0, 10) };
  }
  return periods;
}

function buildLiveRaidInfos(server: GameServer = 'jp'): RaidInfo[] {
  const current = getCurrentLiveRaid(server);
  if (!current) return [];

  const season = current.id.split('-')[1];
  const date = toKstDateString(current.startTime);
  const location = current.details?.terrain ?? '';

  if (current.type === 'raid') {
    return [{ Id: `R${season}`, Boss: current.bossKey ?? '', Location: location, Date: date, Alias: '', MaxLv: PLACEHOLDER_MAX_LV, Cnt: PLACEHOLDER_CNT }];
  }

  // Grand Assault — one entry per defense type.
  return (current.details?.bosses ?? []).map((boss) => ({
    Id: `E${season}`,
    Boss: current.bossKey ?? '',
    Type: boss.armorType,
    Location: location,
    Date: date,
    Alias: '',
    MaxLv: PLACEHOLDER_MAX_LV,
    Cnt: PLACEHOLDER_CNT,
  }));
}

const cached: Partial<Record<GameServer, RaidInfo[]>> = {};
// Lazy + memoized: keeps schedule data out of client bundles that only need live raid metadata.
const getLiveRaidInfos = (server: GameServer = 'jp') => (cached[server] ??= buildLiveRaidInfos(server));

/** Schedule-derived placeholder for the season currently running on `server`, so it can be selected before statistics exist. */
export const getLiveRaidInfo = (locale: Locale, server: GameServer = 'jp') => {
  const bossDataMap = bossData as unknown as BossDataMap;
  return getLiveRaidInfos(server).map((v) => ({
    ...v,
    Boss: ((locale: Locale) => {
      const boss = bossDataMap[v.Boss];
      if (!boss) return v.Boss;
      if (locale == 'ko') return boss.name.ko;
      else if (locale == 'ja') return boss.name.ja;
      else if (locale == 'en') return boss.name.en;
      else return boss.name.zh_Hant;
    })(locale),
  }));
};

// Get unique raids by Id for display
export const getUniqueLiveRaids = () => {
  const seen = new Set<string>();
  return getLiveRaidInfos().filter((raid) => {
    if (seen.has(raid.Id)) return false;
    seen.add(raid.Id);
    return true;
  });
};
