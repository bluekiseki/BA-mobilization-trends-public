import { describe, expect, it } from 'vitest';
import { collapseSameDate, ownRelease, ownStep, seriesReleases, type ServerSchedule } from './releaseDates';
import { dateEra, eraAnchors, seriesEra, type Era } from './eras';
import { arcOf, layoutMetro } from './flowMetro';
import { fesAnniversary, fesBanners, fesEvents, mergeByDay } from './fes';
import { timelineExtras } from './timelineExtras';
import { PROLOGUE_ID, withPrologue } from './prologue';
import { withScheduleNames } from './scheduleNames';
import { relationGraph } from './relationGraph';
import { buildSeriesReleases, episodeLabel, episodeNumber, episodeSlot, episodeTotal, filterSeries, listCategories, neighbours, pickText, summaryParts, type SeriesGroup } from './storyIndex';
import type { StoryIndex } from './types';
import { anniversaryLabel } from './uiText';

const index: StoryIndex = {
  series: {
    'Main/1': { c: 'Main', name: { en: 'Vol.1' }, r: ['main', 'vol1_ch1'], stories: ['10', '20'] },
    'Event/5': { c: 'Event', name: null, r: ['event', '802'], stories: ['30'] },
    'Event/6': { c: 'Event', name: null, stories: ['40'] },
  },
  stories: {
    '10': { s: 'Main/1', o: 1, t: { en: 'Prologue' }, c: ['아루'] },
    '20': { s: 'Main/1', o: 2, t: { en: 'Abydos', ja: 'アビドス' }, c: ['시로코', '아루'] },
    '30': { s: 'Event/5', o: 1, t: { ko: '이벤트' }, c: ['시로코'] },
    '40': { s: 'Event/6', o: 1, t: { en: 'Undated' } },
  },
  bgm: {},
  cs: {},
  chars: { 아루: { en: 'Aru', ko: '아루' }, 시로코: { en: 'Shiroko', ko: '시로코' } },
};

const schedule = (main: string[], event: string[]): ServerSchedule => ({
  main: main.map((startTime, i) => ({ startTime, titleKey: 'vol1_ch1', part: i + 1, episodes: i === 0 ? '1' : '2~9' })),
  group: [],
  mini: [],
  event: event.map((openTime) => ({ id: 802, openTime, rerun: 'FALSE' })),
  pickup: [],
});
const schedules = {
  jp: schedule(['2021-02-04 11:00:00', '2021-03-11 11:00:00'], ['2021-04-29 12:30:00']),
  gl: schedule(['2021-11-09 11:00:00', '2021-11-09 11:00:00'], ['2021-12-01 12:30:00']),
};
const releases = buildSeriesReleases(index, schedules);
const options = { category: 'Main', query: '', lang: 'en' as const, character: null, sort: 'jp' as const, releases };

describe('story index', () => {
  it('includes relationship stories when browsing all stories or searching a character', () => {
    const withBond: StoryIndex = {
      ...index,
      series: { ...index.series, 'Favor/1': { c: 'Favor', name: { ko: '아루' }, stories: ['50'] } },
      stories: { ...index.stories, '50': { s: 'Favor/1', o: 1, t: { ko: '아루와의 만남' }, c: ['아루'] } },
    };
    expect(filterSeries(withBond, { ...options, category: '', query: 'aru' }).map((group) => group.id)).toContain('Favor/1');
    expect(filterSeries(withBond, { ...options, category: '', character: '아루' }).map((group) => group.id)).toContain('Favor/1');
    expect(filterSeries(withBond, options).map((group) => group.id)).not.toContain('Favor/1');
  });
  it('filters by category and by title in any language', () => {
    expect(filterSeries(index, options).map((g) => g.stories.length)).toEqual([2]);
    expect(filterSeries(index, { ...options, query: 'アビ' })[0].stories.map((s) => s.id)).toEqual(['20']);
    expect(filterSeries(index, { ...options, category: 'Event', query: 'zzz' })).toEqual([]);
  });

  it('matches character names and filters by character', () => {
    expect(filterSeries(index, { ...options, query: 'shiroko' })[0].stories.map((s) => s.id)).toEqual(['20']);
    expect(filterSeries(index, { ...options, character: '아루' })[0].stories.map((s) => s.id)).toEqual(['10', '20']);
    expect(listCategories(index, '시로코')).toEqual([
      { category: 'Main', stories: 1 },
      { category: 'Event', stories: 1 },
    ]);
  });

  it('sorts by release and puts undated series last', () => {
    const events = (sort: 'jp' | 'gl') => filterSeries(index, { ...options, category: 'Event', sort }).map((g) => [g.id, g.date]);
    expect(events('jp')).toEqual([
      ['Event/5', '2021-04-29 12:30'],
      ['Event/6', null],
    ]);
  });

  it('reverses the release order and keeps undated series last', () => {
    const events = filterSeries(index, { ...options, category: 'Event', descending: true }).map((g) => g.id);
    expect(events).toEqual(['Event/5', 'Event/6']);
    expect(filterSeries(index, { ...options, category: '', descending: true }).map((g) => g.id)).toEqual(['Event/5', 'Main/1', 'Event/6']);
  });

  it('finds the neighbours inside a series', () => {
    expect(neighbours(index, '10')).toEqual({ prev: null, next: '20' });
    expect(neighbours(index, '30')).toEqual({ prev: null, next: null });
  });

  it('falls back to another language when the chosen one is missing', () => {
    expect(pickText({ en: 'a', ko: '가' }, 'ja')).toBe('a');
    expect(pickText(null, 'en')).toBe('');
  });
});

describe('release dates', () => {
  it('gives each story of a chapter released in parts its own date', () => {
    const jp = seriesReleases(['main', 'vol1_ch1'], schedules.jp);
    expect(jp.map((r) => r.date)).toEqual(['2021-02-04 11:00', '2021-03-11 11:00']);
    expect(ownRelease(jp, 0)?.date).toBe('2021-02-04 11:00');
    expect(ownRelease(jp, 5)?.date).toBe('2021-03-11 11:00');
  });

  it('keeps parts opened at the same time apart for stories and merges them in the list', () => {
    const gl = seriesReleases(['main', 'vol1_ch1'], schedules.gl);
    expect(gl).toHaveLength(2);
    expect(ownRelease(gl, 3)?.label).toBe('Part 2');
    expect(collapseSameDate(gl)).toMatchObject([{ date: '2021-11-09 11:00', label: 'Part 1, Part 2', estimated: false }]);
  });

  it('numbers the steps stories belong to', () => {
    const jp = seriesReleases(['main', 'vol1_ch1'], schedules.jp);
    expect([0, 1, 8].map((position) => ownStep(jp, position))).toEqual([0, 1, 1]);
  });

  it('has no own date without episode ranges', () => {
    const noRanges: ServerSchedule = { ...schedules.jp, main: schedules.jp.main.map(({ episodes: _episodes, ...row }) => row) };
    expect(ownRelease(seriesReleases(['main', 'vol1_ch1'], noRanges), 1)).toBeNull();
  });

  it('picks the step of a club story by its episode', () => {
    const club: ServerSchedule = {
      ...schedules.jp,
      group: [
        { startTime: '2021-02-04 11:00:00', id: 19, episode: '1' },
        { startTime: '2021-07-29 11:00:00', id: 19, episode: '2' },
      ],
    };
    const steps = seriesReleases(['group', '19'], club);
    expect(ownRelease(steps, 0)?.date).toBe('2021-02-04 11:00');
    expect(ownRelease(steps, 1)?.date).toBe('2021-07-29 11:00');
  });

  it('skips reruns and estimates bond story dates from the first pickup', () => {
    expect(seriesReleases(['event', '802'], { ...schedules.jp, event: [{ id: 802, openTime: '2022-01-01 00:00:00', rerun: 'TRUE' }] })).toEqual([]);
    const withPickup = { ...schedules.jp, pickup: [{ studentId: 10010, startTime: '2021-11-09 00:00' }] };
    expect(seriesReleases(['favor', '10010'], withPickup)).toEqual([{ date: '2021-11-09 00:00', label: null, estimated: false }]);
    expect(seriesReleases(['favor', '99999'], withPickup)[0]).toMatchObject({ date: '2021-02-04 11:00', estimated: true });
  });
});

describe('relation graph', () => {
  const linked: StoryIndex = {
    ...index,
    series: {
      A: { c: 'Main', name: null, stories: [] },
      B: { c: 'Main', name: null, a: ['A'], stories: [] },
      C: { c: 'Event', name: null, a: ['B'], stories: [] },
      D: { c: 'Event', name: null, a: ['B'], stories: [] },
      E: { c: 'Event', name: null, a: ['C'], stories: [] },
    },
  };

  it('puts earlier series on the left and later ones on the right', () => {
    const graph = relationGraph(linked, 'B');
    expect(Object.fromEntries(graph.nodes.map((n) => [n.id, n.depth]))).toEqual({ B: 0, A: -1, C: 1, D: 1, E: 2 });
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'B', to: 'D' },
        { from: 'C', to: 'E' },
      ]),
    );
    expect(graph.rows).toBe(2);
  });

  it('has a single node when nothing is linked', () => {
    expect(relationGraph(index, 'Event/6').nodes).toHaveLength(1);
  });
});

describe('eras', () => {
  const eraIndex: StoryIndex = {
    ...index,
    series: {
      F: { c: 'Main', name: null, r: ['main', 'final_ch4'], stories: [] },
      P: { c: 'Main', name: null, r: ['main', 'part2_prologue'], stories: [] },
      X: { c: 'Event', name: null, stories: [] },
    },
  };
  const at = (date: string) => ({ jp: [{ date, label: null, estimated: false }] });
  const eraReleases = { F: at('2023-03-08 11:00'), P: at('2026-04-21 11:00'), X: at('2024-01-01 11:00') };

  it('sorts series into before Final, after Final and Part 2 by their first JP release', () => {
    const anchors = eraAnchors(eraIndex, eraReleases);
    expect(['F', 'X', 'P'].map((id) => seriesEra(eraReleases, id, anchors))).toEqual(['before-final', 'after-final', 'part2']);
  });

  it('counts every part of the last Final chapter as before the end of Final', () => {
    const step = (date: string) => ({ date, label: null, estimated: false });
    const parts = { ...eraReleases, F: { jp: [step('2023-03-08 11:00'), step('2023-03-11 11:00'), step('2023-04-22 11:00')] }, Y: at('2023-03-20 11:00'), Z: at('2023-04-23 11:00') };
    const anchors = eraAnchors(eraIndex, parts);
    expect(anchors.finalDate).toBe('2023-04-22 11:00');
    expect(dateEra('2023-04-22 11:00', anchors)).toBe('before-final');
    expect(['Y', 'Z'].map((id) => seriesEra(parts, id, anchors))).toEqual(['before-final', 'after-final']);
  });

  it('has no era without a release date', () => {
    expect(seriesEra({}, 'X', eraAnchors(eraIndex, eraReleases))).toBeNull();
  });
});

describe('story flow map', () => {
  const group = (id: string, category: string, era: Era | null, date: string): SeriesGroup => ({ id, key: id, label: id, era, category, summary: '', date, dates: {}, steps: [], stories: [] });
  const main = (title: string, a: string[] = []): StoryIndex['series'][string] => ({ c: 'Main', name: null, r: ['main', title], a, stories: [] });
  const flowIndex: StoryIndex = {
    ...index,
    series: {
      A1: main('vol1_ch1'),
      B1: main('vol2_ch1'),
      A2: main('vol1_ch2', ['A1']),
      B2: main('vol2_ch2', ['B1']),
      C1: main('vol3_ch1', ['B2']),
      A3: main('vol1_ch3', ['A2']),
      E1: { c: 'Event', name: null, a: ['A3'], stories: [] },
      F1: { c: 'Favor', name: null, a: ['A1'], stories: [] },
    },
  };
  const groups = [
    group('A1', 'Main', 'before-final', '2021-01-01'),
    group('B1', 'Main', 'before-final', '2021-02-01'),
    group('A2', 'Main', 'before-final', '2021-03-01'),
    group('B2', 'Main', 'before-final', '2021-04-01'),
    group('C1', 'Main', 'before-final', '2021-05-01'),
    group('A3', 'Main', 'after-final', '2024-02-01'),
    group('E1', 'Event', 'after-final', '2024-03-01'),
    group('F1', 'Favor', 'after-final', '2024-04-01'),
  ];
  const options = { mainHeight: 60, sideHeight: 40, headingHeight: 50 };
  const map = layoutMetro(flowIndex, groups, options);
  const dot = (id: string) => map.dots.find((item) => item.id === id);

  it('names the arc of a chapter', () => {
    expect([arcOf('vol3_ch2'), arcOf('ex_deca_ch1'), arcOf('part2_prologue')]).toEqual(['vol3', 'ex_deca', 'part2_prologue']);
  });

  it('keeps every chapter of an arc on one lane, across the parts of the story', () => {
    expect(dot('A1')?.lane).toBe(dot('A3')?.lane);
    expect(dot('B1')?.lane).toBe(dot('B2')?.lane);
    expect(dot('A1')?.lane).not.toBe(dot('B1')?.lane);
    const pieces = map.lines.filter((item) => item.arc === 'vol1');
    expect(pieces).toHaveLength(2);
    expect(pieces[0].top).toBe(dot('A1')?.y);
    expect(pieces[pieces.length - 1].bottom).toBe(dot('A3')?.y);
  });

  it('reuses a lane once its arc has ended and puts side stories after the arc lanes', () => {
    // vol2 ends before vol3 starts, so vol3 takes its lane while vol1 is still running.
    expect(dot('C1')?.lane).toBe(dot('B1')?.lane);
    expect(map.lanes).toBe(2);
    expect(dot('E1')?.lane).toBe(2);
  });

  it('adds a heading where the part of the story changes and leaves bond stories out', () => {
    expect(map.rows.filter((row) => row.heading).map((row) => row.heading)).toEqual(['before-final', 'after-final']);
    expect(dot('F1')).toBeUndefined();
  });

  it('lists links between chapters of different arcs only', () => {
    expect(map.joins).toEqual([{ from: 'B2', to: 'C1', kind: 'merge' }]);
  });

  it('carries an arc on in the lane of the arc it follows, forks while that one still runs, and ignores links that point back up', () => {
    const forked: StoryIndex = {
      ...flowIndex,
      series: {
        ...flowIndex.series,
        D1: main('vol4_ch1', ['A2', 'C1']),
        G1: main('vol9_ch1', ['A3']),
        H1: main('vol8_ch1', ['G1']),
      },
    };
    const more = [
      ...groups.slice(0, 5),
      group('D1', 'Main', 'before-final', '2021-06-01'),
      groups[5],
      group('H1', 'Main', 'after-final', '2024-02-03'),
      group('G1', 'Main', 'after-final', '2024-02-04'),
      ...groups.slice(6),
    ];
    const result = layoutMetro(forked, more, options);
    const lane = (id: string) => result.dots.find((item) => item.id === id)?.lane;
    // vol4 follows vol1 (still running: its last chapter comes later) and vol3 (ended): it carries on vol3's lane and merges vol1 in.
    expect(lane('D1')).toBe(lane('C1'));
    expect(result.joins).toEqual(
      expect.arrayContaining([
        { from: 'A2', to: 'D1', kind: 'fork' },
        { from: 'C1', to: 'D1', kind: 'merge' },
      ]),
    );
    // vol8 follows vol9, which comes later on the map: the link points back up, so no join.
    expect(result.joins.some((join) => join.to === 'H1')).toBe(false);
  });
});

describe('fes recruitment on the timeline', () => {
  const pickup = (name: string, startTime: string, extra: { rerun?: boolean; fest?: boolean; prediction?: boolean } = {}) => ({
    studentId: name.length,
    name,
    startTime,
    rerun: extra.rerun ?? false,
    fest: extra.fest ?? true,
    prediction: extra.prediction ?? false,
  });
  const schedule: ServerSchedule = {
    main: [],
    group: [],
    mini: [],
    event: [],
    pickup: [
      pickup('Aru', '2023-08-02 11:00', { fest: false }),
      pickup('Wakamo', '2023-08-02 11:00', { rerun: true }),
      pickup('Hanako (Swimsuit)', '2023-08-02 11:00'),
      pickup('Hina (Dress)', '2024-01-31 11:00:00'),
      pickup('Rio', '2026-11-17 11:00', { prediction: true }),
    ],
  };

  it('groups the Fes students that open together, leaves reruns and other banners out', () => {
    const banners = fesBanners(schedule);
    expect(banners.map((banner) => banner.date)).toEqual(['2023-08-02 11:00', '2024-01-31 11:00', '2026-11-17 11:00']);
    expect(banners[0].students.map((student) => student.name)).toEqual(['Hanako (Swimsuit)']);
    expect(banners.map((banner) => banner.estimated)).toEqual([false, false, true]);
  });

  it('counts the Fes in the order they came out: 0.5, 1, 1.5 ... years', () => {
    expect([0, 1, 2, 9].map(fesAnniversary)).toEqual([0.5, 1, 1.5, 5]);
    expect(anniversaryLabel(0.5, 'ko')).toBe('0.5주년');
    expect(anniversaryLabel(1, 'ko')).toBe('1주년');
    expect([1, 2, 3, 4, 11].map((years) => anniversaryLabel(years, 'en'))).toEqual(['1st anniversary', '2nd anniversary', '3rd anniversary', '4th anniversary', '11th anniversary']);
    expect(anniversaryLabel(1.5, 'en')).toBe('1.5 anniversary');
  });

  it('pairs a Fes recruitment with the same one on the other server by its students, with the anniversary of the JP order', () => {
    const jp: ServerSchedule = {
      ...schedule,
      pickup: [
        { ...pickup('Wakamo', '2022-01-26 12:30'), studentId: 10033 },
        { ...pickup('Hoshino', '2022-07-20 11:00'), studentId: 10045 },
      ],
    };
    const gl: ServerSchedule = {
      ...schedule,
      pickup: [
        { ...pickup('Hoshino', '2023-01-31 11:00'), studentId: 10045 },
        { ...pickup('Mika', '2023-07-25 11:00'), studentId: 10059 },
      ],
    };
    const events = fesEvents({ jp, gl }, 'gl');
    expect(events.map((event) => Object.keys(event.releases).sort())).toEqual([['gl', 'jp'], ['gl']]);
    expect(events[0].releases.jp?.[0].date).toBe('2022-07-20 11:00');
    expect(events.map((event) => event.anniversary)).toEqual([1, null]);
    expect(fesEvents({ jp, gl }, 'jp').map((event) => event.anniversary)).toEqual([0.5, 1]);
  });

  it('skips a Fes recruitment that only has reruns', () => {
    const onlyReruns: ServerSchedule = { ...schedule, pickup: [pickup('Wakamo', '2023-08-02 11:00', { rerun: true })] };
    expect(fesBanners(onlyReruns)).toEqual([]);
  });

  it('merges them into a date-ordered list: stories first on the same day, undated stories last', () => {
    const stories = [
      { date: '2023-08-02 11:00', value: 'story-a' },
      { date: '2024-02-01 11:00', value: 'story-b' },
      { date: null, value: 'story-undated' },
    ];
    const banners = [
      { date: '2023-08-02 11:00', value: 'fes-1' },
      { date: '2024-01-31 11:00', value: 'fes-2' },
    ];
    expect(mergeByDay(stories, banners, false).map((item) => item.value)).toEqual(['story-a', 'fes-1', 'fes-2', 'story-b', 'story-undated']);
    const latestFirst = mergeByDay(stories.slice(0, 2).reverse(), [...banners].reverse(), true).map((item) => item.value);
    expect(latestFirst).toEqual(['story-b', 'fes-2', 'story-a', 'fes-1']);
  });
});

describe('names from the schedule data', () => {
  const named: StoryIndex = {
    ...index,
    series: {
      'Group/37': { c: 'Group', name: { en: 'Tea Party', ko: '티파티' }, r: ['group', '37'], stories: [] },
      'Event/57': { c: 'Event', name: { en: 'Engine' }, r: ['event', '862'], stories: [] },
    },
  };
  const schedule: ServerSchedule = {
    main: [],
    mini: [],
    event: [],
    pickup: [],
    group: [{ startTime: '2026-10-07 11:00:00', id: '37', titleEn: 'Occult Research Club', titleKo: '오컬트 연구회', titleJa: 'オカルト研究会' }],
  };
  const result = withScheduleNames(named, schedule, { '862': { Kr: '엔진', Jp: 'エンジン', En: null, Tw: null } });

  it('takes the name of a club from the group story schedule instead of the index', () => {
    expect(result.series['Group/37'].name).toEqual({ en: 'Occult Research Club', ko: '오컬트 연구회', ja: 'オカルト研究会' });
  });

  it('adds the languages of an event that the index is missing without replacing the ones it has', () => {
    expect(result.series['Event/57'].name).toEqual({ en: 'Engine', ko: '엔진', ja: 'エンジン' });
  });
});

describe('promotional videos on the timeline', () => {
  const videos = [
    { id: 'teaser', title: { en: 'Teaser PV' }, videos: { jp: { date: '2020-07-17', url: 'https://example.com/a' } } },
    { id: '7th', title: { en: '7th PV' }, videos: { jp: { date: '2026-04-19', url: 'https://example.com/b' }, gl: { date: '2026-08-15', url: 'https://example.com/c' } } },
  ];
  const empty: ServerSchedule = { main: [], group: [], mini: [], event: [], pickup: [] };

  it('lists the videos of a server by the day they went up there, and leaves out a video the server does not have', () => {
    const schedules = { jp: empty, gl: empty };
    expect(timelineExtras(schedules, 'jp', videos).map((extra) => (extra.kind === 'pv' ? `${extra.pv.id}@${extra.date}` : ''))).toEqual(['teaser@2020-07-17', '7th@2026-04-19']);
    expect(timelineExtras(schedules, 'gl', videos).map((extra) => (extra.kind === 'pv' ? `${extra.pv.id}@${extra.date}` : ''))).toEqual(['7th@2026-08-15']);
  });

  it('sorts videos and Fes recruitments together', () => {
    const withFes: ServerSchedule = { ...empty, pickup: [{ studentId: 10033, name: 'Wakamo', startTime: '2022-01-26 12:30', fest: true, rerun: false }] };
    const kinds = timelineExtras({ jp: withFes, gl: empty }, 'jp', videos).map((extra) => extra.kind);
    expect(kinds).toEqual(['pv', 'fes', 'pv']);
  });
});

describe('the game prologue', () => {
  const base: StoryIndex = {
    ...index,
    series: { V1: { c: 'Main', name: null, r: ['main', 'vol1_ch1'], stories: ['10'] } },
    stories: { '10': { s: 'V1', o: 1, t: { ko: '시작' } } },
  };

  it('is added as a main story of two episodes that leads into Vol.1 Ch.1', () => {
    const result = withPrologue(base);
    expect(result.series[PROLOGUE_ID]).toMatchObject({ c: 'Main', r: ['main', 'prologue'], stories: ['prologue-1', 'prologue-2'] });
    expect(result.series.V1.a).toEqual([PROLOGUE_ID]);
    expect(result.stories['prologue-2']).toMatchObject({ s: PROLOGUE_ID, o: 2, l: { en: 'Episode 2', ko: '제2화', ja: '第2話', 'zh-Hant': '第2話' } });
    expect(Object.keys(result.series)[0]).toBe(PROLOGUE_ID);
  });

  it('leaves an index alone that already has it', () => {
    const once = withPrologue(base);
    expect(withPrologue(once)).toBe(once);
  });

  it('takes its dates from the schedule and sorts first on both servers', () => {
    const schedule = (date: string): ServerSchedule => ({
      main: [
        { startTime: `${date} 11:00:00`, titleKey: 'prologue', episodes: '1-2' },
        { startTime: `${date} 11:00:00`, titleKey: 'vol1_ch1' },
      ],
      group: [],
      mini: [],
      event: [],
      pickup: [],
    });
    const releases = buildSeriesReleases(withPrologue(base), { jp: schedule('2021-02-04'), gl: schedule('2021-11-09') });
    expect(releases[PROLOGUE_ID].jp?.[0].date).toBe('2021-02-04 11:00');
    expect(releases[PROLOGUE_ID].gl?.[0].date).toBe('2021-11-09 11:00');
    const groups = filterSeries(withPrologue(base), { category: 'Main', query: '', lang: 'ko', character: null, sort: 'jp', releases });
    expect(groups.map((group) => group.id)).toEqual([PROLOGUE_ID, 'V1']);
  });
});

describe('episode summaries', () => {
  const base = { s: 'S', o: 1, t: { ko: '화' } };

  it('keeps the summaries of the parts of an episode apart instead of joining them', () => {
    const story = {
      ...base,
      m: { ko: '첫째\n둘째' },
      p: [
        { t: { ko: '가' }, m: { ko: '첫째' } },
        { t: { ko: '나' }, m: { ko: '둘째' } },
      ],
    };
    expect(summaryParts(story, 'ko')).toEqual(['첫째', '둘째']);
  });

  it('uses the one summary of an episode that is not in parts, and nothing when there is none', () => {
    expect(summaryParts({ ...base, m: { ko: '하나' } }, 'ko')).toEqual(['하나']);
    expect(summaryParts(base, 'ko')).toEqual([]);
  });
});

describe('episode labels', () => {
  const label = { en: 'Afterword', ko: '후일담', ja: '後日談その1', 'zh-Hant': '後日談其一' };

  it('shows the label in the chosen language', () => {
    expect(episodeLabel(label, 'en')).toBe('Afterword');
    expect(episodeLabel(label, 'ja')).toBe('後日談その1');
  });

  it('shows no label for a language the data has none for', () => {
    expect(episodeLabel({ ko: '노말 엔딩', ja: 'エンディング（ノーマル）' }, 'zh-Hant')).toBe('');
    expect(episodeLabel(undefined, 'ko')).toBe('');
  });
});

describe('club stories released on different days', () => {
  const clubIndex: StoryIndex = {
    ...index,
    series: { 'Group/26': { c: 'Group', name: { ko: '매화원' }, r: ['group', '26'], stories: ['2601', '2602'] } },
    stories: { '2601': { s: 'Group/26', o: 1, t: { ko: '하나' } }, '2602': { s: 'Group/26', o: 2, t: { ko: '둘' } } },
  };
  const schedule = (rows: [string, string][]): ServerSchedule => ({ main: [], group: rows.map(([startTime, episode]) => ({ startTime, id: 26, episode })), mini: [], event: [], pickup: [] });
  const releases = buildSeriesReleases(clubIndex, {
    jp: schedule([
      ['2021-02-04 11:00:00', '1'],
      ['2021-08-26 11:00:00', '2'],
    ]),
    gl: schedule([
      ['2021-11-09 11:00:00', '1'],
      ['2022-04-19 11:00:00', '2'],
    ]),
  });
  const options = { category: 'Group', query: '', lang: 'ko' as const, character: null, sort: 'jp' as const, releases };

  it('is listed once for each day its episodes opened when the parts are split', () => {
    const rows = filterSeries(clubIndex, { ...options, splitParts: true });
    expect(rows.map((row) => [row.date?.slice(0, 10), row.part?.episodes, row.stories.length])).toEqual([
      ['2021-02-04', [1, 1], 1],
      ['2021-08-26', [2, 2], 1],
    ]);
    expect(rows[1].part?.releases.gl?.[0].date).toBe('2022-04-19 11:00');
  });

  it('is listed once when the parts are not split, or while searching', () => {
    expect(filterSeries(clubIndex, options)).toHaveLength(1);
    expect(filterSeries(clubIndex, { ...options, splitParts: true, query: '매화' })).toHaveLength(1);
  });
});

describe('episode numbers', () => {
  // A prologue and afterwords sit in the list but have no number, so the list position runs ahead of the game's number
  const withPrologue: StoryIndex = {
    series: { 'Event/1': { c: 'Event', name: { en: 'Event' }, r: [], stories: ['1', '2', '3', '4'] } },
    stories: {
      '1': { s: 'Event/1', o: 1, t: { en: 'Prologue' }, l: undefined },
      '2': { s: 'Event/1', o: 2, t: { en: 'A' }, l: { ko: '제1화', ja: '第1話', en: 'Episode 1' } },
      '3': { s: 'Event/1', o: 3, t: { en: 'B' }, l: { ko: '제2화', ja: '第2話', en: 'Episode 2' } },
      '4': { s: 'Event/1', o: 4, t: { en: 'C' }, l: { ko: '후일담', ja: '後日談その1', en: 'Afterword' } },
    },
    chars: {},
    cs: {},
    vs: {},
    bgm: {},
  } as unknown as StoryIndex;
  const series = withPrologue.series['Event/1'];

  it('reads the number in the label', () => {
    expect(episodeNumber(withPrologue.stories['3'], 'ko')).toBe(2);
    expect(episodeNumber(withPrologue.stories['3'], 'ja')).toBe(2);
    expect(episodeNumber(withPrologue.stories['3'], 'en')).toBe(2);
  });

  it('gives a prologue and an afterword no number, even when the label has a digit', () => {
    expect(episodeNumber(withPrologue.stories['1'], 'ko')).toBeNull();
    expect(episodeNumber(withPrologue.stories['4'], 'ko')).toBeNull();
    expect(episodeNumber(withPrologue.stories['4'], 'ja')).toBeNull();
  });

  it('shows the number of the label instead of the place in the list', () => {
    expect(episodeSlot(withPrologue, series, '3', 'ko')).toBe(2);
    expect(episodeSlot(withPrologue, series, '1', 'ko')).toBeNull();
    expect(episodeTotal(withPrologue, series, 'ko')).toBe(2);
  });

  it('falls back to the place in the list for a series without numbered stories', () => {
    const plain = { ...withPrologue, stories: { '1': { s: 'Event/1', o: 1, t: { en: 'X' } }, '2': { s: 'Event/1', o: 2, t: { en: 'Y' } } } } as unknown as StoryIndex;
    const plainSeries = { ...series, stories: ['1', '2'] };
    expect(episodeSlot(plain, plainSeries, '2', 'ko')).toBe(2);
    expect(episodeTotal(plain, plainSeries, 'ko')).toBe(2);
  });
});
