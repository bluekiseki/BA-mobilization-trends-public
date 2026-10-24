import { describe, expect, it } from 'vitest';
import { buildStoryAtlas } from './storyAtlas';
import type { FlowNode, FlowStage, StoryFlow } from './storyFlow';

function station(key: string, arc: string | null, stage: FlowStage, date: string, id = key): FlowNode {
  return {
    key,
    arc,
    stage,
    main: arc !== null,
    core: true,
    group: { id, key, label: key, category: arc ? 'Main' : 'Event', date, dates: { jp: date }, era: stage === 'final' || stage === 'undated' ? null : stage, summary: '', stories: [], steps: [] },
  };
}
const edge = (from: string, to: string) => ({ from, to, core: true, continuation: true });

describe('story atlas projection', () => {
  it('keeps the immediate aftermath connected to Final on the visible route', () => {
    const restoration = { ...station('restoration', null, 'final', '2023-03-12'), core: false };
    const atlas = buildStoryAtlas({ nodes: [station('final4', 'final', 'final', '2023-03-08'), restoration], edges: [edge('final4', 'restoration')] });
    expect(atlas.sections[0].branches[0].nodes.map((node) => node.key)).toEqual(['final4', 'restoration']);
    expect(atlas.sections[0].sideBranches).toEqual([]);
    expect(restoration.core).toBe(false);
  });
  it('combines chapter updates without merging releases on opposite sides of Final', () => {
    const nodes = [
      station('deca#1', 'ex_deca', 'before-final', '2021-11-09', 'deca'),
      station('deca#4', 'ex_deca', 'before-final', '2022-06-08', 'deca'),
      station('final', 'final', 'final', '2023-03-08'),
      station('deca#14', 'ex_deca', 'after-final', '2023-12-06', 'deca'),
    ];
    nodes[0].group.part = { label: null, episodes: [1, 3], releases: {} };
    nodes[1].group.part = { label: null, episodes: [4, 13], releases: {} };
    nodes[3].group.part = { label: null, episodes: [14, 17], releases: {} };
    const atlas = buildStoryAtlas({ nodes, edges: [edge('deca#1', 'deca#4'), edge('deca#4', 'deca#14'), edge('final', 'deca#14')] });
    expect(atlas.nodes).toHaveLength(3);
    expect(atlas.byKey.get('deca#1')?.group.part?.episodes).toEqual([1, 13]);
    expect(atlas.edges).toEqual([edge('deca#1', 'deca#14'), edge('final', 'deca#14')]);
    expect(nodes[0].group.part.episodes).toEqual([1, 3]);
  });

  it('keeps the four volume branches adjacent, with the prologue on its actual first branch', () => {
    const nodes = [
      station('prologue', 'prologue', 'before-final', '2021-02-04'),
      station('1', 'vol1', 'before-final', '2021-02-04'),
      station('ex', 'ex_deca', 'before-final', '2021-11-09'),
      station('3', 'vol3', 'before-final', '2021-05-27'),
      station('2', 'vol2', 'before-final', '2021-03-25'),
      station('4', 'vol4', 'before-final', '2022-03-23'),
    ];
    const atlas = buildStoryAtlas({ nodes, edges: [edge('prologue', '1')] });
    expect(atlas.sections[0].branches.map((branch) => branch.key)).toEqual(['vol1', 'vol2', 'vol3', 'vol4', 'ex_deca']);
    expect(atlas.sections[0].branches[0].nodes.map((node) => node.key)).toEqual(['prologue', '1']);
    expect(atlas.edges).toEqual([edge('prologue', '1')]);
  });

  it('places an event on the volume it leads into while retaining the other incoming branch', () => {
    const flow: StoryFlow = {
      nodes: [
        station('vol1_ch2', 'vol1', 'before-final', '2021-03-18'),
        station('vol3_ch4', 'vol3', 'before-final', '2022-08-09'),
        station('trip', null, 'after-final', '2023-09-27'),
        station('vol1_ch3', 'vol1', 'after-final', '2024-02-07'),
      ],
      edges: [edge('vol1_ch2', 'vol1_ch3'), edge('vol3_ch4', 'trip'), edge('trip', 'vol1_ch3')],
    };
    const atlas = buildStoryAtlas(flow);
    expect(atlas.sections.find((section) => section.stage === 'after-final')?.branches[0].nodes.map((node) => node.key)).toEqual(['trip', 'vol1_ch3']);
    expect(atlas.edges).toEqual(flow.edges);
  });

  it('groups secondary stories by real relationships and does not fabricate an edge between unrelated stories', () => {
    const nodes = ['event', 'group', 'unrelated'].map((key, at) => ({ ...station(key, null, 'after-final', `2024-01-0${at + 1}`), core: false }));
    const atlas = buildStoryAtlas({ nodes, edges: [edge('event', 'group')] });
    expect(atlas.sections[0].sideBranches.map((branch) => branch.nodes.map((node) => node.key))).toEqual([['event', 'group'], ['unrelated']]);
    expect(atlas.edges).toEqual([edge('event', 'group')]);
  });
});
