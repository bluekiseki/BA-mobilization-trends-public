import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { NavigationType, useLocation, useNavigationType, useSearchParams } from 'react-router';
import { buildStoryAtlas, type AtlasBranch } from '../logic/storyAtlas';
import { buildStoryFlow, type FlowEdge, type FlowNode, type FlowStage } from '../logic/storyFlow';
import { splitSeriesTitle, storyQuery } from '../logic/navigation';
import { SERVER_LABELS, SERVERS } from '../logic/releaseDates';
import { seriesSlug } from '../logic/slugs';
import { categoryLabel, episodeRange, filterSeries } from '../logic/storyIndex';
import { storyMapCopy } from '../logic/storyMapCopy';
import { storyCopy } from '../logic/uiText';
import type { StoryIndex, StoryLang } from '../logic/types';
import { seriesPath, StoryLink, storyControlClass } from './StorySections';
import { StoryShell } from './StoryShell';
import { useStoryIndex, useStoryLang } from './useStoryIndex';
import { useStorySettings } from './useStorySettings';

const mapPositions = new Map<string, { y: number; expanded: string[] }>();
const ARC_COLORS: Record<string, [string, string]> = {
  vol1: ['#95721f', '#e2c36c'],
  vol2: ['#387f73', '#8acdbf'],
  vol3: ['#80609f', '#c2a3e0'],
  vol4: ['#496fa7', '#96b8ec'],
  vol5: ['#a15f75', '#e3a4ba'],
  vol6: ['#417d8d', '#91c9d6'],
  ex_deca: ['#637785', '#adbeca'],
};
function branchStyle(key: string): CSSProperties {
  const colors = ARC_COLORS[key.replace('part2_', '')] ?? ['#457b93', '#8ec9e0'];
  return { '--atlas-light': colors[0], '--atlas-dark': colors[1] } as CSSProperties;
}
interface InkPath {
  key: string;
  d: string;
}

// Measure text instead of fixing station heights; long translated titles remain readable.
function AtlasInk({ root, edges, confluence = false }: { root: RefObject<HTMLDivElement | null>; edges: FlowEdge[]; confluence?: boolean }) {
  const [paths, setPaths] = useState<InkPath[]>([]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const points = new Map<string, { x: number; y: number }>();
      for (const marker of element.querySelectorAll<HTMLElement>('[data-ink-point]')) {
        const rect = marker.getBoundingClientRect();
        points.set(marker.dataset.inkPoint ?? '', { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 });
      }
      const next: InkPath[] = [];
      for (const edge of edges) {
        const from = points.get(edge.from);
        const to = points.get(edge.to);
        if (!from || !to || to.y <= from.y) continue;
        const bend = confluence ? to.y - 24 : from.y + Math.min(24, (to.y - from.y) / 2);
        const d =
          Math.abs(from.x - to.x) < 2
            ? `M${from.x},${from.y} V${to.y}`
            : `M${from.x},${from.y} V${bend - 8} Q${from.x},${bend} ${from.x + Math.sign(to.x - from.x) * 8},${bend} H${to.x - Math.sign(to.x - from.x) * 8} Q${to.x},${bend} ${to.x},${bend + 8} V${to.y}`;
        next.push({ key: `${edge.from}>${edge.to}`, d });
      }
      setPaths((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const station of element.querySelectorAll('[data-flow-row]')) observer.observe(station);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root, edges, confluence]);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {paths.map((path) => (
        <path key={path.key} d={path.d} fill="none" strokeWidth={confluence ? 2 : 1.5} strokeLinecap="round" className="stroke-[var(--atlas-ink)]" />
      ))}
    </svg>
  );
}

interface AtlasContext {
  index: StoryIndex;
  lang: StoryLang;
  query: string;
  edges: FlowEdge[];
  byKey: Map<string, FlowNode>;
  ids: Map<string, string>;
  selected: string | null;
  suppressIncoming?: Set<string>;
  central?: boolean;
}

function Portal({ node, context, point }: { node: FlowNode; context: AtlasContext; point: string }) {
  const { ids, lang } = context;
  return (
    <a
      href={`#${ids.get(node.key)}`}
      className="relative block min-h-11 py-2 pl-4 text-[11px] break-keep leading-relaxed text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
      aria-label={`${storyMapCopy(lang).locate}: ${node.group.label}`}
    >
      <span data-ink-point={point} aria-hidden="true" className="absolute left-0 top-3.5 size-2 rotate-45 border border-[var(--atlas-ink)] bg-white dark:bg-neutral-900" />
      {node.group.label}
    </a>
  );
}

function Station({ node, context, localKeys }: { node: FlowNode; context: AtlasContext; localKeys: Set<string> }) {
  const { index, lang, query, ids, edges, byKey, selected } = context;
  const { title } = splitSeriesTitle(node.group.label, node.main);
  const incoming = edges.filter((edge) => edge.to === node.key && !localKeys.has(edge.from) && !context.suppressIncoming?.has(edge.to));
  const outgoing = edges.filter((edge) => edge.from === node.key && !localKeys.has(edge.to) && byKey.get(edge.to)?.core);
  return (
    <div
      id={ids.get(node.key)}
      data-flow-row=""
      data-flow-series={seriesSlug(node.group.id, index.series[node.group.id])}
      className={`relative scroll-mt-24 pb-8 ${context.central ? 'text-center' : 'pl-5 sm:pl-7'} ${selected === seriesSlug(node.group.id, index.series[node.group.id]) ? 'bg-ba-btn-blue/10' : ''}`}
    >
      {incoming.length > 0 && (
        <div className="relative mb-4 pb-3">
          {incoming.map((edge) => {
            const from = byKey.get(edge.from);
            return from ? <Portal key={edge.from} node={from} context={context} point={`portal:${edge.from}>${node.key}`} /> : null;
          })}
        </div>
      )}
      <div className="relative">
        <span
          data-ink-point={node.key}
          aria-hidden="true"
          className={`absolute top-3 z-1 rounded-full border-2 border-[var(--atlas-ink)] bg-white dark:bg-neutral-900 ${context.central ? 'left-1/2 -translate-x-1/2 size-3' : node.main ? '-left-5 size-3 sm:-left-7' : '-left-[18px] size-2 sm:-left-[26px]'}`}
        />
        <StoryLink
          to={seriesPath(index, node.group.id, storyQuery(query, { selected: null, focus: seriesSlug(node.group.id, index.series[node.group.id]) }))}
          className={`group min-h-11 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ba-btn-blue-dark ${context.central ? 'relative z-1 mt-9 inline-block bg-white px-3 dark:bg-neutral-900' : 'block'}`}
        >
          <span className={`mb-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-medium tracking-wide text-neutral-500 dark:text-neutral-400 ${context.central ? 'justify-center' : ''}`}>
            {!node.main && <span>{categoryLabel(node.group.category, lang)}</span>}
            {node.group.date && (
              <time dateTime={node.group.date.slice(0, 10)} className="tabular-nums">
                {node.group.date.slice(0, 10).replaceAll('-', '.')}
              </time>
            )}
          </span>
          <span
            className={`block break-keep [overflow-wrap:anywhere] group-hover:underline group-hover:decoration-ba-btn-blue-dark group-hover:underline-offset-4 ${node.main ? 'text-sm font-bold leading-relaxed sm:text-lg' : 'text-xs leading-relaxed sm:text-sm'}`}
          >
            {title}
          </span>
          {node.group.part && <span className="mt-2 block text-[10px] text-neutral-500 dark:text-neutral-400">{episodeRange(...node.group.part.episodes, lang)}</span>}
        </StoryLink>
      </div>
      {outgoing.length > 0 && (
        <div className={`relative z-1 mt-3 bg-white text-[10px] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400 ${context.central ? 'inline-block px-3 text-left' : ''}`}>
          {outgoing.map((edge) => {
            const target = byKey.get(edge.to);
            return target ? (
              <a key={edge.to} href={`#${ids.get(target.key)}`} className="flex min-h-9 items-center gap-2 py-1 break-keep leading-relaxed hover:underline">
                <span className="shrink-0 text-[var(--atlas-ink)]" aria-hidden="true">
                  ↘
                </span>
                {target.group.label}
              </a>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function Branch({ branch, context, heading = true }: { branch: AtlasBranch; context: AtlasContext; heading?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => new Set(branch.nodes.map((node) => node.key)), [branch.nodes]);
  const localEdges = useMemo(
    () =>
      context.edges.filter((edge) => keys.has(edge.to) && !context.suppressIncoming?.has(edge.to)).map((edge) => (keys.has(edge.from) ? edge : { ...edge, from: `portal:${edge.from}>${edge.to}` })),
    [context.edges, context.suppressIncoming, keys],
  );
  const main = branch.main;
  const label = main ? splitSeriesTitle(main.group.label, true).context || main.group.label : '';
  const number = /(?:^|_)vol(\d+)/.exec(branch.key)?.[1];
  const badge = number !== undefined ? number.padStart(2, '0') : branch.key.includes('ex_') ? 'EX' : '';
  return (
    <div style={branchStyle(branch.key)} className="min-w-0 [--atlas-ink:var(--atlas-light)] dark:[--atlas-ink:var(--atlas-dark)]">
      {heading && main && (
        <header className="mb-6 flex min-h-16 items-end gap-2 border-t border-neutral-300 pt-4 dark:border-neutral-600 sm:gap-4">
          {badge && <span className="text-4xl font-light leading-none tracking-tighter text-[var(--atlas-ink)] sm:text-5xl">{badge}</span>}
          <h3 className="pb-0.5 text-xs font-semibold leading-relaxed sm:text-sm">{label}</h3>
        </header>
      )}
      <div ref={root} className="relative isolate">
        {context.central && <span className="absolute left-1/2 top-0 h-[18px] border-l border-[var(--atlas-ink)]" aria-hidden="true" />}
        <AtlasInk root={root} edges={localEdges} />
        {branch.nodes.map((node) => (
          <Station key={node.key} node={node} context={context} localKeys={keys} />
        ))}
      </div>
    </div>
  );
}

function FinalGate({ branches, context }: { branches: AtlasBranch[]; context: AtlasContext }) {
  const m = storyMapCopy(context.lang);
  const root = useRef<HTMLDivElement>(null);
  const final = branches.find((branch) => branch.key === 'final');
  const first = final?.nodes[0];
  const predecessors = context.edges
    .filter((edge) => edge.to === first?.key)
    .map((edge) => context.byKey.get(edge.from))
    .filter((node): node is FlowNode => !!node)
    .sort((a, b) => (a.arc ?? '').localeCompare(b.arc ?? ''));
  const wires = useMemo(() => predecessors.map((node) => ({ from: node.key, to: 'final-gate', core: true, continuation: false })), [predecessors]);
  return (
    <>
      <div ref={root} className="relative pb-12">
        <AtlasInk root={root} edges={wires} confluence />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 lg:gap-x-12">
          {predecessors.map((node) => (
            <a
              key={node.key}
              href={`#${context.ids.get(node.key)}`}
              style={branchStyle(node.arc ?? '')}
              className="relative min-h-14 pl-5 text-xs break-keep leading-relaxed [--atlas-ink:var(--atlas-light)] sm:text-sm dark:[--atlas-ink:var(--atlas-dark)]"
            >
              <span data-ink-point={node.key} className="absolute left-0 top-1 size-2.5 rounded-full border-2 border-[var(--atlas-ink)] bg-white dark:bg-neutral-900" aria-hidden="true" />
              <span className="mb-1 block text-[10px] text-neutral-500 dark:text-neutral-400">{splitSeriesTitle(node.group.label, true).context}</span>
              {splitSeriesTitle(node.group.label, true).title}
            </a>
          ))}
        </div>
        <span
          data-ink-point="final-gate"
          className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 rounded-full border-[3px] border-[var(--atlas-ink)] bg-white dark:bg-neutral-900"
          aria-hidden="true"
        />
      </div>
      <header className="relative pt-8 text-center sm:pt-10">
        <span className="absolute left-1/2 top-0 h-6 border-l-2 border-[var(--atlas-ink)]" aria-hidden="true" />
        <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-neutral-500 dark:text-neutral-400">{m.final}</p>
        <h2 id="flow-heading-final" className="mx-auto w-4/5 break-keep text-3xl font-black leading-tight tracking-tight sm:text-5xl">
          {m.finalTitle}
        </h2>
        <span className="mx-auto mt-6 block h-8 w-px bg-[var(--atlas-ink)]" aria-hidden="true" />
      </header>
      {final && (
        <div className="relative px-4 sm:px-[20%] lg:px-[30%]">
          <Branch branch={final} context={{ ...context, central: true, suppressIncoming: new Set(first ? [first.key] : []) }} heading={false} />
        </div>
      )}
      {branches
        .filter((branch) => branch !== final)
        .map((branch) => (
          <Branch key={branch.key} branch={branch} context={context} />
        ))}
    </>
  );
}

export function StoryMapPage() {
  const { index, releases, error } = useStoryIndex();
  const { lang, setLang, query } = useStoryLang();
  const [params, setParams] = useSearchParams();
  const { settings } = useStorySettings();
  const location = useLocation();
  const navigation = useNavigationType();
  const t = storyCopy(lang);
  const m = storyMapCopy(lang);
  const server = SERVERS.find((value) => value === params.get('server')) ?? settings?.server ?? 'jp';
  const atlas = useMemo(
    () => buildStoryAtlas(index ? buildStoryFlow(index, filterSeries(index, { category: '', query: '', lang, character: null, sort: server, releases, splitParts: true })) : { nodes: [], edges: [] }),
    [index, lang, server, releases],
  );
  const ids = useMemo(() => new Map(atlas.nodes.map((node, at) => [node.key, `story-map-${at}`])), [atlas.nodes]);
  const { nodes } = atlas;
  useEffect(() => {
    if (!index) return;
    const saved = mapPositions.get(location.key);
    const selected = new URLSearchParams(location.search).get('selected');
    const node = nodes.find((candidate) => seriesSlug(candidate.group.id, index.series[candidate.group.id]) === selected);
    let ready = false;
    let leaving = false;
    let frame = 0;
    const remember = () => {
      if (!ready || leaving) return;
      mapPositions.set(location.key, {
        y: window.scrollY,
        expanded: [...document.querySelectorAll('[data-stage] details[open]')].map((element) => element.closest('[data-stage]')?.id ?? ''),
      });
    };
    const depart = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href = anchor?.getAttribute('href');
      if (!href || href.startsWith('#') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      remember();
      leaving = true;
    };
    // Save before navigation; route scroll restoration runs before passive unmount cleanup.
    document.addEventListener('click', depart, true);
    window.addEventListener('scroll', remember, { passive: true });
    if (navigation === NavigationType.Pop && saved) {
      for (const id of saved.expanded) {
        const details = document.getElementById(id)?.querySelector('details');
        if (details) details.open = true;
      }
    }
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(location.hash.slice(1) || (node ? (ids.get(node.key) ?? '') : ''));
        if (target) {
          for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
        if (navigation === NavigationType.Pop && saved) window.scrollTo(0, saved.y);
        else target?.scrollIntoView({ block: 'center' });
        ready = true;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', depart, true);
      window.removeEventListener('scroll', remember);
    };
  }, [nodes, index, ids, location.key, location.hash, location.search, navigation]);
  // Native hash links can point into a collapsed secondary branch.
  useEffect(() => {
    const reveal = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href^="#story-map-"]') : null;
      const id = anchor?.getAttribute('href')?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    };
    document.addEventListener('click', reveal);
    return () => document.removeEventListener('click', reveal);
  }, []);
  const labels: Record<FlowStage, string> = { 'before-final': m.before, final: m.final, 'after-final': m.after, part2: m.part2, undated: m.undated };
  const context: AtlasContext | null = index ? { index, lang, query, edges: atlas.edges, byKey: atlas.byKey, ids, selected: params.get('selected') } : null;
  return (
    <StoryShell lang={lang} onLang={setLang} langQuery={query} error={error} loading={!index}>
      {context && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="flex-1 text-[11px] leading-relaxed text-neutral-500 sm:text-xs dark:text-neutral-400">{m.hint}</p>
            <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              {t.server}
              <select
                value={server}
                onChange={(event) => setParams((previous) => new URLSearchParams(storyQuery(previous.toString(), { server: event.target.value })), { replace: true, preventScrollReset: true })}
                className={storyControlClass}
              >
                {SERVERS.map((value) => (
                  <option key={value} value={value}>
                    {SERVER_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <nav aria-label={t.parts} className="my-4 flex flex-wrap gap-x-4 border-y border-neutral-200 dark:border-neutral-700">
            {atlas.sections
              .filter(({ stage }) => stage !== 'undated')
              .map(({ stage }, at) => (
                <a key={stage} href={`#flow-${stage}`} className="flex min-h-12 items-center gap-3 py-3 text-xs font-medium hover:text-ba-btn-blue-dark">
                  <span className="font-mono text-[10px] text-neutral-400">{String(at + 1).padStart(2, '0')}</span>
                  {labels[stage]}
                </a>
              ))}
          </nav>
          <div className="relative [--atlas-ink:#457b93] dark:[--atlas-ink:#8ec9e0]">
            {atlas.sections.map(({ stage, branches, sideBranches }, at) => (
              <section
                key={stage}
                id={`flow-${stage}`}
                data-stage={stage}
                aria-labelledby={`flow-heading-${stage}`}
                className={`scroll-mt-24 ${stage === 'final' ? 'border-y border-ba-btn-blue-dark/40 py-10 sm:py-16' : 'py-5 sm:py-10'}`}
              >
                {stage === 'final' ? (
                  <FinalGate branches={branches} context={context} />
                ) : (
                  <>
                    <header className="mb-5 flex items-baseline gap-3 sm:mb-8 sm:gap-6">
                      <span className="text-4xl font-light tracking-tighter text-neutral-300 sm:text-6xl dark:text-neutral-600">{String(at + 1).padStart(2, '0')}</span>
                      <h2 id={`flow-heading-${stage}`} className="text-xl font-bold tracking-tight sm:text-3xl">
                        {labels[stage]}
                      </h2>
                    </header>
                    <div className="grid grid-cols-2 items-start gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-x-12">
                      {branches.map((branch) => (
                        <div
                          key={branch.key}
                          className={branch.key.includes('prologue') ? 'col-span-2 px-[20%] lg:col-span-4 lg:px-[35%]' : branch.key.includes('ex_') ? 'col-span-2 lg:col-span-2' : ''}
                        >
                          <Branch branch={branch} context={context} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {sideBranches.length > 0 && (
                  <details className="group mt-6 border-t border-neutral-200 dark:border-neutral-700">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-xs text-neutral-600 dark:text-neutral-400">
                      <span>
                        {m.connections}
                        <span className="ml-2 font-mono text-neutral-400">{sideBranches.reduce((sum, branch) => sum + branch.nodes.length, 0)}</span>
                      </span>
                      <span className="text-lg group-open:rotate-45" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    <div className="grid grid-cols-2 items-start gap-x-6 gap-y-6 pt-6 lg:grid-cols-4 lg:gap-x-12">
                      {sideBranches.map((branch) => (
                        <Branch key={branch.key} branch={branch} context={context} heading={false} />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </StoryShell>
  );
}
