import type { FullData, GameServer } from '~/types/data';
import { cdn } from '~/utils/cdn';
import { column, fetchTable } from '~/utils/columnTable';

/** Season id -> data folder name (R93 -> R093, E0 -> E000). Must match how the data files are exported. */
const v2Folder = (id: string) => id[0] + id.slice(1).padStart(3, '0');

export const fullDataUrl = (server: GameServer, id: string) => cdn(`/w/v2/${server}/${v2Folder(id)}/scores.bin`);

/** The few scores the header tier card reads (first and last rank of each tier), so the card does not wait for the full scores table. */
export interface TierCuts {
  tier_counter: Record<string, number>;
  /** Score by 0-based rank position for `rank` and `rank_1..3`. A position past the end of a per-boss list is absent. */
  scores: Record<string, Record<string, number>>;
}

export const tierCutsUrl = (server: GameServer, id: string) => cdn(`/w/v2/${server}/${v2Folder(id)}/tiers.json`);

export async function fetchTierCuts(url: string, signal?: AbortSignal): Promise<TierCuts> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json<TierCuts>();
}

export const loadTierCuts = (server: GameServer, id: string) => fetchTierCuts(tierCutsUrl(server, id));

/** Per-boss score lists are sorted in descending order and padded with -1 up to the user count. */
function trimPadding(col: Int32Array | undefined): Int32Array | undefined {
  if (!col) return undefined;
  const end = col.indexOf(-1);
  return end < 0 ? col : col.subarray(0, end);
}

/** Builds the dashboard overview data from a season's scores table (one row per user in rank order, tier_counter in the header meta). */
export async function loadFullData(server: GameServer, id: string): Promise<FullData> {
  const table = await fetchTable(fullDataUrl(server, id));
  const tierCounter = table.meta?.tier_counter as Record<string, number> | undefined;
  if (!tierCounter) throw new Error(`tier_counter-missing: ${server}/${id}`);
  const int32 = (name: string) => table.columns[name] as Int32Array | undefined;
  return {
    rank: column(table, 'score') as Int32Array,
    rank_1: trimPadding(int32('rank_1')),
    rank_2: trimPadding(int32('rank_2')),
    rank_3: trimPadding(int32('rank_3')),
    tier_counter: tierCounter,
  };
}
