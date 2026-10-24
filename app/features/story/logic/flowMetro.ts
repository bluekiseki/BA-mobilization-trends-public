import type { Era } from './eras';
import type { SeriesGroup } from './storyIndex';
import type { StoryIndex } from './types';

// Series shown on the map. Bond stories have no reading order and are left out.
const MAP_CATEGORIES = ['Main', 'Event', 'Group', 'Mini'];

export interface MetroOptions {
  mainHeight: number;
  sideHeight: number;
  headingHeight: number;
}

export interface MetroRow {
  id: string | null; // null for a heading row
  heading: Era | 'undated' | null;
  y: number;
  height: number;
}

export interface MetroDot {
  id: string;
  main: boolean;
  lane: number; // main chapters sit on the line of their arc, everything else in the last lane
  y: number; // centre of the row
}

export interface MetroLine {
  arc: string;
  lane: number;
  top: number;
  bottom: number;
}

export interface Metro {
  rows: MetroRow[];
  dots: MetroDot[];
  lines: MetroLine[]; // between each two neighbouring chapters of an arc
  joins: { from: string; to: string; kind: 'fork' | 'merge' }[]; // a line forking off another one that is still running, or merging into (or carrying on as) the one that follows
  lanes: number; // lanes used by arcs; side stories use the lane after them
  height: number;
}

// "vol3_ch2" -> "vol3", "ex_deca_ch1" -> "ex_deca", "part2_prologue" -> "part2_prologue"
export function arcOf(titleKey: string): string {
  return /^(.*)_ch\d+$/.exec(titleKey)?.[1] ?? titleKey;
}

// The map reads top to bottom in release order. Every arc of the main story (Vol.1, Vol.2, Final, Ex. ...) runs down its own line, so a
// story released in pieces over years stays one line across the parts of the story. An arc carries on the line of the arc it follows, forks off it
// while that one is still running, and merges where it follows several.
// Side stories are small stations in the last lane. `groups` are the series in the order they are shown (see filterSeries).
export function layoutMetro(index: StoryIndex, groups: SeriesGroup[], { mainHeight, sideHeight, headingHeight }: MetroOptions): Metro {
  const shown = groups.filter((group) => MAP_CATEGORIES.includes(group.category));
  const arcOfSeries = new Map<string, string>();
  for (const group of shown) {
    const key = index.series[group.id]?.r;
    if (group.category === 'Main' && key?.[0] === 'main') arcOfSeries.set(group.id, arcOf(key[1]));
  }

  // Rows, with a heading wherever the part of the story changes.
  const rows: MetroRow[] = [];
  const dots: MetroDot[] = [];
  let y = 0;
  let era: Era | 'undated' | undefined;
  for (const group of shown) {
    const part = group.era ?? 'undated';
    if (part !== era) {
      rows.push({ id: null, heading: part, y, height: headingHeight });
      y += headingHeight;
      era = part;
    }
    const main = arcOfSeries.has(group.id);
    const height = main ? mainHeight : sideHeight;
    rows.push({ id: group.id, heading: null, y, height });
    dots.push({ id: group.id, main, lane: -1, y: y + height / 2 });
    y += height;
  }

  const spans = new Map<string, { top: number; bottom: number }>();
  for (const dot of dots) {
    const arc = arcOfSeries.get(dot.id);
    if (!arc) continue;
    const span = spans.get(arc);
    if (span) span.bottom = dot.y;
    else spans.set(arc, { top: dot.y, bottom: dot.y });
  }

  // Links between chapters of different arcs. A link to a chapter that comes earlier on the map (a story released before the chapter it follows)
  // cannot be drawn and is left to the detail panel. If the parent line is still running the child forks off it, otherwise the parent line merges
  // into the child (or simply carries on when both end up in the same lane).
  const dotById = new Map(dots.map((dot) => [dot.id, dot]));
  const joins: Metro['joins'] = [];
  const parents = new Map<string, string[]>();
  for (const group of shown) {
    const arc = arcOfSeries.get(group.id);
    for (const before of index.series[group.id]?.a ?? []) {
      const other = arcOfSeries.get(before);
      const fromY = dotById.get(before)?.y ?? Infinity;
      if (!arc || !other || other === arc || fromY >= (dotById.get(group.id)?.y ?? 0)) continue;
      joins.push({ from: before, to: group.id, kind: (spans.get(other)?.bottom ?? 0) > fromY ? 'fork' : 'merge' });
      parents.set(arc, [...(parents.get(arc) ?? []), other]);
    }
  }
  const joinsOf = (arc: string) => joins.filter((join) => arcOfSeries.get(join.to) === arc);
  const joinsFrom = (arc: string) => joins.filter((join) => arcOfSeries.get(join.from) === arc);

  // Lanes. An arc carries on in the lane of the arc it follows when that one has ended; otherwise it takes the free lane closest to its parents.
  // A forking arc needs its lane free from the fork onward, and a lane stays taken until the last arc that merges out of it has started.
  const laneEnds: number[] = [];
  const laneLast: string[] = [];
  const laneOf = new Map<string, number>();
  for (const [arc, span] of [...spans].sort((a, b) => a[1].top - b[1].top)) {
    const need = Math.min(span.top, ...joinsOf(arc).flatMap((join) => (join.kind === 'fork' ? (dotById.get(join.from)?.y ?? []) : [])));
    const parentArcs = parents.get(arc) ?? [];
    const parentLanes = parentArcs.flatMap((parent) => laneOf.get(parent) ?? []);
    const carried = laneEnds.findIndex(
      (end, lane) => end <= span.top && parentArcs.includes(laneLast[lane]) && joinsOf(arc).some((join) => join.kind === 'merge' && arcOfSeries.get(join.from) === laneLast[lane]),
    );
    const free = laneEnds.flatMap((end, lane) => (end < need ? [lane] : []));
    const distance = (lane: number) => (parentLanes.length ? Math.min(...parentLanes.map((parent) => Math.abs(lane - parent))) : lane);
    const nearest = [...free].sort((a, b) => distance(a) - distance(b))[0];
    const lane = carried >= 0 ? carried : (nearest ?? laneEnds.length);
    laneEnds[lane] = Math.max(span.bottom, ...joinsFrom(arc).flatMap((join) => (join.kind === 'merge' ? (dotById.get(join.to)?.y ?? []) : [])));
    laneLast[lane] = arc;
    laneOf.set(arc, lane);
  }
  const lanes = laneEnds.length;
  for (const dot of dots) {
    const arc = arcOfSeries.get(dot.id);
    dot.lane = arc ? (laneOf.get(arc) ?? 0) : lanes;
  }

  // One piece of line between each two neighbouring chapters of an arc, so a long pause can be drawn differently from a story that is running.
  const lines: MetroLine[] = [];
  for (const [arc, lane] of laneOf) {
    const chapters = dots.filter((dot) => arcOfSeries.get(dot.id) === arc);
    chapters.slice(1).forEach((dot, at) => lines.push({ arc, lane, top: chapters[at].y, bottom: dot.y }));
  }
  return { rows, dots, lines, joins, lanes, height: y };
}
