import type { StoryLang } from './types';

const en = {
  hint: 'Read each branch from top to bottom. Dates indicate release dates.',
  before: 'Act 1 · Before Final',
  final: 'Act 1 · Final',
  finalTitle: 'Where All Miracles Begin',
  after: 'Act 1 · After Final',
  part2: 'Act 2',
  undated: 'Release date unknown',
  from: 'Continuing from',
  locate: 'Find this story on the map',
  continues: 'Continues in',
  connections: 'Connected stories',
};
type MapCopy = { [K in keyof typeof en]: string };
const copy: Record<StoryLang, MapCopy> = {
  en,
  ko: {
    hint: '각 가지를 위에서 아래로 따라가세요. 날짜는 공개 시점입니다.',
    before: '1부 · 최종장 이전',
    final: '1부 최종편',
    finalTitle: '그리고 모든 기적이 시작되는 곳',
    after: '1부 · 최종장 이후',
    part2: '2부',
    undated: '공개일 미확인',
    from: '이어지는 이야기',
    locate: '지도에서 이 이야기로 이동',
    continues: '이후 이야기',
    connections: '연결된 이야기',
  },
  ja: {
    hint: '各ルートを上から下へ。日付は公開日です。',
    before: '第1部 · 最終編まで',
    final: '第1部 最終編',
    finalTitle: 'あまねく奇跡の始発点',
    after: '第1部 · 最終編の後',
    part2: '第2部',
    undated: '公開日不明',
    from: 'ここにつながる物語',
    locate: 'マップ上の物語へ移動',
    continues: '続く物語',
    connections: 'つながる物語',
  },
  'zh-Hant': {
    hint: '沿各分支由上而下閱讀。日期為公開日期。',
    before: '第1部 · 最終篇之前',
    final: '第1部 最終篇',
    finalTitle: '一切奇蹟的起點',
    after: '第1部 · 最終篇之後',
    part2: '第2部',
    undated: '公開日不明',
    from: '承接的故事',
    locate: '前往地圖上的故事',
    continues: '後續故事',
    connections: '相連的故事',
  },
};
export const storyMapCopy = (lang: StoryLang): MapCopy => copy[lang];
