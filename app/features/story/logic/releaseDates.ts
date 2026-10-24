export const SERVERS = ['jp', 'kr'] as const;
export type Server = (typeof SERVERS)[number];
export const SERVER_LABELS: Record<Server, string> = { jp: 'JP', kr: 'Global' };

type CsvValue = string | number | boolean | null | undefined;

// Rows of the schedule CSVs the calendar already uses (only the columns read here).
export interface MainRow {
  startTime: string;
  titleKey: string;
  part?: CsvValue;
  prediction?: CsvValue;
  episodes?: CsvValue; // episodes opened by this part, e.g. "1~10"
}
export interface GroupRow {
  startTime: string;
  id: CsvValue;
  episode?: CsvValue;
  prediction?: CsvValue;
  titleEn?: CsvValue;
  titleKo?: CsvValue;
  titleJa?: CsvValue;
}
export interface MiniRow {
  startTime: string;
  id: CsvValue;
  prediction?: CsvValue;
}
export interface EventRow {
  id: CsvValue;
  openTime: string;
  rerun?: CsvValue;
  prediction?: CsvValue;
}
export interface PickupRow {
  studentId: CsvValue;
  startTime: string;
  name?: CsvValue;
  rerun?: CsvValue;
  fest?: CsvValue;
  prediction?: CsvValue;
}

export interface ServerSchedule {
  main: MainRow[];
  group: GroupRow[];
  mini: MiniRow[];
  event: EventRow[];
  pickup: PickupRow[];
}

export interface Release {
  date: string; // "YYYY-MM-DD HH:mm"
  label: string | null; // part of a chapter / episode range, when a series is released in several steps
  estimated: boolean;
  episodes?: [number, number]; // episodes (1-based) released in this step
}

export const isTrue = (value: CsvValue): boolean => value === true || String(value).toLowerCase() === 'true';
const minutes = (time: string): string => time.slice(0, 16);
const byDate = (a: Release, b: Release): number => a.date.localeCompare(b.date);

// "1-4" -> [1, 4], "2" -> [2, 2] (a "~" is read too)
function parseEpisodes(value: CsvValue): [number, number] | null {
  const match = /^(\d+)(?:[~-](\d+))?$/.exec(String(value ?? '').trim());
  return match ? [Number(match[1]), Number(match[2] ?? match[1])] : null;
}

function partLabel(part: CsvValue): string | null {
  if (part === null || part === undefined || part === '' || part === 0) return null;
  return typeof part === 'number' ? `Part ${part}` : String(part);
}

// Release steps of a series, earliest first. Key = [kind, key] as written by the exporter.
export function seriesReleases(key: readonly [string, string], schedule: ServerSchedule): Release[] {
  const [kind, id] = key;
  const releases: Release[] = [];
  if (kind === 'main') {
    const rows = schedule.main.filter((r) => r.titleKey === id);
    for (const r of rows) {
      const episodes = parseEpisodes(r.episodes);
      releases.push({ date: minutes(r.startTime), label: rows.length > 1 ? partLabel(r.part) : null, estimated: isTrue(r.prediction), ...(episodes && { episodes }) });
    }
  } else if (kind === 'group') {
    const rows = schedule.group.filter((r) => String(r.id) === id);
    for (const r of rows) {
      const episodes = parseEpisodes(r.episode);
      releases.push({ date: minutes(r.startTime), label: rows.length > 1 && r.episode ? `Episode ${r.episode}` : null, estimated: isTrue(r.prediction), ...(episodes && { episodes }) });
    }
  } else if (kind === 'mini') {
    for (const r of schedule.mini.filter((row) => String(row.id) === id)) releases.push({ date: minutes(r.startTime), label: null, estimated: isTrue(r.prediction) });
  } else if (kind === 'event') {
    const row = schedule.event.find((r) => String(r.id) === id && !isTrue(r.rerun));
    if (row) releases.push({ date: minutes(row.openTime), label: null, estimated: isTrue(row.prediction) });
  } else if (kind === 'launch') {
    // Content explanations are not stories released on a day.
  } else if (kind === 'favor') {
    // No schedule for bond stories: they open with the student, so the first pickup is used. Launch students have no pickup row.
    const pickups = schedule.pickup.filter((r) => String(r.studentId) === id).map((r) => minutes(r.startTime));
    const launch = schedule.main.map((r) => minutes(r.startTime)).sort()[0];
    // A pickup date is the real opening day; only the launch fallback is a guess.
    const picked = pickups.sort()[0];
    const date = picked ?? launch;
    if (date) releases.push({ date, label: null, estimated: picked === undefined });
  }
  return releases.sort(byDate);
}

// Parts released at the same moment are one step when shown as a list.
export function collapseSameDate(releases: Release[]): Release[] {
  const steps: Release[] = [];
  for (const release of releases) {
    const last = steps[steps.length - 1];
    if (last && last.date === release.date) {
      last.label = last.label && release.label ? `${last.label}, ${release.label}` : (last.label ?? release.label);
      last.estimated = last.estimated || release.estimated;
    } else {
      steps.push({ ...release });
    }
  }
  return steps;
}

// Index of the step a story was released in when its series was released in steps, otherwise null (the story shares the series' dates).
// Needs the episodes of every step; position is the 0-based position of the story in its series.
export function ownStep(steps: Release[], position: number): number | null {
  if (steps.length < 2 || !steps.every((step) => step.episodes)) return null;
  const episode = position + 1;
  const found = steps.findIndex((step) => step.episodes && episode >= step.episodes[0] && episode <= step.episodes[1]);
  return found < 0 ? null : found;
}

export function ownRelease(steps: Release[], position: number): Release | null {
  const step = ownStep(steps, position);
  return step === null ? null : steps[step];
}

// Releases of every series on every server, by series id.
export type SeriesReleases = Record<string, Partial<Record<Server, Release[]>>>;
