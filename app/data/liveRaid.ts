import type { RaidInfo } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';

export const LiveRaidInfos = [
  { Id: 'R86', Boss: 'Binah', Location: 'Outdoor', Date: '2026-02-18', Alias: '', MaxLv: 90, Cnt: { All: 20000, Lunatic: 1, Torment: 1, Insane: 1 } },

  //   Id: 'E30',
  //   Boss: 'ShiroKuro',
  //   Location: 'Street',
  //   Type: 'Unarmed',
  //   Date: '2026-01-14',
  //   Alias: '',
  //   MaxLv: 90,
  //   Cnt: { All: 20000, Torment: 1, Insane: 1 },
  // },
  // {
  //   Id: 'E30',
  //   Boss: 'ShiroKuro',
  //   Location: 'Street',
  //   Type: 'ElasticArmor',
  //   Date: '2026-01-14',
  //   Alias: '',
  //   MaxLv: 90,
  //   Cnt: { All: 20000, Torment: 1, Insane: 1 },
  // },
  // {
  //   Id: 'E30',
  //   Boss: 'ShiroKuro',
  //   Location: 'Street',
  //   Type: 'HeavyArmor',
  //   Date: '2026-01-14',
  //   Alias: '',
  //   MaxLv: 90,
  //   Cnt: { All: 20000, Insane: 1 },
  // },
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

// 25.10.29. ~ 25.11.05.
// YESOD

export const getLiveRaidInfo = (locale: Locale) => {
  // return []
  return LiveRaidInfos.map((v) => ({
    ...v,
    Boss: ((locale: Locale) => {
      if (!(v.Boss in bossData)) return v.Boss;
      if (locale == 'ko') return (bossData as any)[v.Boss].name.ko;
      else if (locale == 'ja') return (bossData as any)[v.Boss].name.ja;
      else if (locale == 'en') return (bossData as any)[v.Boss].name.en;
      else return (bossData as any)[v.Boss].name.zh_Hant;
    })(locale),
  }));
};
