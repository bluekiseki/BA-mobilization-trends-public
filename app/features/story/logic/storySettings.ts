import { SERVERS, type Server } from './releaseDates';

export interface StorySettings {
  server: Server; // server whose release dates are shown first
  spoilers: boolean; // show thumbnails and summaries
}

const KEY = 'story-settings';
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: StorySettings | null } | null = null;

function read(): StorySettings | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage can be blocked; the choice then only lasts for this visit.
    return cache?.value ?? null;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: StorySettings | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === 'object' && parsed !== null && 'server' in parsed && 'spoilers' in parsed) {
      const server = SERVERS.find((candidate) => candidate === parsed.server);
      if (server && typeof parsed.spoilers === 'boolean') value = { server, spoilers: parsed.spoilers };
    }
  } catch {
    value = null;
  }
  cache = { raw, value };
  return value;
}

function write(value: StorySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    cache = { raw: null, value };
  }
  listeners.forEach((listener) => listener());
}

export const storySettingsStore = {
  read,
  write,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
