import { describe, expect, it } from 'vitest';
import { translateDescription } from './descriptionTranslation';
import { TITLE_GLOSSARY, type TermLocale } from './titleGlossary';
import { buildTitleDictionary, glossaryConcepts } from './titleTranslation';

const render = (text: string, locale: TermLocale) => translateDescription(text, buildTitleDictionary(glossaryConcepts(), locale));

describe('description glossary', () => {
  it('gives each raid description term a label in every locale', () => {
    const keys = ['studentDetails', 'exSkill', 'attackPower', 'defensePower', 'healingPower', 'criticalHit', 'groggy', 'battleMechanic'] as const;
    for (const key of keys) {
      for (const locale of ['ko', 'en', 'ja', 'zh_Hant'] as const) {
        expect(TITLE_GLOSSARY[key].label[locale]).toBeTruthy();
      }
    }
  });

  it('translates stat lines and battle mechanics from actual Japanese descriptions', () => {
    expect(render('使用生徒詳細\n攻撃力8292 防御力120 治癒力14997\n会心要求はかなりきつめ\nグロッキーゲージがギリギリ', 'ko')).toBe(
      '사용 학생 상세\n공격력 8292 방어력 120 치유력 14997\n치명타 조건이 상당히 빡빡함\n그로기ゲージがギリギリ',
    );
    expect(render('EXスキル育成優先度\nギミック完全解説', 'en')).toBe('EX Skill育成優先度\nMechanic完全Guide');
  });

  it('translates terms from each locale while retaining URLs verbatim', () => {
    expect(render('공격력 8000\nhttps://example.com/攻撃力/EXスキル\nEX 스킬', 'zh_Hant')).toBe('攻擊力 8000\nhttps://example.com/攻撃力/EXスキル\nEX技能');
    expect(render('暴擊 / 防禦力 / EX技能', 'ja')).toBe('会心 / 防御力 / EXスキル');
    expect(render('グロッキー', 'zh_Hant')).toBe('虛弱');
  });

  it('leaves unrelated prose and partial Latin words alone', () => {
    expect(render('Thanks for watching!\nCritically important\nチャンネル登録', 'ko')).toBe('Thanks for watching!\nCritically important\nチャンネル登録');
  });

  it('uses recurring raid phrases before their shorter component terms', () => {
    expect(render('会心ガチャなので会心要求はかなりきつめ', 'ko')).toBe('치명타 운빨なので치명타 조건이 상당히 빡빡함');
    expect(render('会心出れば通ります。祈りましょう。', 'en')).toBe('It clears if it crits.祈りましょう。');
    expect(render('0:00 1凸目編成\n05:30 2凸目編成', 'ko')).toBe('0:00 1파티 편성\n05:30 2파티 편성');
    expect(render('0:44 フェーズ 2-早グロッキーなしTL', 'en')).toBe('0:44 フェーズ 2-TL without early Groggy');
  });

  it('translates description headings and notes as complete phrases', () => {
    expect(render('開始スキル ①マリー\nスキル・装備は全て最大です', 'ko')).toBe('시작 스킬 ①マリー\n스킬·장비 모두 최대입니다');
    expect(render('コメントに使ってたTL載せてます。', 'zh_Hant')).toBe('使用的 TL 已放在留言區。');
  });
});
