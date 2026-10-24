import type { ServerSchedule } from './releaseDates';
import type { LocalizedText, StoryIndex } from './types';

export type EventNames = Record<string, { Kr?: string | null; Jp?: string | null; En?: string | null; Tw?: string | null }>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const clean = (names: LocalizedText): LocalizedText => Object.fromEntries(Object.entries(names).filter(([, value]) => value));

// Names that the schedule data already knows win over the generated index, so that no series needs a hand-kept name:
// club names come from the group story schedule, and event names fill the languages the index is missing from the event list.
export function withScheduleNames(index: StoryIndex, schedule: ServerSchedule, events: EventNames): StoryIndex {
  const series = { ...index.series };
  for (const [id, entry] of Object.entries(index.series)) {
    const [kind, key] = entry.r ?? [];
    if (kind === 'group') {
      const row = schedule.group.find((candidate) => String(candidate.id) === key && (text(candidate.titleKo) || text(candidate.titleJa) || text(candidate.titleEn)));
      if (row) series[id] = { ...entry, name: clean({ en: text(row.titleEn), ko: text(row.titleKo), ja: text(row.titleJa) }) };
    } else if (kind === 'event' && key && events[key]) {
      const known = events[key];
      const merged: LocalizedText = clean({ ko: text(known.Kr), ja: text(known.Jp), en: text(known.En), 'zh-Hant': text(known.Tw), ...entry.name });
      if (Object.keys(merged).length > 0) series[id] = { ...entry, name: merged };
    }
  }
  return { ...index, series };
}
