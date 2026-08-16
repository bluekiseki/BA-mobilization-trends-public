import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3Force from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import * as d3Drag from 'd3-drag';
import 'd3-transition';
import { useNetworkData } from './useNetworkData';
import { NetworkControls } from './NetworkControls';
import { RankingPanel } from './RankingPanel';
import { NodeDetailPanel } from './NodeDetailPanel';
import type { SelectedNodeInfo } from './NodeDetailPanel';
import type { NetworkFilters, NetworkNode, SeasonItem } from './types';
import { DEFAULT_FILTERS } from './types';
import type { Locale } from '~/utils/i18n/config';

interface StudentNetworkGraphProps {
  studentId?: number;
  height?: number | string;
  embedded?: boolean;
  defaultFilters?: Partial<NetworkFilters>;
  seasons: SeasonItem[];
  initialSeasonId?: string;
  simplified?: boolean;
  studentMode?: boolean;
  onStudentChange?: () => void;
  onRaidChange?: (raidId?: string) => void;
}

interface SimNode extends NetworkNode {
  x: number;
  y: number;
  fx: number | null;
  fy: number | null;
  vx: number;
  vy: number;
}

interface SimLink extends d3Force.SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  weight: number;
}

const NODE_R_MIN = 10;
const NODE_R_MAX = 52;

function nodeRadius(appearances: number, maxAppearances: number): number {
  if (maxAppearances <= 0) return NODE_R_MIN;
  const t = Math.sqrt(appearances / maxAppearances);
  return NODE_R_MIN + t * (NODE_R_MAX - NODE_R_MIN);
}

function edgeStrokeWidth(weight: number, maxWeight: number): number {
  return Math.max(0.5, (weight / maxWeight) * 18);
}

function lerpEdgeColor(t: number): string {
  const r = Math.round(125 + (3 - 125) * t);
  const g = Math.round(211 + (105 - 211) * t);
  const b = Math.round(252 + (161 - 252) * t);
  return `rgb(${r},${g},${b})`;
}

function buildFocusWeightMap(focusId: number | null, links: SimLink[]): Map<string, number> {
  const map = new Map<string, number>();
  if (focusId === null) return map;
  const focusLinks = links.filter((l) => l.source.id === focusId || l.target.id === focusId);
  const maxW = Math.max(...focusLinks.map((l) => l.weight), 1);
  for (const l of focusLinks) {
    const a = l.source.id,
      b = l.target.id;
    map.set(a < b ? `${a}:${b}` : `${b}:${a}`, l.weight / maxW);
  }
  return map;
}

function edgeStroke(link: SimLink, focusId: number | null, focusWeights: Map<string, number>): string {
  if (focusId === null) return '#6b7280';
  const a = link.source.id,
    b = link.target.id;
  if (a !== focusId && b !== focusId) return '#6b7280';
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  return lerpEdgeColor(focusWeights.get(key) ?? 0);
}

function edgeOpacity(link: SimLink, focusId: number | null, neighbors: Set<number>): number {
  if (focusId === null) return 0.5;
  const s = link.source.id,
    t = link.target.id;
  if (s === focusId || t === focusId) return 1;
  if (neighbors.has(s) && neighbors.has(t)) return 0.2;
  return 0.03;
}

function nodeOpacity(id: number, focusId: number | null, neighbors: Set<number>): number {
  if (focusId === null) return 1;
  if (id === focusId) return 1;
  if (neighbors.has(id)) return 0.9;
  return 0.12;
}

type SidebarTab = 'filter' | 'search' | 'rankings' | 'detail';

export function StudentNetworkGraph({
  studentId,
  height = '100%',
  embedded = false,
  defaultFilters,
  seasons,
  initialSeasonId,
  simplified,
  studentMode,
  onStudentChange,
  onRaidChange,
}: StudentNetworkGraphProps) {
  const { t, i18n } = useTranslation('network');
  const { t: t_common } = useTranslation('common');
  const locale = i18n.language as Locale;

  const SIDEBAR_TABS: { id: SidebarTab; label: string }[] = [
    { id: 'filter', label: t('sidebarTabs.filter') },
    { id: 'search', label: t('sidebarTabs.search') },
    { id: 'rankings', label: t('sidebarTabs.rankings') },
    { id: 'detail', label: t('sidebarTabs.detail') },
  ];

  const [filters, setFilters] = useState<NetworkFilters>({
    ...DEFAULT_FILTERS,
    ...(studentId !== undefined ? { maxNodes: 300, topNPerNode: 10 } : {}),
    ...defaultFilters,
  });
  const [focusId, setFocusId] = useState<number | null>(studentId ?? null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(studentId !== undefined ? 'detail' : 'filter');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { graph, loading, error, progress } = useNetworkData(filters, seasons, locale, simplified, studentMode);

  const embeddedSeedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!embedded || seasons.length === 0 || !initialSeasonId) return;
    if (embeddedSeedRef.current === initialSeasonId) return;
    embeddedSeedRef.current = initialSeasonId;

    const m = initialSeasonId.match(/^(E\d+)-([A-Za-z]+)$/);
    const selected = m ? seasons.filter((s) => s.id.startsWith(`${m[1]}-`)) : seasons.filter((s) => s.id === initialSeasonId);
    setFilters((f) => ({ ...f, selectedSeasons: selected.map((s) => s.id), armorTypes: m ? [m[2]] : null }));
  }, [embedded, seasons, initialSeasonId]);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<d3Force.Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const cameraLockRef = useRef(false);
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const edgeMapRef = useRef<Map<number, { id: number; weight: number }[]>>(new Map());
  const nodeByIdRef = useRef<Map<number, SimNode>>(new Map());
  const focusIdRef = useRef<number | null>(focusId);
  const needsInitialZoomRef = useRef(studentId !== undefined);

  useEffect(() => {
    focusIdRef.current = focusId;
  }, [focusId]);

  const buildEdgeMap = useCallback((links: SimLink[]) => {
    const m = new Map<number, { id: number; weight: number }[]>();
    for (const l of links) {
      for (const [from, to] of [
        [l.source.id, l.target.id],
        [l.target.id, l.source.id],
      ]) {
        if (!m.has(from)) m.set(from, []);
        m.get(from)?.push({ id: to, weight: l.weight });
      }
    }
    m.forEach((arr) => arr.sort((a, b) => b.weight - a.weight));
    edgeMapRef.current = m;
  }, []);

  const getNeighbors = useCallback((id: number | null): Set<number> => {
    if (id === null) return new Set();
    const s = new Set<number>();
    for (const l of simLinksRef.current) {
      if (l.source.id === id) s.add(l.target.id);
      if (l.target.id === id) s.add(l.source.id);
    }
    return s;
  }, []);

  useEffect(() => {
    if (!graph || !svgRef.current || !gRef.current) return;

    const svgEl = svgRef.current;
    const W = svgEl.clientWidth || 900;
    const H = svgEl.clientHeight || 650;

    simRef.current?.stop();

    const prevPos = new Map<number, { x: number; y: number }>();
    simNodesRef.current.forEach((n) => prevPos.set(n.id, { x: n.x, y: n.y }));

    const nodeById = new Map<number, SimNode>();
    const simNodes: SimNode[] = graph.nodes.map((n) => {
      const p = prevPos.get(n.id);
      const angle = Math.random() * 2 * Math.PI;
      const radius = 250 + Math.random() * 350;
      const node: SimNode = {
        ...n,
        x: p?.x ?? W / 2 + Math.cos(angle) * radius,
        y: p?.y ?? H / 2 + Math.sin(angle) * radius,
        fx: null,
        fy: null,
        vx: 0,
        vy: 0,
      };
      nodeById.set(n.id, node);
      return node;
    });

    const focusNode = focusId != null ? nodeById.get(focusId) : null;
    const isFirst = focusNode != null && !prevPos.has(focusNode.id);
    if (isFirst && focusNode) {
      focusNode.x = W / 2;
      focusNode.y = H / 2;
    }
    cameraLockRef.current = isFirst;

    const maxAppearances = Math.max(...graph.nodes.map((n) => n.totalAppearances), 1);
    const r = (n: SimNode) => nodeRadius(n.totalAppearances, maxAppearances);
    const maxWeight = Math.max(...graph.edges.map((e) => e.weight), 1);

    const simLinks: SimLink[] = graph.edges
      .map((e) => {
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        if (!src || !tgt) return null;
        return { source: src, target: tgt, weight: e.weight };
      })
      .filter((l): l is SimLink => l !== null);

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;
    nodeByIdRef.current = nodeById;
    buildEdgeMap(simLinks);

    const neighbors = getNeighbors(focusId);
    const focusWeights = buildFocusWeightMap(focusId, simLinks);

    const svg = d3Selection.select(svgEl);
    const g = d3Selection.select(gRef.current);
    g.selectAll('*').remove();

    const defs = svg.select<SVGDefsElement>('defs');
    defs.selectAll('clipPath').remove();
    simNodes.forEach((n) => {
      defs.append('clipPath').attr('id', `nc-${n.id}`).append('circle').attr('r', r(n));
    });

    const edgeEl = g
      .append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (l) => edgeStroke(l, focusId, focusWeights))
      .attr('stroke-width', (l) => edgeStrokeWidth(l.weight, maxWeight))
      .attr('stroke-opacity', (l) => edgeOpacity(l, focusId, neighbors))
      .attr('stroke-linecap', 'round');

    const nodeEl = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, (n) => n.id)
      .join('g')
      .attr('class', 'node')
      .style('opacity', (n) => nodeOpacity(n.id, focusId, neighbors))
      .style('cursor', 'pointer')
      .call(
        d3Drag
          .drag<SVGGElement, SimNode>()
          .on('start', (ev: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!ev.active) simRef.current?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (ev: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on('end', (ev: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!ev.active) simRef.current?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    nodeEl
      .append('circle')
      .attr('r', (n) => r(n) + 2)
      .attr('fill', '#e5e7eb');

    nodeEl
      .append('image')
      .attr('href', (n) => n.portrait)
      .attr('x', (n) => -r(n))
      .attr('y', (n) => -r(n))
      .attr('width', (n) => r(n) * 2)
      .attr('height', (n) => r(n) * 2)
      .attr('clip-path', (n) => `url(#nc-${n.id})`);

    nodeEl
      .filter((n) => n.id === focusId)
      .append('circle')
      .attr('class', 'focus-ring')
      .attr('r', (n) => r(n) + 5)
      .attr('fill', 'none')
      .attr('stroke', '#77e0ff')
      .attr('stroke-width', 3);

    nodeEl
      .append('circle')
      .attr('r', (n) => r(n) + 2)
      .attr('fill', 'transparent')
      .on('click', (_ev, d) => {
        const isDeselect = focusIdRef.current === d.id;
        cameraLockRef.current = false;
        if (!isDeselect && studentId !== undefined && d.id !== studentId) {
          onStudentChange?.();
        }
        setFocusId(isDeselect ? null : d.id);
        setTooltip(null);
        if (!isDeselect) {
          setSidebarTab('detail');
          setSidebarOpen(true);
        }
      })
      .on('mouseenter', (ev: MouseEvent, d) => {
        const rect = svgEl.getBoundingClientRect();
        setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, node: d });
      })
      .on('mouseleave', () => setTooltip(null));

    const sim = d3Force
      .forceSimulation<SimNode, SimLink>(simNodes)
      .force(
        'link',
        d3Force
          .forceLink<SimNode, SimLink>(simLinks)
          .id((n) => n.id)
          .distance((l) => 200 - (l.weight / maxWeight) * 80)
          .strength((l) => (l.weight / maxWeight) * 0.4),
      )
      .force('charge', d3Force.forceManyBody<SimNode>().strength(-1800).distanceMax(1200))
      .force('center', d3Force.forceCenter(svgEl.clientWidth / 2 || W / 2, svgEl.clientHeight / 2 || H / 2).strength(0.02))
      .force(
        'collide',
        d3Force.forceCollide<SimNode>((n) => r(n) + 18),
      )
      .alphaDecay(0.02);

    simRef.current = sim;

    const zoom = d3Zoom
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (ev: d3Zoom.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', ev.transform.toString());
      });
    svg.call(zoom);
    zoomRef.current = zoom;

    sim.on('tick', () => {
      edgeEl
        .attr('x1', (l) => l.source.x)
        .attr('y1', (l) => l.source.y)
        .attr('x2', (l) => l.target.x)
        .attr('y2', (l) => l.target.y);
      nodeEl.attr('transform', (n) => `translate(${n.x},${n.y})`);

      const liveW = svgEl.clientWidth || 900;
      const liveH = svgEl.clientHeight || 650;

      if (needsInitialZoomRef.current && isFirst) {
        needsInitialZoomRef.current = false;
        const s = 0.65;
        zoom.transform(svg, d3Zoom.zoomIdentity.translate((liveW / 2) * (1 - s), (liveH / 2) * (1 - s)).scale(s));
      }

      if (cameraLockRef.current && focusNode && sim.alpha() > 0.01) {
        const k = d3Zoom.zoomTransform(svgEl).k;
        const tx = liveW / 2 - focusNode.x * k;
        const ty = liveH / 2 - focusNode.y * k;
        zoom.transform(svg, d3Zoom.zoomIdentity.translate(tx, ty).scale(k));
      }
    });

    return () => {
      sim.stop();
    };
  }, [graph, buildEdgeMap, getNeighbors]);

  useEffect(() => {
    if (focusId === null || !graph) {
      setSelectedNode(null);
      return;
    }

    const totalW = graph.nodeTotalWeights.get(focusId) ?? 1;
    const partners = (edgeMapRef.current.get(focusId) ?? []).map((p) => ({
      id: p.id,
      name: nodeByIdRef.current.get(p.id)?.name ?? `ID:${p.id}`,
      portrait: nodeByIdRef.current.get(p.id)?.portrait ?? '',
      weight: p.weight,
      pct: Math.round((p.weight / totalW) * 100),
    }));

    const simNode = simNodesRef.current.find((n) => n.id === focusId);
    if (simNode) {
      setSelectedNode({
        id: simNode.id,
        name: simNode.name,
        portrait: simNode.portrait,
        totalAppearances: simNode.totalAppearances,
        partners,
      });
    }
  }, [focusId, graph]);

  useEffect(() => {
    if (!gRef.current || !graph) return;
    const neighbors = getNeighbors(focusId);
    const maxAppearances = Math.max(...graph.nodes.map((n) => n.totalAppearances), 1);
    const focusWeights = buildFocusWeightMap(focusId, simLinksRef.current);

    const g = d3Selection.select(gRef.current);

    g.selectAll<SVGLineElement, SimLink>('line')
      .attr('stroke', (l) => edgeStroke(l, focusId, focusWeights))
      .attr('stroke-opacity', (l) => edgeOpacity(l, focusId, neighbors));

    g.selectAll<SVGGElement, SimNode>('.node').style('opacity', (n) => nodeOpacity(n.id, focusId, neighbors));

    g.selectAll<SVGGElement, SimNode>('.node').each(function (n) {
      const grp = d3Selection.select(this);
      grp.select('.focus-ring').remove();
      if (n.id === focusId) {
        const rn = nodeRadius(n.totalAppearances, maxAppearances);
        grp
          .append('circle')
          .attr('class', 'focus-ring')
          .attr('r', rn + 5)
          .attr('fill', 'none')
          .attr('stroke', '#77e0ff')
          .attr('stroke-width', 3);
      }
    });
  }, [focusId, graph, getNeighbors]);

  useEffect(() => {
    if (studentId === undefined || !graph || graph.nodes.length === 0) return;
    const inGraph = graph.nodes.some((n) => n.id === studentId);
    if (!inGraph && filters.minWeight > 1) {
      setFilters((f) => ({ ...f, minWeight: Math.max(1, Math.floor(f.minWeight / 2)) }));
    }
  }, [studentId, graph]);

  const focusName = graph?.nodes.find((n) => n.id === focusId)?.name;

  const searchResults = searchQuery.trim().length > 0 && graph ? graph.nodes.filter((n) => n.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10) : [];

  return (
    <div className="relative flex overflow-hidden bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100" style={{ height }}>
      {!embedded && (
        <>
          <div
            className={[
              'w-64 shrink-0 flex flex-col',
              'bg-white dark:bg-neutral-950',
              'border-r border-neutral-200 dark:border-neutral-800',
              'absolute inset-y-0 left-0 z-30',
              'md:relative md:z-auto md:inset-auto',
              sidebarOpen ? '' : 'hidden md:block',
            ].join(' ')}
          >
            <div className="flex border-b border-neutral-200 dark:border-neutral-800 shrink-0">
              {SIDEBAR_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className={[
                    'flex-1 py-2 text-sm transition-colors relative',
                    sidebarTab === tab.id
                      ? 'text-neutral-900 dark:text-neutral-100 font-semibold border-b-2 border-neutral-700 dark:border-neutral-300'
                      : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
                  ].join(' ')}
                >
                  {tab.label}
                  {tab.id === 'detail' && selectedNode && <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>
              ))}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden w-8 shrink-0 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-base"
                aria-label={t_common('close')}
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className={sidebarTab === 'filter' ? '' : 'hidden'}>
                <NetworkControls
                  filters={filters}
                  onChange={setFilters}
                  seasons={seasons}
                  initialSeasonId={initialSeasonId}
                  simplified={simplified}
                  studentMode={studentMode}
                  onRaidChange={onRaidChange}
                />
              </div>

              {sidebarTab === 'search' && (
                <div className="px-4 pt-3">
                  <input
                    type="text"
                    placeholder={t('search.placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full text-sm px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
                  />
                  <div className="mt-2">
                    {searchResults.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setFocusId(n.id);
                          setTooltip(null);
                          setSearchQuery('');
                          setSidebarTab('detail');
                        }}
                        className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors rounded"
                      >
                        {n.portrait ? (
                          <img src={n.portrait} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                        )}
                        <span className="text-sm truncate" title={n.name}>
                          {n.name}
                        </span>
                      </button>
                    ))}
                    {searchQuery.trim() && searchResults.length === 0 && <p className="text-sm text-neutral-400 py-2">{t('search.noResults')}</p>}
                  </div>
                </div>
              )}

              {sidebarTab === 'rankings' && (
                <RankingPanel
                  graph={graph ?? { nodes: [], edges: [], nodeTotalWeights: new Map() }}
                  focusId={focusId}
                  onFocus={(id) => {
                    setFocusId((prev) => (prev === id ? null : id));
                    setTooltip(null);
                    setSidebarTab('detail');
                  }}
                />
              )}

              {sidebarTab === 'detail' && (
                <NodeDetailPanel
                  node={selectedNode}
                  locale={locale}
                  onFocusPartner={(id) => {
                    setFocusId(id);
                    setTooltip(null);
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex-1 relative overflow-hidden bg-neutral-50 dark:bg-neutral-900">
        {!embedded && (
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute top-2 left-2 z-10 md:hidden w-8 h-8 flex items-center justify-center rounded bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-700 text-base font-bold leading-none"
            aria-label={t_common('navigation.serverSettings')}
          >
            {sidebarOpen ? '×' : '☰'}
          </button>
        )}

        {!embedded && graph && (
          <div className="absolute top-2 right-2 text-xs text-neutral-400 bg-white/80 dark:bg-neutral-900/80 px-2 py-1 rounded pointer-events-none text-right">
            {studentMode && <div>{t('canvas.recentSeasons')}</div>}
            <div>{t('canvas.nodesStat', { nodes: graph.nodes.length, edges: graph.edges.length })}</div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-neutral-900/80 z-10 gap-3">
            <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-neutral-500">{progress || t_common('loading_txt')}</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filters.selectedSeasons.length === 0 && !studentMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-neutral-400 text-sm">{t('canvas.selectSeasons')}</p>
          </div>
        )}

        {!loading && !error && filters.selectedSeasons.length > 0 && graph?.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-neutral-400 text-sm">{t('canvas.noMatches')}</p>
          </div>
        )}

        <svg ref={svgRef} className="w-full h-full">
          <defs />
          <g ref={gRef} />
        </svg>

        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-2.5 py-1.5 text-sm"
            style={{
              left: Math.min(tooltip.x + 12, (svgRef.current?.clientWidth ?? 800) - 130),
              top: tooltip.y - 8,
            }}
          >
            <p className="font-semibold">{tooltip.node.name}</p>
            <p className="text-neutral-400">{t('nodeDetail.appearances', { count: tooltip.node.totalAppearances.toLocaleString() })}</p>
          </div>
        )}

        {focusId !== null && focusName && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-sm">
            <span className="text-neutral-500">{t('canvas.focus')}</span>
            <span className="font-medium">{focusName}</span>
            <button
              onClick={() => {
                setFocusId(null);
                setTooltip(null);
              }}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 ml-0.5"
            >
              &times;
            </button>
          </div>
        )}

        {!loading && graph && graph.nodes.length > 0 && focusId === null && (
          <p className="absolute bottom-2 inset-x-4 text-center text-sm text-neutral-400 pointer-events-none">{t('canvas.instructionsHint')}</p>
        )}
      </div>
    </div>
  );
}
