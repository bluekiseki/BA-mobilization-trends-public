import type { RaidInfo } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';

interface BossDataEntry {
  name: Record<string, string>;
  teran: string;
  armorType: string;
}

type BossDataMap = Record<string, BossDataEntry>;

// live is a beta service and is not always updated. The metadata of this file is updated only when the live data is updated.

export const LIVE_RAID_DURATION = 7;

export const LiveRaidInfos = [
  { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'LightArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
  { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'HeavyArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Torment: 1, Insane: 1 } },
  { Id: 'E36', Boss: 'Binah', Location: 'Outdoor', Type: 'ElasticArmor', Date: '2026-08-19 11:00:00', Alias: '', MaxLv: 90, Cnt: { All: 20000, Insane: 1 } },
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
] as RaidInfo[];

export const getLiveRaidInfo = (locale: Locale) => {
  // return []
  const bossDataMap = bossData as unknown as BossDataMap;
  return LiveRaidInfos.map((v) => ({
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
  return LiveRaidInfos.filter((raid) => {
    if (seen.has(raid.Id)) return false;
    seen.add(raid.Id);
    return true;
  });
};
