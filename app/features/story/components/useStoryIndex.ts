import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { cdn } from '~/utils/cdn';
import eventList from '~/data/jp/eventList.json';
import { STORY_SCHEDULES } from '../data/schedules';
import { withPrologue } from '../logic/prologue';
import { withScheduleNames, type EventNames } from '../logic/scheduleNames';
import type { SeriesReleases } from '../logic/releaseDates';
import { buildSeriesReleases, toStoryLang } from '../logic/storyIndex';
import type { StoryIndex, StoryLang } from '../logic/types';

let pending: Promise<StoryIndex> | null = null;
let cachedIndex: StoryIndex | null = null;

// The index is one file shared by every story page, so it is fetched once per visit.
function loadIndex(): Promise<StoryIndex> {
  pending ??= (async () => {
    const res = await fetch(cdn('/story/story_index.json'));
    if (!res.ok) throw new Error(`Failed to load the story list (${res.status})`);
    const raw: unknown = await res.json();
    cachedIndex = raw as StoryIndex;
    return cachedIndex;
  })().catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}

export function useStoryIndex(): { index: StoryIndex | null; releases: SeriesReleases; error: string | null } {
  // Cached data renders synchronously on return so scroll restoration sees the complete list.
  const [index, setIndex] = useState<StoryIndex | null>(cachedIndex);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadIndex().then(
      (loaded) => {
        if (active) setIndex(loaded);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load the story list');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Names come from the schedule data where it has them (see withScheduleNames).
  const named = useMemo(() => (index ? withScheduleNames(withPrologue(index), STORY_SCHEDULES.jp, eventList satisfies EventNames) : null), [index]);
  const releases = useMemo(() => (named ? buildSeriesReleases(named, STORY_SCHEDULES) : {}), [named]);
  return { index: named, releases, error };
}

// The text language lives in the URL (?lang=) so a shared link keeps it; without it the site language is used.
export function useStoryLang(): { lang: StoryLang; setLang: (lang: StoryLang) => void; query: string } {
  const { i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('lang');
  const lang = toStoryLang(requested ?? i18n.language);
  const setLang = (next: StoryLang) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        copy.set('lang', next);
        return copy;
      },
      { replace: true, preventScrollReset: true },
    );
  const search = params.toString();
  return { lang, setLang, query: search ? `?${search}` : '' };
}

const studentNames = new Map<StoryLang, Promise<Record<string, string>>>();

// Student names in the story language (student id -> name), from the same files the other student pages read. A failed load just means the names stay as written in the schedule.
export function useStudentNames(lang: StoryLang): Record<string, string> {
  const [loaded, setLoaded] = useState<{ lang: StoryLang; names: Record<string, string> } | null>(null);
  useEffect(() => {
    let active = true;
    const request =
      studentNames.get(lang) ??
      fetch(cdn(`/schaledb.com/${lang === 'zh-Hant' ? 'zh_Hant' : lang}.students.min.json`)).then(async (res) => {
        if (!res.ok) return {};
        const raw: unknown = await res.json();
        const names: Record<string, string> = {};
        if (typeof raw === 'object' && raw !== null) {
          for (const [id, student] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof student === 'object' && student !== null && 'Name' in student && typeof student.Name === 'string') names[id] = student.Name;
          }
        }
        return names;
      });
    studentNames.set(lang, request);
    request.then(
      (names) => {
        if (active) setLoaded({ lang, names });
      },
      () => {
        studentNames.delete(lang);
      },
    );
    return () => {
      active = false;
    };
  }, [lang]);
  return loaded?.lang === lang ? loaded.names : {};
}
