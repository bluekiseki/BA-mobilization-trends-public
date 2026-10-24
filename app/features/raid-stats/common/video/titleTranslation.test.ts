import { describe, expect, it } from 'vitest';
import type { Student } from '~/types/data';
import { bossConcepts, buildTitleDictionary, glossaryConcepts, segmentTitle, studentConcepts, type StudentsByLocale, type TitleSegment } from './titleTranslation';
import type { TermLocale } from './titleGlossary';

function student(Name: string, SearchTags: string[] = []): Student {
  return { Name, SearchTags, StarGrade: 3, Position: 'Back', SquadType: 'Main', TacticRole: 'DamageDealer', School: '', BulletType: 'Pierce', BirthDay: '', Id: 0, DefaultOrder: 0 };
}

const students: StudentsByLocale = {
  ja: {
    '1': student('カスミ（水着）', ['水着カスミ']),
    '2': student('ミネ（アイドル）'),
    '3': student('ネル'),
    '4': student('ノゾミ'),
    '5': student('リオ（水着）'),
    '6': student('シロコ＊テラー', ['テラー']),
    '7': student('ナギサ'),
    '8': student('リオ'),
  },
  ko: {
    '1': student('카스미(수영복)'),
    '2': student('미네(아이돌)'),
    '3': student('네루'),
    '4': student('노조미'),
    '5': student('리오(수영복)'),
    '6': student('시로코*테러'),
    '7': student('나기사'),
    '8': student('리오'),
  },
  en: { '1': student('Kasumi (Swimsuit)'), '2': student('Mine (Idol)'), '3': student('Neru'), '4': student('Nozomi'), '5': student('Rio (Swimsuit)') },
  zh_Hant: { '1': student('霞(泳裝)'), '2': student('美禰(偶像)'), '3': student('寧瑠'), '4': student('希望'), '5': student('莉央(泳裝)') },
};

const concepts = [...glossaryConcepts(), ...bossConcepts(), ...studentConcepts(students)];
const render = (title: string, locale: TermLocale) =>
  segmentTitle(title, buildTitleDictionary(concepts, locale))
    .map((s: TitleSegment) => (typeof s === 'string' ? s : `[${s.dst}]`))
    .join('');

describe('title translation', () => {
  it('translates Japanese titles into Korean', () => {
    expect(render('【ブルアカ】大決戦ゲブラ 屋外 INSANE 1凸 水着カスミ・アイドルミネ編成', 'ko')).toBe(
      '【[블루 아카이브]】[대결전] [게부라] [야외] INSANE 1 [파티] [카스미(수영복)]・[미네(아이돌)][편성]',
    );
  });

  it('translates from any locale into the current one', () => {
    expect(render('Blue Archive Drumbarka Urban Torment 2 Team', 'ko')).toBe('[블루 아카이브] [드럼통 게] [시가지] Torment 2 [파티]');
    expect(render('총력전 드럼바르카 시가지전', 'ja')).toBe('[総力戦] [ドラム缶ガニ] [市街地]');
    expect(render('鐵桶蟹 城鎮 總力戰', 'en')).toBe('[Drumbarka] [Street] [Total Assault]');
  });

  it('leaves forms of the current locale untouched', () => {
    expect(render('【ブルアカ】総力戦 貫通', 'ja')).toBe('【ブルアカ】総力戦 貫通');
    expect(render('貫通', 'zh_Hant')).toBe('貫通');
  });

  it('prefers the longest match', () => {
    expect(render('ドラム缶ガニ', 'ko')).toBe('[드럼통 게]');
    expect(render('模擬総力戦', 'ko')).toBe('[모의 총력전]');
  });

  it('rejects partial words in the same script', () => {
    expect(render('チャンネル登録', 'ko')).toBe('チャンネル登録');
    expect(render('Hardcore Neruko', 'ko')).toBe('Hardcore Neruko');
    expect(render('Neru clear', 'ko')).toBe('[네루] [클리어]');
  });

  it('splits Japanese words written without spaces', () => {
    expect(render('リオナギサ軸', 'ko')).toBe('[리오] [나기사]軸');
    expect(render('ドレスアルなし ネルなしで', 'ko')).toBe('ドレスアル[없음] [네루] [없음]で');
    expect(render('大決戦カイテンジャーチナトロボーダー予想', 'ko')).toBe('[대결전] [카이텐] [플래티넘 컷]予想');
    expect(render('シロコテラー', 'ko')).toBe('[시로코*테러]');
  });

  it('rejects words that only contain a form', () => {
    expect(render('爆発ハードルがやばい', 'ko')).toBe('[폭발]ハードルがやばい');
    expect(render('おはなし', 'ko')).toBe('おはなし');
  });

  it('maps katakana and abbreviated difficulties to the English name', () => {
    expect(render('トーメント TMT1凸 インセイン', 'ko')).toBe('[Torment] [Torment] 1 [파티] [Insane]');
    expect(render('Torment', 'ko')).toBe('Torment');
  });

  it('treats rental as the assist system', () => {
    expect(render('ネルレンタル', 'ko')).toBe('[네루] [조력자]');
    expect(render('Neru borrow', 'ko')).toBe('[네루] [조력자]');
  });

  it('translates EX cost', () => {
    expect(render('10.5コスト必須 低コスト編成', 'ko')).toBe('10.5 [코스트]必須 低[코스트] [편성]');
  });

  it('translates clear', () => {
    expect(render('INSANE1凸クリア 初クリア', 'ko')).toBe('INSANE1 [파티] [클리어] 初[클리어]');
  });

  it('translates common title phrases', () => {
    expect(render('TL有 安め簡単編成', 'ko')).toBe('[TL 있음] [저투자] [간단] [편성]');
  });

  it('skips Chinese-only Han forms in Japanese titles', () => {
    expect(render('希望のTL', 'ko')).toBe('希望のTL');
    expect(render('希望 總力戰', 'ko')).toBe('[노조미] [총력전]');
  });

  it('adds a space where a translated word touches another word', () => {
    expect(render('総力戦S93 市街地ドラム缶ガニ', 'en')).toBe('[Total Assault] S93 [Street] [Drumbarka]');
    expect(render('総力戦S93', 'ja')).toBe('総力戦S93');
  });

  it('translates verified community slang', () => {
    expect(render('クリアでチナトロ！', 'ko')).toBe('[클리어]で[플래티넘]！');
    expect(render('チナトロボーダー予想 4.5周年勢向け', 'ko')).toBe('[플래티넘 컷]予想 4.5 [주년 입문자]向け');
  });

  it('derives costume words from student names', () => {
    expect(render('自前水着', 'ko')).toBe('自前[수영복]');
  });
});
