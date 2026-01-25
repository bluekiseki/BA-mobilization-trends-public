import raidDataRaw_jp_en from '~/data/jp/en.raid_info.json';
import raidDataRaw_jp_ko from '~/data/jp/ko.raid_info.json';
import raidDataRaw_jp_ja from '~/data/jp/ja.raid_info.json';
import raidDataRaw_jp_zh_Hant from '~/data/jp/zh_Hant.raid_info.json';
import raidDataRaw_kr_en from '~/data/kr/en.raid_info.json';
import raidDataRaw_kr_ko from '~/data/kr/ko.raid_info.json';
import raidDataRaw_kr_ja from '~/data/kr/ja.raid_info.json';

import raidFullDataRaw_jp from '~/data/jp/full.raidinfo.json';
import raidFullDataRaw_kr from '~/data/kr/full.raidinfo.json';
import type { GameServer, RaidFullInfo, RaidInfo } from '~/types/data';
import type { Locale } from './i18n/config';

export function loadRaidFullInfos(server: GameServer) {
  const raidInfos = [raidFullDataRaw_jp, raidFullDataRaw_kr][['jp', 'kr'].indexOf(server)];
  return raidInfos as RaidFullInfo[];
}

export function loadRaidInfos(server: GameServer, locale: Locale) {
  const raidInfos = [raidDataRaw_jp_en, raidDataRaw_jp_ko, raidDataRaw_jp_ja, raidDataRaw_jp_zh_Hant, raidDataRaw_kr_en, raidDataRaw_kr_ko, raidDataRaw_kr_ja, raidDataRaw_kr_en][
    ['jp', 'kr'].indexOf(server) * 4 + ['en', 'ko', 'ja', 'zh-Hant'].indexOf(locale)
  ];

  return raidInfos as RaidInfo[];
}
export function loadRaidInfo(server: GameServer, locale: Locale, id: string, bossType?: string) {
  const raidInfos = loadRaidInfos(server, locale);

  for (const raid of raidInfos) {
    if (raid.Id == id) {
      if (!bossType || bossType == raid.Type) return raid;
    }
  }
}

export function loadRaidInfosById(server: GameServer, locale: Locale, id: string): RaidInfo[] {
  const raidInfos = loadRaidInfos(server, locale);
  // console.log('loadRaidInfos', raidInfos, id, 'locale', locale)
  return raidInfos.filter((raid) => raid.Id === id);
}
