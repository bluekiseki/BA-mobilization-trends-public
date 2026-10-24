import { arcOf } from './flowMetro';
import type { SeriesGroup } from './storyIndex';
import type { StoryIndex } from './types';

export type FlowStage = 'before-final' | 'final' | 'after-final' | 'part2' | 'undated';
export const FLOW_STAGES: FlowStage[] = ['before-final', 'final', 'after-final', 'part2', 'undated'];

export interface FlowNode {
  key: string;
  group: SeriesGroup;
  stage: FlowStage;
  main: boolean;
  core: boolean;
  arc: string | null;
}

export interface FlowEdge {
  from: string;
  to: string;
  core: boolean;
  continuation: boolean;
}

export interface StoryFlow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// Keep the source graph intact. Only redundant cross-arc shortcuts are removed from the visual graph.
function hasOtherPath(from: string, to: string, edges: FlowEdge[]): boolean {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.from !== current || (edge.from === from && edge.to === to)) continue;
      if (edge.to === to) return true;
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return false;
}

export function buildStoryFlow(index: StoryIndex, groups: SeriesGroup[]): StoryFlow {
  const shown = groups.filter((group) => ['Main', 'Event', 'Group', 'Mini'].includes(group.category));
  const core = new Set(shown.filter((group) => group.category === 'Main').map((group) => group.id));
  const queue = [...core];
  while (queue.length) {
    for (const parent of index.series[queue.shift() ?? '']?.a ?? []) {
      if (!core.has(parent)) {
        core.add(parent);
        queue.push(parent);
      }
    }
  }
  const finalDates = shown
    .filter((group) => index.series[group.id]?.r?.[1].startsWith('final_ch'))
    .flatMap((group) => group.date ?? [])
    .sort();
  const releaseNodes: FlowNode[] = shown.map((group) => {
    const key = index.series[group.id]?.r?.[1] ?? '';
    const main = group.category === 'Main';
    const duringFinal = group.date && finalDates[0] && group.date >= finalDates[0] && group.date <= (finalDates.at(-1) ?? '');
    return {
      key: group.key,
      group,
      main,
      core: core.has(group.id),
      arc: main ? arcOf(key) : null,
      stage: !group.date ? 'undated' : key.startsWith('final_ch') && main ? 'final' : duringFinal ? 'final' : (group.era ?? 'undated'),
    };
  });
  releaseNodes.sort((a, b) => FLOW_STAGES.indexOf(a.stage) - FLOW_STAGES.indexOf(b.stage));
  const nodes: FlowNode[] = [];
  // Adjacent releases without an intervening story read as one chapter, not repeated headlines.
  for (const node of releaseNodes) {
    const previous = nodes.at(-1);
    const left = previous?.group.part;
    const right = node.group.part;
    if (previous && previous.group.id === node.group.id && previous.stage === node.stage && left && right && left.episodes[1] + 1 === right.episodes[0]) {
      previous.group = { ...previous.group, stories: [...previous.group.stories, ...node.group.stories], part: { ...left, episodes: [left.episodes[0], right.episodes[1]] } };
    } else nodes.push({ ...node });
  }
  const bySeries = new Map<string, FlowNode[]>();
  for (const node of nodes) bySeries.set(node.group.id, [...(bySeries.get(node.group.id) ?? []), node]);
  const edges: FlowEdge[] = [];
  for (const [id, parts] of bySeries) {
    for (let at = 1; at < parts.length; at++) {
      edges.push({ from: parts[at - 1].key, to: parts[at].key, core: core.has(id), continuation: true });
    }
    for (const parent of index.series[id]?.a ?? []) {
      const sources = bySeries.get(parent);
      if (!sources?.length) continue;
      // A chapter can straddle Final. Connect to the applicable release, never its first release unconditionally.
      const target = parts.find((part) => part.group.date && sources[0].group.date && part.group.date >= sources[0].group.date) ?? parts[0];
      const source = sources.filter((part) => part.group.date && target.group.date && part.group.date <= target.group.date).at(-1) ?? sources.at(-1) ?? sources[0];
      edges.push({ from: source.key, to: target.key, core: core.has(id), continuation: source.arc !== null && source.arc === target.arc });
    }
  }
  return { nodes, edges: edges.filter((edge) => edge.continuation || !hasOtherPath(edge.from, edge.to, edges)) };
}
