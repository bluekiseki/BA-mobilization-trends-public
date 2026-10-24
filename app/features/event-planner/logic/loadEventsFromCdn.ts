import type { EventData } from '~/types/plannerData';
import { cdn } from '~/utils/cdn';

// Test helper: fetches event JSON from the CDN. cdn() only returns absolute URLs outside dev mode, so the calling
// test file must run `vi.hoisted(() => vi.stubEnv('VITE_USE_CDN', 'true'))` before cdn.ts is evaluated.
export async function loadEventsFromCdn<T = EventData>(ids: number[]): Promise<Map<number, T>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(cdn(`/ew/event.${id}.json`));
      if (!res.ok) throw new Error(`Failed to fetch event ${id}: ${res.status}`);
      return [id, await res.json<T>()] as const;
    }),
  );
  return new Map(entries);
}

export function getLoadedEvent<T = EventData>(events: Map<number, T>, id: number): T {
  const event = events.get(id);
  if (!event) throw new Error(`Event ${id} is not preloaded`);
  return event;
}
