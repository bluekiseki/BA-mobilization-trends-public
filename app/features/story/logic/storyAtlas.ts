import { FLOW_STAGES, type FlowEdge, type FlowNode, type FlowStage, type StoryFlow } from './storyFlow';

export interface AtlasBranch {
  key: string;
  nodes: FlowNode[];
  main: FlowNode | undefined;
}

export interface AtlasSection {
  stage: FlowStage;
  branches: AtlasBranch[];
  sideBranches: AtlasBranch[];
}

// A chapter occupies one station per era. Its releases remain available on the detail page.
// A chapter that crosses Final keeps a station on each side of that boundary.
export function buildStoryAtlas(flow: StoryFlow) {
  const aliases = new Map<string, string>();
  const combined = new Map<string, FlowNode>();
  for (const node of flow.nodes) {
    const identity = `${node.stage}:${node.group.id}`;
    const previous = combined.get(identity);
    aliases.set(node.key, previous?.key ?? node.key);
    if (!previous) {
      combined.set(identity, { ...node, group: { ...node.group } });
    } else {
      const parts = [previous.group.part, node.group.part];
      previous.group = {
        ...previous.group,
        stories: [...previous.group.stories, ...node.group.stories],
        part: parts[0] && parts[1] ? { ...parts[0], episodes: [Math.min(parts[0].episodes[0], parts[1].episodes[0]), Math.max(parts[0].episodes[1], parts[1].episodes[1])] } : previous.group.part,
      };
    }
  }
  const nodes = [...combined.values()];
  for (const node of nodes) {
    if (!nodes.some((other) => other.group.id === node.group.id && other.stage !== node.stage)) {
      node.group = { ...node.group, part: undefined };
    }
  }
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const deduplicated = new Map<string, FlowEdge>();
  for (const edge of flow.edges) {
    const from = aliases.get(edge.from);
    const to = aliases.get(edge.to);
    if (from && to && from !== to) deduplicated.set(`${from}>${to}`, { ...edge, from, to });
  }
  const edges = [...deduplicated.values()];
  // Show the immediate aftermath on Final's own route rather than hiding it among secondary stories.
  const aftermath = new Set(edges.filter((edge) => byKey.get(edge.from)?.arc === 'final' && byKey.get(edge.to)?.stage === 'final' && !byKey.get(edge.to)?.main).map((edge) => edge.to));
  for (const key of aftermath) {
    const node = byKey.get(key);
    if (node) node.core = true;
  }
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const destination = (node: FlowNode): FlowNode | undefined => {
    const queue = [node.key];
    const seen = new Set<string>();
    while (queue.length) {
      const key = queue.shift() ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      const candidate = byKey.get(key);
      if (candidate?.main) return candidate;
      queue.push(...(next.get(key) ?? []));
    }
    return undefined;
  };
  const chronological = (left: FlowNode, right: FlowNode) =>
    (left.group.date ?? '9999').localeCompare(right.group.date ?? '9999') || Number(right.arc?.endsWith('prologue') ?? false) - Number(left.arc?.endsWith('prologue') ?? false);
  const sections: AtlasSection[] = FLOW_STAGES.map((stage) => {
    const current = nodes.filter((node) => node.stage === stage).sort(chronological);
    const branches = new Map<string, AtlasBranch>();
    for (const node of current.filter((candidate) => candidate.core)) {
      const main = destination(node);
      const key = aftermath.has(node.key) ? 'final' : main?.arc === 'prologue' ? 'vol1' : (main?.arc ?? node.key);
      const branch = branches.get(key) ?? { key, nodes: [], main };
      branch.nodes.push(node);
      if (node.main) branch.main = node;
      branches.set(key, branch);
    }
    // Secondary stories are connected components, not category buckets or a second chronology list.
    const remaining = new Map(current.filter((node) => !node.core).map((node) => [node.key, node]));
    const sideBranches: AtlasBranch[] = [];
    while (remaining.size) {
      const first = remaining.values().next().value as FlowNode;
      const component: FlowNode[] = [];
      const queue = [first.key];
      while (queue.length) {
        const key = queue.shift() ?? '';
        const node = remaining.get(key);
        if (!node) continue;
        remaining.delete(key);
        component.push(node);
        for (const edge of edges) {
          if (edge.from === key) queue.push(edge.to);
          if (edge.to === key) queue.push(edge.from);
        }
      }
      sideBranches.push({ key: first.key, nodes: component.sort(chronological), main: undefined });
    }
    const order = (branch: AtlasBranch) => (branch.key.includes('prologue') ? -1 : Number(/(?:^|_)vol(\d+)/.exec(branch.key)?.[1] ?? 99));
    return { stage, branches: [...branches.values()].sort((a, b) => order(a) - order(b)), sideBranches };
  }).filter((section) => section.branches.length || section.sideBranches.length);
  return { nodes, edges, sections, byKey };
}
