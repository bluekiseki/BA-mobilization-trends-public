import { useState, useEffect, useRef } from 'react';
import { cdn } from '~/utils/cdn';
import type { NetworkFilters, NetworkGraph, NetworkNode, NetworkIndex, SeasonData, SeasonItem } from './types';
import type { Locale } from '~/utils/i18n/config';

interface StudentMeta {
  Id: number;
  Name: string;
}

export interface UseNetworkDataResult {
  graph: NetworkGraph | null;
  loading: boolean;
  error: string | null;
  progress: string;
}

const indexCache: { data: NetworkIndex | null } = { data: null };
const seasonCache: Record<string, SeasonData> = {};
const studentCache: {
  meta: Record<number, StudentMeta> | null;
  portraits: Record<number, string> | null;
} = { meta: null, portraits: null };

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

export function buildSeasonItems(index: NetworkIndex): SeasonItem[] {
  const items: SeasonItem[] = [];

  for (const m of index.raid) {
    if (m.tag) continue;
    if (!m.date) continue;
    items.push({
      id: `R${m.season}`,
      label: `${m.boss ?? '?'} · ${m.location ?? '?'}`,
      bossKey: m.boss ?? '',
      date: m.date,
      tag: 'raid',
      files: [m.file],
      aggFile: m.aggFile ?? null,
      cnt: m.cnt,
      diffCutoffs: m.diffCutoffs ?? {},
    });
  }

  const eraidGroups = new Map<string, SeasonItem>();
  for (const m of index.eraid) {
    if (m.bossKey.includes('-aronaai')) continue;
    const groupId = `E${m.season}-${m.boss}_${m.location}`;
    let entry = eraidGroups.get(groupId);
    if (!entry) {
      entry = {
        id: groupId,
        label: `${m.boss} · ${m.location}`,
        bossKey: m.bossKey,
        date: m.date ?? '2099-01-01',
        tag: 'eraid',
        files: [],
        aggFile: null,
        cnt: m.cnt,
        diffCutoffs: m.diffCutoffs ?? {},
      };
      eraidGroups.set(groupId, entry);
    }
    entry.files.push(m.file);
  }
  items.push(...eraidGroups.values());

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

function getEffectiveRange(rankCutoff: number | null, difficulty: string | null, diffCutoffs: Record<string, number>): [number, number] {
  const DIFFICULTY_ORDER = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore'];

  let lo = 0;
  let hi = Infinity;

  if (rankCutoff !== null) hi = Math.min(hi, rankCutoff);

  if (difficulty !== null) {
    const availableDiffs = DIFFICULTY_ORDER.filter((d) => diffCutoffs[d] !== undefined);
    const idx = availableDiffs.indexOf(difficulty);
    if (idx === -1) return [Infinity, Infinity];
    lo = idx === 0 ? 0 : diffCutoffs[availableDiffs[idx - 1]];
    hi = diffCutoffs[availableDiffs[idx]];
  }

  return [lo, hi];
}

export function useNetworkData(filters: NetworkFilters, allSeasonItems: SeasonItem[], locale: Locale, simplified?: boolean, studentMode?: boolean): UseNetworkDataResult {
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const abortRef = useRef(false);

  const dataKey = studentMode ? '__student__' : JSON.stringify([...filters.selectedSeasons].sort());
  const armorKey = JSON.stringify(filters.armorTypes);

  useEffect(() => {
    if (!studentMode && filters.selectedSeasons.length === 0) {
      setGraph({ nodes: [], edges: [], nodeTotalWeights: new Map() });
      setLoading(false);
      setProgress('');
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError(null);
    setGraph(null);
    void (async () => {
      try {
        setProgress('Loading student data...');
        if (!studentCache.meta) {
          const raw = await fetchJSON<Record<string, StudentMeta>>(cdn(`/schaledb.com/${locale}.students.min.json`));
          studentCache.meta = Object.fromEntries(Object.values(raw).map((s) => [s.Id, s]));
        }
        if (!studentCache.portraits) {
          const raw = await fetchJSON<Record<string, string>>(cdn('/w/students_portrait.json'));
          studentCache.portraits = Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), `data:image/webp;base64,${v}`]));
        }
        if (abortRef.current) return;

        const filesToLoad: string[] = [];

        if (studentMode) {
          filesToLoad.push('student-latest.json');
        } else {
          const selectedItemMap = new Map(allSeasonItems.map((s) => [s.id, s]));
          for (const sid of filters.selectedSeasons) {
            const item = selectedItemMap.get(sid);
            if (!item) continue;
            let files = simplified && item.aggFile ? [item.aggFile] : item.files;
            if (item.tag === 'eraid' && filters.armorTypes && filters.armorTypes.length > 0) {
              const armorTypes = filters.armorTypes;
              files = files.filter((f) => armorTypes.some((armor) => f.includes(`_${armor}`)));
            }
            for (const f of files) filesToLoad.push(f);
          }
        }

        const uniqueFiles = [...new Set(filesToLoad)];
        let done = 0;
        const loadedSeasons = await Promise.all(
          uniqueFiles.map(async (file) => {
            if (!seasonCache[file]) {
              seasonCache[file] = await fetchJSON<SeasonData>(cdn(`/network-data/${file}`));
            }
            setProgress(`Loading... (${++done}/${filesToLoad.length})`);
            return seasonCache[file];
          }),
        );

        if (abortRef.current) return;
        setProgress('Merging...');

        const edgeMap = new Map<string, number>();
        const nodeMap = new Map<number, number>();

        for (const season of loadedSeasons) {
          const [rangeLo, rangeHi] = getEffectiveRange(filters.rankCutoff, filters.difficulty, season.diffCutoffs);
          for (const [lo, ivHi, edges, nodes] of season.intervals) {
            if (lo > rangeHi) continue;
            if (ivHi !== null && ivHi <= rangeLo) continue;
            if (filters.rankCutoff && ivHi && ivHi > filters.rankCutoff) continue;
            for (const [a, b, count] of edges) {
              const key = a < b ? `${a}:${b}` : `${b}:${a}`;
              edgeMap.set(key, (edgeMap.get(key) ?? 0) + count);
            }
            for (const [id, count] of nodes) {
              nodeMap.set(id, (nodeMap.get(id) ?? 0) + count);
            }
          }
        }

        for (const [key, w] of [...edgeMap]) {
          if (w < filters.minWeight) edgeMap.delete(key);
        }

        const nodeTotalWeights = new Map<number, number>();
        edgeMap.forEach((w, key) => {
          const [a, b] = key.split(':').map(Number);
          nodeTotalWeights.set(a, (nodeTotalWeights.get(a) ?? 0) + w);
          nodeTotalWeights.set(b, (nodeTotalWeights.get(b) ?? 0) + w);
        });

        const topNPerNode = filters.topNPerNode;
        if (topNPerNode !== null && topNPerNode > 0) {
          const nodeEdges = new Map<number, { partner: number; weight: number }[]>();
          edgeMap.forEach((w, key) => {
            const [a, b] = key.split(':').map(Number);
            const edgesA = nodeEdges.get(a) ?? [];
            nodeEdges.set(a, edgesA);
            edgesA.push({ partner: b, weight: w });
            const edgesB = nodeEdges.get(b) ?? [];
            nodeEdges.set(b, edgesB);
            edgesB.push({ partner: a, weight: w });
          });
          const topPartners = new Map<number, Set<number>>();
          nodeEdges.forEach((edges, id) => {
            edges.sort((x, y) => y.weight - x.weight);
            topPartners.set(id, new Set(edges.slice(0, topNPerNode).map((e) => e.partner)));
          });
          for (const key of [...edgeMap.keys()]) {
            const [a, b] = key.split(':').map(Number);
            if (!topPartners.get(a)?.has(b) && !topPartners.get(b)?.has(a)) edgeMap.delete(key);
          }
        }

        const activeIds = new Set<number>();
        edgeMap.forEach((_, key) => {
          const [a, b] = key.split(':').map(Number);
          activeIds.add(a);
          activeIds.add(b);
        });

        const topNodes = [...activeIds].sort((a, b) => (nodeMap.get(b) ?? 0) - (nodeMap.get(a) ?? 0)).slice(0, filters.maxNodes);
        const topSet = new Set(topNodes);

        const edges: { source: number; target: number; weight: number }[] = [];
        edgeMap.forEach((weight, key) => {
          const [a, b] = key.split(':').map(Number);
          if (topSet.has(a) && topSet.has(b)) edges.push({ source: a, target: b, weight });
        });

        const nodes: NetworkNode[] = topNodes.map((id) => ({
          id,
          name: studentCache.meta?.[id]?.Name ?? `ID:${id}`,
          portrait: studentCache.portraits?.[id] ?? '',
          totalAppearances: nodeMap.get(id) ?? 0,
        }));

        setProgress('');
        setGraph({ nodes, edges, nodeTotalWeights });
        setLoading(false);
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
          setProgress('');
        }
      }
    })();

    return () => {
      abortRef.current = true;
    };
  }, [dataKey, armorKey, filters.rankCutoff, filters.difficulty, filters.minWeight, filters.maxNodes, filters.topNPerNode]);

  return { graph, loading, error, progress };
}

export async function loadIndex(): Promise<NetworkIndex> {
  if (!indexCache.data) {
    indexCache.data = await fetchJSON<NetworkIndex>(cdn('/network-data/index.json'));
  }
  return indexCache.data;
}
