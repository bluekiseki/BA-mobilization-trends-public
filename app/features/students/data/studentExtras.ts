import { useEffect, useState } from 'react';
import { cdn } from '~/utils/cdn';
import { getPreferredGiftList } from '~/utils/student/giftAffectionList';
import type { Locale } from '~/utils/i18n/config';
import type { PublicStudent } from './publicStudent';

// These files are several MB, so they are read in the browser after the page is shown. Reading them while rendering on the
// server would exceed the CPU time a request is allowed to use.
export interface StudentExtras {
  memorialRank: number | null;
  bgm: { id: string; title: string }[];
  gifts: { id: string; name: string; points: number; preferenceLevel: number; rarity: number }[];
  favorStories: { rank: number; memorial: boolean; title: string; summary: string }[];
}

export const EMPTY_STUDENT_EXTRAS: StudentExtras = { memorialRank: null, bgm: [], gifts: [], favorStories: [] };

type LocalizedText = Record<string, unknown>;
interface IconItem {
  ItemCategory: number;
  TagsStr: string[];
  Rarity: number;
  LocalizeEtc: Record<'NameEn' | 'NameKr' | 'NameJp' | 'NameTw', string | null | undefined>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const localized = (value: unknown, locale: Locale) => (isRecord(value) ? text((value as LocalizedText)[locale]) || text((value as LocalizedText).en) : '');

function readStories(json: unknown, id: string, locale: Locale): StudentExtras['favorStories'] {
  const rows = isRecord(json) ? json[id] : null;
  if (!Array.isArray(rows)) return [];
  // Titles and summaries may be missing for newer stories; those entries just show the rank.
  return rows.flatMap((row: unknown) =>
    isRecord(row) && typeof row.favor_rank === 'number'
      ? [{ rank: row.favor_rank, memorial: row.memorial === true, title: localized(row.title, locale), summary: localized(row.summary, locale) }]
      : [],
  );
}

function readBgm(json: unknown, id: string, memoryLobbyBgm: number | null | undefined): StudentExtras['bgm'] {
  if (!Array.isArray(json)) return [];
  const tracks = json.filter(isRecord);
  // The jukebox entries that reference the student as a memorial lobby are the reliable source. A few students have none, so the
  // track named in the student data fills in, but only when the jukebox knows that id (the field holds other kinds of ids as well).
  const referenced = tracks.filter((track) => Array.isArray(track.xref) && track.xref.some((ref: unknown) => isRecord(ref) && ref.type === 'Memorial' && String(ref.title) === id));
  const named = tracks.filter((track) => track.id === String(memoryLobbyBgm ?? ''));
  return (referenced.length ? referenced : named).map((track) => ({ id: text(track.id), title: text(track.title) }));
}

const isIconItems = (value: unknown): value is Record<string, IconItem> => isRecord(value) && Object.values(value).every(isRecord);

function readGifts(json: unknown, student: PublicStudent, locale: Locale): StudentExtras['gifts'] {
  const items = isRecord(json) ? json.Item : null;
  if (!isIconItems(items)) return [];
  const nameKey = ({ en: 'NameEn', ko: 'NameKr', ja: 'NameJp', 'zh-Hant': 'NameTw' } as const)[locale];
  return getPreferredGiftList(student, { icons: { Item: items } }).map((gift) => {
    const names = items[gift.id].LocalizeEtc;
    return { id: gift.id, points: gift.affectionPoints, preferenceLevel: gift.preferenceLevel, rarity: gift.rarity, name: names[nameKey] || names.NameEn || gift.id };
  });
}

export function buildStudentExtras(student: PublicStudent, locale: Locale, sources: { stories: unknown; music: unknown; icons: unknown }): StudentExtras {
  const id = String(student.Id);
  const favorStories = readStories(sources.stories, id, locale);
  return {
    memorialRank: favorStories.find((story) => story.memorial)?.rank ?? null,
    bgm: readBgm(sources.music, id, student.MemoryLobbyBGM),
    gifts: readGifts(sources.icons, student, locale),
    favorStories,
  };
}

const requests = new Map<string, Promise<unknown>>();
// A failed read leaves its section empty instead of breaking the page, and is tried again on the next visit
function readJson(path: string): Promise<unknown> {
  const cached = requests.get(path);
  if (cached) return cached;
  const request = fetch(cdn(path)).then((res): Promise<unknown> => (res.ok ? res.json() : Promise.reject(new Error(`${path}: ${res.status}`))));
  request.catch(() => requests.delete(path));
  requests.set(path, request);
  return request;
}

const settled = (promise: Promise<unknown>) => promise.catch((): unknown => null);

/** The enrichment of a student profile; `wanted` picks which files are read (the story tab only needs the stories). */
export function useStudentExtras(student: PublicStudent, locale: Locale, wanted: { stories: boolean; music: boolean; icons: boolean }): StudentExtras {
  const [loaded, setLoaded] = useState<{ studentId: number; extras: StudentExtras } | null>(null);
  const { stories, music, icons } = wanted;
  useEffect(() => {
    let alive = true;
    void Promise.all([
      stories ? settled(readJson('/schaledb.com/student_favor_stories_parsed.json')) : null,
      music ? settled(readJson('/w/bgm_database_combined.json')) : null,
      icons ? settled(readJson('/ew/icon_info.json')) : null,
    ]).then(([storiesJson, musicJson, iconsJson]) => {
      if (alive) setLoaded({ studentId: student.Id, extras: buildStudentExtras(student, locale, { stories: storiesJson, music: musicJson, icons: iconsJson }) });
    });
    return () => {
      alive = false;
    };
  }, [student, locale, stories, music, icons]);
  return loaded?.studentId === student.Id ? loaded.extras : EMPTY_STUDENT_EXTRAS;
}
