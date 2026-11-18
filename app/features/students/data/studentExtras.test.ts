import { describe, expect, it } from 'vitest';
import { publicStudentSchema } from './publicStudent';
import { buildStudentExtras } from './studentExtras';

const student = publicStudentSchema.parse({
  Id: 10000,
  Name: 'Aru',
  School: 'Gehenna',
  Club: 'Handyman68',
  SquadType: 'Main',
  TacticRole: 'DamageDealer',
  BulletType: 'Explosion',
  ArmorType: 'LightArmor',
  StarGrade: 3,
  StreetBattleAdaptation: 4,
  OutdoorBattleAdaptation: 1,
  IndoorBattleAdaptation: 3,
  Skills: {},
  FavorItemTags: ['a'],
});

describe('student extras', () => {
  it('falls back to the track named in the student data only when the jukebox lists it', () => {
    const music = [{ id: '38', title: 'Music', xref: [] }];
    const read = (lobbyBgm: number) => buildStudentExtras({ ...student, MemoryLobbyBGM: lobbyBgm }, 'en', { stories: null, music, icons: null }).bgm;
    expect(read(38)).toEqual([{ id: '38', title: 'Music' }]);
    // An id the jukebox does not know (the field also holds other kinds of ids) is not shown
    expect(read(10022)).toEqual([]);
  });
  it('resolves memorial music despite unrelated localized story titles and strips extra gift metadata', () => {
    const music = [
      {
        id: '38',
        title: 'Music',
        xref: [
          { type: 'Main_Story', title: { en: 'Story' } },
          { type: 'Memorial', title: '10000' },
        ],
      },
    ];
    const icons = { Item: { 500: { ItemCategory: 6, Rarity: 2, TagsStr: ['a'], LocalizeEtc: { Key: 123, NameEn: 'Gift', NameTw: null } } } };
    const stories = { 10000: [{ favor_rank: 6, memorial: true }] };
    const result = buildStudentExtras(student, 'en', { stories, music, icons });
    expect(result.bgm).toEqual([{ id: '38', title: 'Music' }]);
    expect(result.memorialRank).toBe(6);
    expect(result.gifts).toEqual([{ id: '500', name: 'Gift', points: 40, preferenceLevel: 2, rarity: 2 }]);
  });
  it('keeps every section empty when a source could not be read', () => {
    expect(buildStudentExtras(student, 'ko', { stories: null, music: null, icons: null })).toEqual({ memorialRank: null, bgm: [], gifts: [], favorStories: [] });
  });
  it('reads story titles in the reader language and falls back to English', () => {
    const stories = { 10000: [{ favor_rank: 2, memorial: false, title: { en: 'Hello' }, summary: { ko: '요약', en: 'Summary' } }] };
    expect(buildStudentExtras(student, 'ko', { stories, music: null, icons: null }).favorStories).toEqual([{ rank: 2, memorial: false, title: 'Hello', summary: '요약' }]);
  });
});
