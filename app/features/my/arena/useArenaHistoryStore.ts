import { create } from 'zustand';
import type { ArenaRecord } from '~/features/my/arena/types';
import { currentSeasonKey, parseSeasonKey, type ArenaServer } from '~/features/my/arena/scan/seasons';
import { groupBySeason, listLocalSeasonKeys, loadSeason, migrateLegacyArenaHistory, saveSeason } from '~/features/my/arena/scan/storage';

const PREFS_KEY = 'arena-prefs-v1';

// The JP/Global choice for visitors without a profile; a logged-in profile's server always wins.
export function readSavedArenaServer(): ArenaServer | null {
  try {
    const value = localStorage.getItem(PREFS_KEY);
    const server = value ? (JSON.parse(value) as { server?: unknown }).server : null;
    return server === 'jp' || server === 'gl' ? server : null;
  } catch {
    return null;
  }
}

function saveArenaServer(server: ArenaServer): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ server }));
  } catch {
    // Preference only.
  }
}

interface ArenaHistoryState {
  server: ArenaServer | null;
  // The viewed season; only its records are in memory (search and stats run on them).
  seasonKey: string;
  records: ArenaRecord[];
  // Seasons with saved records plus the current one, newest first.
  seasonKeys: string[];
  loading: boolean;
  setServer: (server: ArenaServer, remember?: boolean) => Promise<void>;
  selectSeason: (seasonKey: string) => Promise<void>;
  // Records are filed into the season of their capture time, which may differ from the viewed one.
  addRecords: (records: ArenaRecord[]) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  // JSON import: replaces the viewed season.
  replaceRecords: (records: ArenaRecord[]) => Promise<void>;
}

const seasonKeysFor = (server: ArenaServer, extra: string[] = []) =>
  [...new Set([currentSeasonKey(server), ...listLocalSeasonKeys(server), ...extra])].sort((a, b) => (parseSeasonKey(b)?.season ?? 0) - (parseSeasonKey(a)?.season ?? 0));

// Guards against an older season load finishing after a newer selection.
let loadToken = 0;

export const useArenaHistoryStore = create<ArenaHistoryState>((set, get) => ({
  server: null,
  seasonKey: '',
  records: [],
  seasonKeys: [],
  loading: false,

  setServer: async (server, remember = false) => {
    if (remember) saveArenaServer(server);
    if (get().server === server) return;
    migrateLegacyArenaHistory(server);
    set({ server });
    await get().selectSeason(currentSeasonKey(server));
  },

  selectSeason: async (seasonKey) => {
    const { server } = get();
    if (!server) return;
    const token = ++loadToken;
    set({ seasonKey, loading: true });
    const records = await loadSeason(seasonKey);
    if (token !== loadToken) return;
    set({ records, loading: false, seasonKeys: seasonKeysFor(server, [seasonKey]) });
  },

  addRecords: async (records) => {
    const { server } = get();
    if (!server || records.length === 0) return;
    for (const [key, group] of groupBySeason(records, server)) {
      const existing = key === get().seasonKey ? get().records : await loadSeason(key);
      const next = [...existing, ...group];
      await saveSeason(key, next);
      if (key === get().seasonKey) set({ records: next });
    }
    set({ seasonKeys: seasonKeysFor(server, [get().seasonKey]) });
  },

  deleteRecord: async (id) => {
    const { seasonKey } = get();
    const records = get().records.filter((record) => record.id !== id);
    set({ records });
    await saveSeason(seasonKey, records);
  },

  replaceRecords: async (records) => {
    const { seasonKey } = get();
    set({ records });
    await saveSeason(seasonKey, records, true);
  },
}));
