import { isTrue, SERVERS, type Release, type Server, type ServerSchedule } from './releaseDates';

export interface FesStudent {
  id: string;
  name: string; // as written in the schedule (English)
}

// One Fes recruitment: the students whose banner opened at the same time.
export interface FesBanner {
  date: string; // "YYYY-MM-DD HH:mm"
  estimated: boolean;
  students: FesStudent[]; // students new to the game only: reruns are not listed
}

// Fes recruitments of a server, earliest first. Reruns are left out, and so is a recruitment that has nothing but reruns.
export function fesBanners(schedule: ServerSchedule): FesBanner[] {
  const byStart = new Map<string, FesBanner>();
  for (const row of schedule.pickup) {
    if (!isTrue(row.fest) || isTrue(row.rerun)) continue;
    const date = row.startTime.slice(0, 16);
    const banner = byStart.get(date) ?? { date, estimated: false, students: [] };
    banner.estimated ||= isTrue(row.prediction);
    banner.students.push({ id: String(row.studentId), name: String(row.name ?? '') });
    byStart.set(date, banner);
  }
  return [...byStart.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// A Fes recruitment seen from one server, with the date it opens on every server that has it.
export interface FesEvent extends FesBanner {
  anniversary: number | null; // years: the first Fes is 0.5, the next 1, then 1.5 ...
  releases: Partial<Record<Server, Release[]>>;
}

// Fes come twice a year, so the n-th Fes (in the order they came out in Japan) is the (n / 2)-year anniversary one: 0.5, 1, 1.5 ...
export function fesAnniversary(position: number): number {
  return (position + 1) / 2;
}

// The Fes recruitments of `server`, each with the date of the same recruitment on the other server (found by the students it introduces).
// The anniversary follows the order in Japan, so the other server shows the same one for the same recruitment.
export function fesEvents(schedules: Record<Server, ServerSchedule>, server: Server): FesEvent[] {
  const other = SERVERS.find((candidate) => candidate !== server) ?? server;
  const original = SERVERS[0];
  const originalBanners = fesBanners(schedules[original]);
  const anniversaryOfStudent = new Map<string, number>();
  originalBanners.forEach((banner, position) => banner.students.forEach((student) => anniversaryOfStudent.set(student.id, fesAnniversary(position))));
  const byStudent = new Map<string, FesBanner>();
  for (const banner of fesBanners(schedules[other])) for (const student of banner.students) byStudent.set(student.id, banner);
  return fesBanners(schedules[server]).map((banner) => {
    const twin = banner.students.map((student) => byStudent.get(student.id)).find((found) => found !== undefined);
    const release = (value: FesBanner): Release[] => [{ date: value.date, label: null, estimated: value.estimated }];
    const anniversary = banner.students.flatMap((student) => anniversaryOfStudent.get(student.id) ?? [])[0] ?? null;
    return { ...banner, anniversary, releases: { [server]: release(banner), ...(twin && { [other]: release(twin) }) } };
  });
}

type Dated<T> = { date: string | null; value: T };
export type Merged<A, B> = { kind: 'first'; value: A } | { kind: 'second'; value: B };

const day = (date: string | null) => date?.slice(0, 10) ?? null;

// Whether the next item of the first list goes before the next item of the second one.
function goesFirst(left: string | null, right: string | null, descending: boolean): boolean {
  if (left === null) return false;
  if (right === null) return true;
  return descending ? left >= right : left <= right;
}

// Merges two lists that are each already in date order (earliest first, or latest first with `descending`). On the same day the first list goes first,
// and items without a date come last.
export function mergeByDay<A, B>(first: Dated<A>[], second: Dated<B>[], descending: boolean): Merged<A, B>[] {
  const merged: Merged<A, B>[] = [];
  let a = 0;
  let b = 0;
  while (a < first.length || b < second.length) {
    const left = first[a];
    const right = second[b];
    if (left && (!right || goesFirst(day(left.date), day(right.date), descending))) {
      merged.push({ kind: 'first', value: left.value });
      a++;
    } else if (right) {
      merged.push({ kind: 'second', value: right.value });
      b++;
    }
  }
  return merged;
}
