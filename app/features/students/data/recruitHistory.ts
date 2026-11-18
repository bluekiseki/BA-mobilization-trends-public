import jpPickupCsv from '~/data/jp/schedule/pickup.csv?raw';
import glPickupCsv from '~/data/kr/schedule/pickup.csv?raw';
import jpEventCsv from '~/data/jp/schedule/event.csv?raw';
import glEventCsv from '~/data/kr/schedule/event.csv?raw';
import eventListJson from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
import { getPlannerEventName } from '~/utils/eventList';
import type { Locale } from '~/utils/i18n/config';
import { parseCsvString } from '~/utils/calender.data';

export type RecruitServer = 'gl' | 'jp';

export interface RecruitHistoryEntry {
  // Wall-clock times exactly as written in the CSV; the schedule loader reads them as +09:00
  startTime: string;
  endTime: string;
  rerun: boolean;
  limited: boolean;
  fest: boolean;
  // Raw CSV value ('encore', 'recall' or empty). Its meaning is not documented, so it is passed through as-is.
  bannerType: string;
  prediction: boolean;
}

interface PickupRow {
  studentId: number;
  startTime: string;
  endTime: string;
  rerun?: boolean;
  limited?: boolean;
  fest?: boolean;
  bannerType?: string;
  prediction?: boolean;
}

const SOURCES: Record<RecruitServer, string> = { gl: glPickupCsv, jp: jpPickupCsv };

// Reading a whole schedule file costs more CPU than a request may use, so only the header and the lines that mention the
// student's id go through the CSV parser (the rows are checked again afterwards, so a line that merely contains the digits is dropped).
function rowsOf<T extends object>(csv: string, studentId: number): T[] {
  const lines = csv.split('\n');
  const id = String(studentId);
  return parseCsvString<T>([lines[0], ...lines.slice(1).filter((line) => line.includes(id))].join('\n'));
}

// Rows of one student id (each outfit has its own id), newest first.
export function loadRecruitHistory(studentId: number): Record<RecruitServer, RecruitHistoryEntry[]> {
  const pick = (server: RecruitServer) =>
    rowsOf<PickupRow>(SOURCES[server], studentId)
      .filter((row) => row.studentId === studentId && row.startTime && row.endTime)
      .map((row) => ({
        startTime: row.startTime,
        endTime: row.endTime,
        rerun: !!row.rerun,
        limited: !!row.limited,
        fest: !!row.fest,
        bannerType: row.bannerType ?? '',
        prediction: !!row.prediction,
      }))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  return { gl: pick('gl'), jp: pick('jp') };
}

export type RecruitStatus = 'predicted' | 'upcoming' | 'ongoing' | 'ended';

export function recruitStatus(entry: RecruitHistoryEntry, nowMs: number): RecruitStatus {
  // A predicted row is never confirmed, whatever its dates say
  if (entry.prediction) return 'predicted';
  if (nowMs < new Date(entry.startTime.replace(' ', 'T') + '+09:00').getTime()) return 'upcoming';
  return nowMs <= new Date(entry.endTime.replace(' ', 'T') + '+09:00').getTime() ? 'ongoing' : 'ended';
}

export interface EventRewardEntry {
  eventId: number;
  name: string;
  startTime: string;
  endTime: string;
  rerun: boolean;
  prediction: boolean;
}

interface EventRow {
  id: number;
  openTime: string;
  closeTime: string;
  rerun?: boolean;
  studentId?: number;
  prediction?: boolean;
}

const EVENT_SOURCES: Record<RecruitServer, string> = { gl: glEventCsv, jp: jpEventCsv };

// Students whose event is a permanent story, so it overlaps with other events and says nothing about when they can be obtained:
// Toki (Battle) 16019 and Otogi 16020.
const PERMANENT_STORY_STUDENTS = new Set([16019, 16020]);

// Events that hand the student out as a reward, per server, newest first.
export function loadEventRewards(studentId: number, locale: Locale): Record<RecruitServer, EventRewardEntry[]> {
  if (PERMANENT_STORY_STUDENTS.has(studentId)) return { gl: [], jp: [] };
  const pick = (server: RecruitServer) =>
    rowsOf<EventRow>(EVENT_SOURCES[server], studentId)
      .filter((row) => row.studentId === studentId && row.openTime && row.closeTime)
      .map((row) => ({
        eventId: row.id,
        name: getPlannerEventName(eventListJson as unknown as EventListData, row.id, locale),
        startTime: row.openTime,
        endTime: row.closeTime,
        rerun: !!row.rerun,
        prediction: !!row.prediction,
      }))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  return { gl: pick('gl'), jp: pick('jp') };
}
