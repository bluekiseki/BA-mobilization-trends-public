import { describe, expect, it } from 'vitest';
import { buildStoryFlow } from './storyFlow';
import type { SeriesGroup } from './storyIndex';
import type { StoryIndex } from './types';

function fixture() {
  const index: StoryIndex = { series: {}, stories: {}, chars: {}, cs: {}, bgm: {} };
  const groups: SeriesGroup[] = [];
  const add = (id: string, date: string, parents: string[] = [], category = 'Main', suffix = '') => {
    index.series[id] = { c: category, name: { en: id }, r: [category === 'Main' ? 'main' : 'event', id], a: parents, stories: [] };
    groups.push({
      id,
      key: id + suffix,
      label: id,
      category,
      date,
      dates: { jp: date },
      era: date < '2023-04-23' ? 'before-final' : date < '2026-04-21' ? 'after-final' : 'part2',
      summary: '',
      steps: [],
      stories: [],
    });
  };
  return { index, groups, add };
}

describe('story infographic', () => {
  it('preserves both Final convergence and the continuation of each volume', () => {
    const { index, groups, add } = fixture();
    add('vol1_ch2', '2021-03-18');
    add('vol4_ch1', '2022-03-23');
    add('vol3_ch4', '2022-08-09');
    add('vol2_ch2', '2022-12-07');
    const parents = ['vol1_ch2', 'vol2_ch2', 'vol3_ch4', 'vol4_ch1'];
    add('final_ch1', '2023-01-22', parents);
    add('final_ch4', '2023-04-22', ['final_ch1']);
    add('vol4_ch2', '2023-06-07', ['vol4_ch1']);
    add('830', '2023-09-27', ['vol3_ch4'], 'Event');
    add('vol1_ch3', '2024-02-07', ['vol1_ch2', '830']);
    const flow = buildStoryFlow(index, groups);
    const placed = flow.edges;
    expect(
      flow.edges
        .filter((edge) => edge.to === 'final_ch1')
        .map((edge) => edge.from)
        .sort(),
    ).toEqual(parents.sort());
    for (const [from, to] of [
      ['vol1_ch2', 'vol1_ch3'],
      ['vol4_ch1', 'vol4_ch2'],
      ['vol3_ch4', '830'],
      ['830', 'vol1_ch3'],
    ]) {
      expect(placed).toContainEqual(expect.objectContaining({ from, to }));
    }
    expect(flow.nodes.find((node) => node.key === '830')?.core).toBe(true);
  });

  it('attaches a prerequisite to the later release of a chapter spanning Final', () => {
    const { index, groups, add } = fixture();
    add('ex_deca_ch0', '2021-11-09', ['final_ch4'], 'Main', '#1');
    add('final_ch4', '2023-03-08');
    add('ex_deca_ch0', '2023-12-06', ['final_ch4'], 'Main', '#14');
    const flow = buildStoryFlow(index, groups);
    expect(flow.edges).toContainEqual(expect.objectContaining({ from: 'final_ch4', to: 'ex_deca_ch0#14' }));
    expect(flow.edges).toContainEqual(expect.objectContaining({ from: 'ex_deca_ch0#1', to: 'ex_deca_ch0#14', continuation: true }));
    expect(flow.nodes.map((node) => node.key)).toHaveLength(new Set(flow.nodes.map((node) => node.key)).size);
    expect(flow.nodes[0].stage).toBe('before-final');
    expect(flow.nodes[2].stage).toBe('after-final');
  });

  it('keeps main ancestors across event and mini categories while removing redundant shortcuts', () => {
    const { index, groups, add } = fixture();
    add('842', '2024-12-24', [], 'Event');
    add('843', '2025-01-20', ['842'], 'Event');
    add('ex_deca_ch2', '2026-01-18', ['842', '843']);
    add('12', '2026-05-20', [], 'Mini');
    add('part2_vol1_ch1', '2026-08-12', ['12']);
    const flow = buildStoryFlow(index, groups);
    expect(flow.nodes.every((node) => node.core)).toBe(true);
    expect(flow.edges).not.toContainEqual(expect.objectContaining({ from: '842', to: 'ex_deca_ch2' }));
    expect(flow.edges).toContainEqual(expect.objectContaining({ from: '843', to: 'ex_deca_ch2' }));
    expect(flow.edges).toContainEqual(expect.objectContaining({ from: '12', to: 'part2_vol1_ch1' }));
  });

  it('does not create relationships from chronology', () => {
    const { index, groups, add } = fixture();
    add('vol1_ch1', '2021-02-04', ['vol2_ch1']);
    add('vol3_ch1', '2021-03-04');
    add('vol2_ch1', '2021-04-04');
    const flow = buildStoryFlow(index, groups);
    expect(flow.edges).toHaveLength(1);
  });

  it('combines adjacent chapter releases but retains releases separated by another story', () => {
    const { index, groups, add } = fixture();
    add('vol1_ch2', '2021-03-11', [], 'Main', '#1');
    add('vol1_ch2', '2021-03-18', [], 'Main', '#11');
    add('event', '2021-03-20', [], 'Event');
    add('vol1_ch2', '2021-03-25', [], 'Main', '#21');
    for (const [at, from] of [
      [0, 1],
      [1, 11],
      [3, 21],
    ])
      groups[at].part = { episodes: [from, from + 9], releases: {}, label: null };
    const flow = buildStoryFlow(index, groups);
    expect(flow.nodes.map((node) => node.key)).toEqual(['vol1_ch2#1', 'event', 'vol1_ch2#21']);
    expect(flow.nodes[0].group.part?.episodes).toEqual([1, 20]);
    expect(groups[0].part?.episodes).toEqual([1, 10]);
    expect(flow.edges).toContainEqual(expect.objectContaining({ from: 'vol1_ch2#1', to: 'vol1_ch2#21' }));
  });

  it('keeps undated stories outside the dated Final section and ignores absent parents', () => {
    const { index, groups, add } = fixture();
    add('vol1_ch1', '2021-02-04', ['missing']);
    add('final_ch1', '2023-01-22', ['vol1_ch1']);
    groups[1].date = null;
    groups[1].era = null;
    const flow = buildStoryFlow(index, groups);
    expect(flow.nodes[1].stage).toBe('undated');
    expect(flow.edges).toHaveLength(1);
  });
});
