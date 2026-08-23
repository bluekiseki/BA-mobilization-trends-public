// app/routes/utils/jukebox.tsx
import { useState, useEffect, useRef, useCallback, useMemo, memo, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import eventList from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
import { useDataCache } from '~/utils/cache';
import type { Student } from '~/types/data';
import { eventConvertor, FilterIcon, GENERAL_CATEGORIES, mainStoryChapters, otherStoryTitles, PlayIcon, SoundWaveIcon, XREF_PREFIXES, type OtherStoryData } from './jukeboxMetadata';
import { data } from 'react-router';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import RubyText from '~/components/RubyText';
import { FaSortAmountUp, FaSortAmountDown } from 'react-icons/fa';
import type { Route } from './+types/jukebox';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { useHelpKey } from '~/utils/usePageHelp';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import Player from '~/components/jukebox/Player';
import StoryFilters from '~/components/jukebox/StoryFilters';
import type { StudentPortraitData } from '~/types/plannerData';
import { FiChevronDown } from 'react-icons/fi';
import { PageHeader } from '~/components/common/PageHeader';

// --- TYPE DEFINITIONS ---
type Language = 'en' | 'jp' | 'ko' | 'tw';
interface LocalizedName {
  ja?: string | string[] | null;
  ko?: string | string[] | null;
  en?: string | string[] | null;
  tw?: string | string[] | null;
}
interface LocalizedObj {
  ja?: string | string[] | null;
  jp?: string | string[] | null;
  ko?: string | string[] | null;
  en?: string | string[] | null;
  tw?: string | string[] | null;
  Name?: string | null;
}
interface XrefEntry {
  type: string;
  title?: string | number | null;
  name?: LocalizedObj;
  episode?: string | number | null;
}
interface BgmEntry {
  id: string;
  title?: string;
  composer?: string;
  youtube_url?: string;
  xref: XrefEntry[];
}
interface YTPlayer {
  seekTo: (seconds: number) => void;
  playVideo: () => void;
}

// --- HELPER FUNCTIONS ---
const getLocalizedText = (obj: LocalizedObj | null | undefined, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string => {
  const val = obj?.[lang] || obj?.[fallbackKey] || obj?.Name || '';
  return Array.isArray(val) ? (val[0] ?? '') : val;
};
const getLocalizedTextArr = (obj: LocalizedObj | null | undefined, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string | string[] => obj?.[lang] || obj?.[fallbackKey] || obj?.Name || '';

// --- LOADER / META / HANDLE ---
export function loader({ context }: Route.LoaderArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    site_title: i18n.t('common:title'),
    title: i18n.t('jukebox:title'),
    description: i18n.t('jukebox:description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.site_title, loaderData.description, '/img/j.webp');
}

export const handle: AppHandle = {
  preload: (rawData) => {
    const loaderData = rawData as { locale: Locale };
    return [
      { rel: 'preload', href: cdn(`/w/${getLocaleShortName(loaderData.locale)}.students.bin`), as: 'fetch', crossOrigin: 'anonymous' },
      { rel: 'preload', href: cdn(`/w/students_portrait.json`), as: 'fetch', crossOrigin: 'anonymous' },
      ...createLinkHreflang(`/utils/jukebox`),
    ];
  },
};

// --- BGM LIST ITEM (memoized to prevent re-renders on unrelated state changes) ---
const BgmItem = memo(function BgmItem({
  bgm,
  isExpanded,
  isPlaying,
  hasAnyActiveFilter,
  isXrefMatchingActive,
  renderXrefLine,
  onSelect,
  onToggleDetails,
}: {
  bgm: BgmEntry;
  isExpanded: boolean;
  isPlaying: boolean;
  hasAnyActiveFilter: boolean;
  isXrefMatchingActive: (xref: XrefEntry) => boolean;
  renderXrefLine: (xref: XrefEntry, bgm: BgmEntry) => string;
  onSelect: (bgm: BgmEntry) => void;
  onToggleDetails: (id: string) => void;
}) {
  const { t } = useTranslation('jukebox');

  const matchingXrefs = useMemo(() => (hasAnyActiveFilter ? bgm.xref.filter(isXrefMatchingActive) : []), [hasAnyActiveFilter, bgm.xref, isXrefMatchingActive]);

  return (
    <div
      id={`bgm-item-${bgm.id}`}
      className={`scroll-mt-24 md:scroll-mt-16 px-4 py-3 transition-colors duration-150 ${isPlaying ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/30'}`}
    >
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelect(bgm)}>
        <span className={`font-mono text-base font-bold w-10 shrink-0 tabular-nums ${isPlaying ? 'text-sky-500 dark:text-sky-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {Number(bgm.id) < 10000 ? bgm.id : 'N/A'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${isPlaying ? 'text-sky-700 dark:text-sky-300' : 'text-neutral-800 dark:text-neutral-100'}`}>{bgm.title || `BGM #${bgm.id}`}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5">{bgm.composer}</p>
        </div>
        {bgm.youtube_url && <div className={`shrink-0 ${isPlaying ? 'text-sky-500 dark:text-sky-400' : 'text-neutral-300 dark:text-neutral-600'}`}>{isPlaying ? <SoundWaveIcon /> : <PlayIcon />}</div>}
      </div>

      {matchingXrefs.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDetails(bgm.id);
          }}
          className="mt-2 w-full text-left group"
        >
          <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
            <FiChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            <span className="font-medium">
              {matchingXrefs.length} {isExpanded ? t('actions.hide_details') : t('actions.view_details')}
            </span>
          </div>
          {isExpanded && (
            <ul className="mt-1.5 ml-3.5 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
              {matchingXrefs.map((x, i) => (
                <li key={i} className="flex items-baseline gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span className="shrink-0 text-neutral-300 dark:text-neutral-600">·</span>
                  <RubyText>{renderXrefLine(x, bgm)}</RubyText>
                </li>
              ))}
            </ul>
          )}
        </button>
      )}
    </div>
  );
});

// --- PAGE COMPONENT ---
export default function JukeboxPage() {
  const { t, i18n } = useTranslation(['jukebox', 'game']);
  const { t: t_club } = useTranslation('club');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const language = ({ ja: 'jp', ko: 'ko', en: 'en', 'zh-Hant': 'zh_Hant' }[locale] as Language) || 'jp';

  // --- State ---
  const [allBgm, setAllBgm] = useState<BgmEntry[]>([]);
  const [studentData, setStudentData] = useState<Record<string, Student>>({});
  const [eventData, setEventListData] = useState<EventListData>({});
  const [filteredBgm, setFilteredBgm] = useState<BgmEntry[]>([]);
  const [currentSong, setCurrentSong] = useState<BgmEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherStoryData] = useState<OtherStoryData>(otherStoryTitles);

  const [searchTerm, setSearchTerm] = useState('');
  const [spoilerFilters, setSpoilerFilters] = useState<{
    general: Record<string, boolean>;
    mainStories: Record<string, boolean>;
    eventStories: Record<string, boolean>;
    favorStudents: Record<string, boolean>;
    memorialStudents: Record<string, boolean>;
  }>({ general: {}, mainStories: {}, eventStories: {}, favorStudents: {}, memorialStudents: {} });

  const [mainStoryList, setMainStoryList] = useState<[string, string][]>([]);
  const [eventStoryList, setEventStoryList] = useState<[string, string][]>([]);
  const [studentFilterList, setStudentFilterList] = useState<[string, Student][]>([]);
  const [expandedBgmIds, setExpandedBgmIds] = useState<Record<string, boolean>>({});

  const [, startTransition] = useTransition();
  const [playbackMode, setPlaybackMode] = useState<'autoplay' | 'repeat' | 'off'>('autoplay');
  const [showStoryNames, setShowStoryNames] = useState(false);
  const [sortOrder, setSortOrder] = useState<'ascending' | 'descending'>('ascending');
  const [isAutoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isFilterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sectionSearch, setSectionSearch] = useState({
    mainStories: '',
    eventStories: '',
    favorStudents: '',
    memorialStudents: '',
  });

  const fetchStudents = useDataCache<Record<string, Student>>();
  useHelpKey('jukebox');
  const matcher = useSearchMatcher(locale);

  // --- Data Fetch ---
  useEffect(() => {
    const loadBgm = async () => {
      const response = await fetch(cdn('/w/bgm_database_combined.json'));
      const raw: unknown = await response.json();
      const d = raw as BgmEntry[];
      setAllBgm(d.sort((a, b) => Number(a.id) - Number(b.id)));
    };
    void loadBgm();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const studentsRes = await fetchStudents(cdn(`/w/${getLocaleShortName(locale)}.students.bin`), (r) => r.json());

        const setStudentPortraits: StudentPortraitData = await (await fetch(cdn(`/w/students_portrait.json`))).json();
        if (studentsRes)
          for (const i in setStudentPortraits) {
            if (studentsRes[i]) studentsRes[i].Portrait = setStudentPortraits[i];
          }

        const studentJson = studentsRes || {};
        const eventJson = eventList as unknown as EventListData;
        setStudentData(studentJson);
        setEventListData(eventJson);

        const mainStories = new Map<string, string>();
        const eventStories = new Map<string, string>();
        const students = new Map<string, Student>();

        allBgm.forEach((bgm) =>
          bgm.xref.forEach((xref) => {
            if (xref.type === 'Main_Story' && xref.title) {
              const key = String(xref.title);
              mainStories.set(key, mainStoryChapters[key] ? t(`main_story.${mainStoryChapters[key].key}`, key) : key);
            }
            if (xref.type === 'Event_Story' && xref.title) {
              const localeMap: Record<string, 'En' | 'Jp' | 'Kr' | 'Tw'> = { en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' };
              eventStories.set(
                String(xref.title),
                (!Number.isNaN(Number(xref.title)) ? eventJson[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.[localeMap[locale]] : '') ||
                  (Number(xref.title) ? eventJson[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.Jp : '') ||
                  xref.title.toString(),
              );
            }
            if ((xref.type === 'Favor_Story' || xref.type === 'Memorial') && xref.title) {
              const sid = String(xref.title);
              if (studentJson[sid] && !students.has(sid)) students.set(sid, studentJson[sid]);
            }
          }),
        );

        setEventStoryList(Array.from(eventStories.entries()).sort((a, b) => Number(isNaN(Number(a[0]))) - Number(isNaN(Number(b[0]))) || Number(b[0]) - Number(a[0])));
        setStudentFilterList(Array.from(students.entries()).sort((a, b) => a[1].Name.localeCompare(b[1].Name)));
        setMainStoryList(Array.from(mainStories.entries()).sort((a, b) => -Number(new Date(mainStoryChapters[a[0]]?.date || 0)) + Number(new Date(mainStoryChapters[b[0]]?.date || 0))));
        setSpoilerFilters((prev) => ({
          ...prev,
          general: Object.fromEntries(Object.keys(GENERAL_CATEGORIES).map((k) => [k, false])),
          mainStories: Object.fromEntries(Array.from(mainStories.keys()).map((k) => [k, false])),
          eventStories: Object.fromEntries(Array.from(eventStories.keys()).map((k) => [k, false])),
          favorStudents: Object.fromEntries(Array.from(students.keys()).map((k) => [k, false])),
          memorialStudents: Object.fromEntries(Array.from(students.keys()).map((k) => [k, false])),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };
    void fetchData();
  }, [locale, t, fetchStudents, allBgm]);

  // --- Active filters (used in filtering effect and render) ---
  const activeFilters = useMemo(
    () => ({
      general: Object.entries(spoilerFilters.general)
        .filter(([, v]) => v)
        .map(([k]) => k),
      mainStories: Object.keys(spoilerFilters.mainStories).filter((k) => spoilerFilters.mainStories[k]),
      eventStories: Object.keys(spoilerFilters.eventStories).filter((k) => spoilerFilters.eventStories[k]),
      favorStudents: Object.keys(spoilerFilters.favorStudents).filter((k) => spoilerFilters.favorStudents[k]),
      memorialStudents: Object.keys(spoilerFilters.memorialStudents).filter((k) => spoilerFilters.memorialStudents[k]),
    }),
    [spoilerFilters],
  );

  const hasAnyActiveFilter = useMemo(() => Object.values(activeFilters).some((arr) => arr.length > 0), [activeFilters]);

  // --- Filtering Effect ---
  useEffect(() => {
    if (isLoading || error) return;
    const { general, mainStories, eventStories, favorStudents, memorialStudents } = activeFilters;
    let results: BgmEntry[] = [];

    if ([...general, ...mainStories, ...eventStories, ...favorStudents, ...memorialStudents].length > 0) {
      results = allBgm.filter((bgm) =>
        bgm.xref.some((xref) => {
          if (xref.type === 'Favor_Story' && xref.title && favorStudents.includes(String(xref.title))) return true;
          if (xref.type === 'Memorial' && xref.title && memorialStudents.includes(String(xref.title))) return true;
          if ((xref.type === 'raid' || xref.type === 'limitraid') && general.includes('Raid')) return true;
          if (xref.type === 'UI' && general.includes('Other')) return true;
          if ((xref.type === 'main_work' || xref.type === 'event_work') && general.includes('Work')) return true;
          if (xref.type === 'Main_Story' && xref.title && mainStories.includes(String(xref.title))) return true;
          if (xref.type === 'Event_Story' && xref.title && eventStories.includes(String(xref.title))) return true;
          if (xref.type === 'Group_Story' && general.includes('GroupStory')) return true;
          if (xref.type === 'Mini_Story' && general.includes('MiniStory')) return true;
          if (xref.type === 'Work_Story' && general.includes('WorkStory')) return true;
          return false;
        }),
      );
    }

    if (searchTerm) {
      results = results.filter((bgm) => matcher(bgm.id, searchTerm) || (bgm.title ? matcher(bgm.title, searchTerm) : false) || (bgm.composer ? matcher(bgm.composer, searchTerm) : false));
    }

    results.sort((a, b) => (sortOrder === 'ascending' ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id)));
    setFilteredBgm(results);
  }, [searchTerm, activeFilters, allBgm, isLoading, error, sortOrder, matcher]);

  // --- Scroll ---
  const bgmListContainerRef = useRef<HTMLDivElement>(null);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const scrollToBgm = useCallback((bgmId: string) => {
    const element = document.getElementById(`bgm-item-${bgmId}`);
    const container = bgmListContainerRef.current;
    if (!element || !container) return;

    // 1. Scroll inner container to put element at top
    const elementTop = element.getBoundingClientRect().top;
    const containerTop = container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + (elementTop - containerTop) - 10, behavior: 'smooth' });

    // 2. If container is outside viewport, scroll page to show it (accounting for sticky bar)
    const stickyBottom = stickyBarRef.current?.getBoundingClientRect().bottom ?? 100;
    const rect = container.getBoundingClientRect();
    const isContainerVisible = rect.top >= stickyBottom && rect.top <= window.innerHeight;
    if (!isContainerVisible) {
      window.scrollTo({ top: window.scrollY + rect.top - stickyBottom, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (isAutoScrollEnabled && currentSong) scrollToBgm(currentSong.id);
  }, [currentSong, isAutoScrollEnabled, scrollToBgm]);

  // --- Playback ---
  const playNextRandomSong = useCallback(() => {
    if (filteredBgm.length === 0) return;
    let idx: number;
    do {
      idx = Math.floor(Math.random() * filteredBgm.length);
    } while (filteredBgm.length > 1 && (filteredBgm[idx].id === currentSong?.id || !filteredBgm[idx].youtube_url));
    setCurrentSong(filteredBgm[idx]);
  }, [filteredBgm, currentSong?.id]);

  const playNextRef = useRef(playNextRandomSong);
  useEffect(() => {
    playNextRef.current = playNextRandomSong;
  }, [playNextRandomSong]);

  const stableOnSongEnd = useCallback(
    (player: YTPlayer | null) => {
      if (playbackMode === 'autoplay') playNextRef.current();
      else if (playbackMode === 'repeat' && player) {
        player.seekTo(0);
        player.playVideo();
      }
    },
    [playbackMode],
  );

  // Load YouTube API once
  useEffect(() => {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const first = document.getElementsByTagName('script')[0];
    first.parentNode?.insertBefore(tag, first);
  }, []);

  // Escape closes drawer
  useEffect(() => {
    if (!isFilterDrawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterDrawerOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFilterDrawerOpen]);

  // --- Handlers ---
  const handleFilterToggle = useCallback((type: keyof typeof spoilerFilters, key: string) => setSpoilerFilters((p) => ({ ...p, [type]: { ...p[type], [key]: !p[type][key] } })), []);

  const handleClearCategory = useCallback(
    (type: 'general' | 'mainStories' | 'eventStories' | 'favorStudents' | 'memorialStudents') =>
      setSpoilerFilters((p) => ({
        ...p,
        [type]: Object.fromEntries(Object.keys(p[type]).map((k) => [k, false])),
      })),
    [],
  );

  const handleSelectAllCategory = useCallback(
    (type: 'mainStories' | 'eventStories' | 'favorStudents' | 'memorialStudents') => {
      setSpoilerFilters((p) => {
        let allIds: string[] = [];
        if (type === 'mainStories') allIds = mainStoryList.map(([id]) => id);
        if (type === 'eventStories') allIds = eventStoryList.map(([id]) => id);
        if (type === 'favorStudents' || type === 'memorialStudents') allIds = studentFilterList.map(([id]) => id);

        return {
          ...p,
          [type]: Object.fromEntries(allIds.map((id) => [id, true])),
        };
      });
    },
    [mainStoryList, eventStoryList, studentFilterList],
  );

  const allGeneralSelected = useMemo(() => Object.keys(GENERAL_CATEGORIES).length > 0 && Object.keys(GENERAL_CATEGORIES).every((k) => spoilerFilters.general[k]), [spoilerFilters.general]);

  const allStoriesSelected = useMemo(() => {
    const mainLen = mainStoryList.length;
    const eventLen = eventStoryList.length;
    const studentLen = studentFilterList.length;

    if (mainLen === 0 && eventLen === 0 && studentLen === 0) return false;

    return (
      activeFilters.mainStories.length === mainLen &&
      activeFilters.eventStories.length === eventLen &&
      activeFilters.favorStudents.length === studentLen &&
      activeFilters.memorialStudents.length === studentLen
    );
  }, [activeFilters, mainStoryList, eventStoryList, studentFilterList]);

  const isAllSelected = allGeneralSelected && allStoriesSelected;

  // Integrated master toggle handler
  const handleToggleAll = useCallback(() => {
    // Turn off (false) if all are selected, turn all on (true) if any are missing
    const turnOn = !isAllSelected;

    setSpoilerFilters((p) => {
      // 1. Batch application logic for general category
      const newGeneral = Object.fromEntries(Object.keys(p.general).map((k) => [k, turnOn]));

      // 2. When deselecting (turnOn === false)
      if (!turnOn) {
        return {
          ...p,
          general: newGeneral,
          mainStories: Object.fromEntries(Object.keys(p.mainStories).map((k) => [k, false])),
          eventStories: Object.fromEntries(Object.keys(p.eventStories).map((k) => [k, false])),
          favorStudents: Object.fromEntries(Object.keys(p.favorStudents).map((k) => [k, false])),
          memorialStudents: Object.fromEntries(Object.keys(p.memorialStudents).map((k) => [k, false])),
        };
      }

      // 3. When selecting all (turnOn === true)
      return {
        ...p,
        general: newGeneral,
        mainStories: Object.fromEntries(mainStoryList.map(([id]) => [id, true])),
        eventStories: Object.fromEntries(eventStoryList.map(([id]) => [id, true])),
        favorStudents: Object.fromEntries(studentFilterList.map(([id]) => [id, true])),
        memorialStudents: Object.fromEntries(studentFilterList.map(([id]) => [id, true])),
      };
    });
  }, [isAllSelected, mainStoryList, eventStoryList, studentFilterList]);

  const handleToggleDetails = useCallback((bgmId: string) => setExpandedBgmIds((prev) => ({ ...prev, [bgmId]: !prev[bgmId] })), []);

  const handleToggleAllDetails = () => {
    const allAreExpanded = filteredBgm.length > 0 && filteredBgm.every((bgm) => expandedBgmIds[bgm.id]);
    startTransition(() => {
      if (allAreExpanded) setExpandedBgmIds({});
      else setExpandedBgmIds(Object.fromEntries(filteredBgm.map((bgm) => [bgm.id, true])));
    });
  };

  // --- xref helpers ---
  const isXrefMatchingActive = useCallback(
    (xref: XrefEntry): boolean => {
      const { general, mainStories, eventStories, favorStudents, memorialStudents } = activeFilters;
      if (xref.type === 'Favor_Story' && favorStudents.includes(String(xref.title))) return true;
      if (xref.type === 'Memorial' && memorialStudents.includes(String(xref.title))) return true;
      if (xref.type === 'UI' && general.includes('Other')) return true;
      if ((xref.type === 'raid' || xref.type === 'limitraid') && general.includes('Raid')) return true;
      if ((xref.type === 'main_work' || xref.type === 'event_work') && general.includes('Work')) return true;
      if (xref.type === 'Main_Story' && mainStories.includes(String(xref.title))) return true;
      if (xref.type === 'Event_Story' && eventStories.includes(String(xref.title))) return true;
      if (xref.type === 'Group_Story' && general.includes('GroupStory')) return true;
      if (xref.type === 'Mini_Story' && general.includes('MiniStory')) return true;
      if (xref.type === 'Work_Story' && general.includes('WorkStory')) return true;
      return false;
    },
    [activeFilters],
  );

  const renderXrefLine = useCallback(
    (xref: XrefEntry, bgm: BgmEntry): string => {
      const name_title = getLocalizedTextArr(xref.name, locale as Language) || getLocalizedTextArr(xref.name, 'ko') || getLocalizedTextArr(xref.name, 'en');
      let name = Array.isArray(name_title) ? (showStoryNames ? name_title.join(' - ') : name_title[0] || '') : name_title;

      const episodeString = xref.episode ? t('meta.episode', { x: xref.episode }) : '';
      const getPrefix = (key: keyof typeof XREF_PREFIXES): string => t(XREF_PREFIXES[key] || key, '');

      if (xref.type === 'Favor_Story' || xref.type === 'Memorial') {
        if (episodeString && showStoryNames) name = `${t('meta.rank')} ${xref.episode} - ${name}`;
        else if (episodeString) name = `${t('meta.rank')} ${xref.episode}`;
      }

      const localeMap: Record<string, 'En' | 'Jp' | 'Kr' | 'Tw'> = { en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' };

      switch (xref.type) {
        case 'Main_Story': {
          const key = String(xref.title);
          const title = mainStoryChapters[key] ? t(`main_story.${mainStoryChapters[key].key}`, key) : key;
          return `${getPrefix('Main_Story')} ${title} ${name}`;
        }
        case 'Event_Story': {
          const eventName = (!Number.isNaN(Number(xref.title)) && eventData[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.[localeMap[locale]]) || xref.title?.toString();
          return `${getPrefix('Event_Story')} ${eventName} ${name}`;
        }
        case 'Favor_Story':
        case 'Memorial': {
          const sid = xref.title || bgm.xref.find((x) => x.type === 'Favor_Story')?.title;
          return `${getPrefix(xref.type)} ${sid !== null && sid !== undefined ? studentData[String(sid)]?.Name || '' : ''} ${name}`;
        }
        case 'event_work':
        case 'main_work':
          return `${getPrefix('Work')} ${name}`;
        case 'UI':
          return `${getPrefix('UI')} ${name}`;
        case 'raid':
          return `${getPrefix('raid')} ${xref.title}`;
        case 'limitraid':
          return `${getPrefix('limitraid')} ${xref.title}`;
        case 'Group_Story': {
          const gt = xref.title && String(xref.title) in otherStoryData.Group_Story ? t_club(otherStoryData.Group_Story[String(xref.title) as keyof typeof otherStoryData.Group_Story], language) : '';
          return `${getPrefix('Group_Story')} ${gt} - ${name}`;
        }
        case 'Mini_Story': {
          const mt = xref.title ? getLocalizedText(otherStoryData.Mini_Story[String(xref.title) as keyof typeof otherStoryData.Mini_Story], language) : '';
          return `${getPrefix('Mini_Story')} ${mt} ${name}`;
        }
        case 'Work_Story':
          return `${getPrefix('Work_Story')} ${name}`;
        default:
          return name.trim() || `${xref.title}`;
      }
    },
    [locale, language, showStoryNames, t, t_club, eventData, studentData, otherStoryData],
  );

  // --- Filter chip label helpers ---
  const chipClass =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 text-xs font-medium';
  const chipX = 'hover:text-blue-900 dark:hover:text-blue-100 ml-0.5 leading-none';

  // --- Render ---
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-sans">
      <style>{`@keyframes wave{0%,100%{transform:scaleY(0.8)}50%{transform:scaleY(1)}} @keyframes drawer-up{from{transform:translateY(100%)}to{transform:translateY(0)}} .drawer-up{animation:drawer-up 0.28s cubic-bezier(0.32,0.72,0,1) forwards}`}</style>

      {/* ── Sticky top bar: search + category chips ── */}
      <div ref={stickyBarRef} className="sticky top-14 z-20 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-700/60">
        <div className="px-2 sm:px-4 lg:px-8 py-2 flex flex-col gap-2">
          {/* Search row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                placeholder={t('search.placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Mobile: story filter button */}
            <button
              onClick={() => setFilterDrawerOpen(true)}
              className="md:hidden relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-600 dark:text-neutral-300 hover:border-blue-400 transition-colors shrink-0"
            >
              <FilterIcon />
              <span className="text-xs font-medium">{t('filter_title')}</span>
              {hasAnyActiveFilter && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-neutral-50 dark:border-neutral-900" />}
            </button>

            {/* Sort button (sm+) */}
            <button
              onClick={() => setSortOrder((p) => (p === 'ascending' ? 'descending' : 'ascending'))}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-sky-400 transition-colors shrink-0"
            >
              {sortOrder === 'ascending' ? <FaSortAmountDown className="h-3.5 w-3.5" /> : <FaSortAmountUp className="h-3.5 w-3.5" />}
              <span className="text-xs font-medium">{sortOrder === 'ascending' ? t('meta.sort_ascending') : t('meta.sort_descending')}</span>
            </button>
          </div>

          {/* Category chips + random play */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {/* Integrated Master Button: Select/Deselect all General + Story */}
            <button
              onClick={handleToggleAll}
              className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border transition-all duration-150 ${
                isAllSelected
                  ? 'bg-sky-500 border-sky-500 text-white shadow-sm'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-sky-400 dark:hover:border-sky-500'
              }`}
            >
              {isAllSelected ? t_ui('deselectAll') : t_ui('selectAll')}
            </button>

            <button
              // {filteredBgm.length > 0 && filteredBgm.every((bgm) => expandedBgmIds[bgm.id]) ? t('actions.hide_all_details') : t('actions.view_all_details')}

              onClick={handleToggleAllDetails}
              disabled={filteredBgm.length === 0}
              className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border transition-all duration-150 ${
                filteredBgm.length > 0 && filteredBgm.every((bgm) => expandedBgmIds[bgm.id])
                  ? 'bg-sky-500 border-sky-500 text-white shadow-sm'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-sky-400 dark:hover:border-sky-500'
              }`}
            >
              {filteredBgm.length > 0 && filteredBgm.every((bgm) => expandedBgmIds[bgm.id]) ? t('actions.hide_all_details') : t('actions.view_all_details')}
            </button>

            {(Object.keys(GENERAL_CATEGORIES) as Array<keyof typeof GENERAL_CATEGORIES>).map((key) => (
              <button
                key={key}
                onClick={() => handleFilterToggle('general', key)}
                className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition-all duration-150 ${
                  spoilerFilters.general[key]
                    ? 'bg-sky-500 border-sky-500 text-white shadow-sm'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-sky-400 dark:hover:border-sky-500'
                }`}
              >
                {t(GENERAL_CATEGORIES[key], '')}
              </button>
            ))}
            <button
              onClick={playNextRandomSong}
              disabled={filteredBgm.length === 0}
              className="shrink-0 ml-1 text-xs font-semibold px-3 py-1 rounded-full bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('playback.play_random')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-7xl mx-auto py-4 pb-24 md:pb-8 px-2 sm:px-4 lg:px-8">
        <PageHeader title={t('title')} description={t('description')} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ── Story filter sidebar (desktop only) ── */}
          <aside className="hidden md:block md:col-span-1 self-start sticky top-22">
            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 shadow-sm">
              <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-4">{t('filter_title')}</h2>
              <StoryFilters
                mainStoryList={mainStoryList}
                eventStoryList={eventStoryList}
                studentFilterList={studentFilterList}
                spoilerFilters={spoilerFilters}
                activeFilters={activeFilters}
                sectionSearch={sectionSearch}
                setSectionSearch={setSectionSearch}
                handleFilterToggle={handleFilterToggle}
                handleClearCategory={handleClearCategory}
                handleSelectAllCategory={handleSelectAllCategory}
                showStoryNames={showStoryNames}
                setShowStoryNames={setShowStoryNames}
                isAutoScrollEnabled={isAutoScrollEnabled}
                setAutoScrollEnabled={setAutoScrollEnabled}
                playbackMode={playbackMode}
                setPlaybackMode={setPlaybackMode}
                t={t}
                matcher={matcher}
              />
            </div>
          </aside>

          {/* ── BGM list ── */}
          <section className="col-span-1 md:col-span-2">
            {/* Active filter chips */}
            {hasAnyActiveFilter && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {activeFilters.general.map((k) => (
                  <span key={k} className={chipClass}>
                    {t(GENERAL_CATEGORIES[k as keyof typeof GENERAL_CATEGORIES], '')}
                    <button onClick={() => handleFilterToggle('general', k)} className={chipX}>
                      ×
                    </button>
                  </span>
                ))}
                {activeFilters.mainStories.length > 0 && (
                  <span className={chipClass}>
                    {t('selection.main_story')} ({activeFilters.mainStories.length})
                    <button onClick={() => handleClearCategory('mainStories')} className={chipX}>
                      ×
                    </button>
                  </span>
                )}
                {activeFilters.eventStories.length > 0 && (
                  <span className={chipClass}>
                    {t('selection.event_story')} ({activeFilters.eventStories.length})
                    <button onClick={() => handleClearCategory('eventStories')} className={chipX}>
                      ×
                    </button>
                  </span>
                )}
                {activeFilters.favorStudents.length > 0 && (
                  <span className={chipClass}>
                    {t('selection.favor_story')} ({activeFilters.favorStudents.length})
                    <button onClick={() => handleClearCategory('favorStudents')} className={chipX}>
                      ×
                    </button>
                  </span>
                )}
                {activeFilters.memorialStudents.length > 0 && (
                  <span className={chipClass}>
                    {t('selection.memorial')} ({activeFilters.memorialStudents.length})
                    <button onClick={() => handleClearCategory('memorialStudents')} className={chipX}>
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}

            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 sm:rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-700/60">
                <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t('meta.bgm_list_title')}</span>
                <div className="flex items-center gap-2">
                  {filteredBgm.length > 0 && <span className="text-xs text-neutral-400">{filteredBgm.length} tracks</span>}
                  {/* Sort (mobile only — sm+ is in top bar) */}
                  <button
                    onClick={() => setSortOrder((p) => (p === 'ascending' ? 'descending' : 'ascending'))}
                    className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-sky-400 transition-colors"
                  >
                    {sortOrder === 'ascending' ? <FaSortAmountDown className="h-3 w-3" /> : <FaSortAmountUp className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              <div ref={bgmListContainerRef} className="max-h-[80vh] mx-2 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-neutral-500">{t_ui('loading')}</p>
                  </div>
                ) : error ? (
                  <p className="text-center text-red-500 py-12 text-sm">
                    {t('status.error')}: {error}
                  </p>
                ) : filteredBgm.length > 0 ? (
                  filteredBgm.map((bgm) => (
                    <BgmItem
                      key={bgm.id}
                      bgm={bgm}
                      isExpanded={expandedBgmIds[bgm.id]}
                      isPlaying={currentSong?.id === bgm.id}
                      hasAnyActiveFilter={hasAnyActiveFilter}
                      isXrefMatchingActive={isXrefMatchingActive}
                      renderXrefLine={renderXrefLine}
                      onSelect={setCurrentSong}
                      onToggleDetails={handleToggleDetails}
                    />
                  ))
                ) : (
                  <p className="text-center text-neutral-400 dark:text-neutral-500 py-12 text-sm">{t('search.no_results')}</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Mobile story filter drawer ── */}
      {isFilterDrawerOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setFilterDrawerOpen(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] flex flex-col bg-white dark:bg-neutral-900 rounded-t-2xl border-t border-neutral-200 dark:border-neutral-700 shadow-2xl drawer-up">
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">{t('filter_title')}</h2>
              <button onClick={() => setFilterDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* <div className="overflow-y-auto flex-1 p-4 pb-8"> */}
            <div className={`overflow-y-auto flex-1 p-4 ${currentSong ? 'pb-16' : 'pb-4'}`}>
              <StoryFilters
                mainStoryList={mainStoryList}
                eventStoryList={eventStoryList}
                studentFilterList={studentFilterList}
                spoilerFilters={spoilerFilters}
                activeFilters={activeFilters}
                sectionSearch={sectionSearch}
                setSectionSearch={setSectionSearch}
                handleFilterToggle={handleFilterToggle}
                handleClearCategory={handleClearCategory}
                handleSelectAllCategory={handleSelectAllCategory}
                showStoryNames={showStoryNames}
                setShowStoryNames={setShowStoryNames}
                isAutoScrollEnabled={isAutoScrollEnabled}
                setAutoScrollEnabled={setAutoScrollEnabled}
                playbackMode={playbackMode}
                setPlaybackMode={setPlaybackMode}
                t={t}
                matcher={matcher}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Fixed bottom player ── */}
      <Player song={currentSong} onClose={() => setCurrentSong(null)} onSongEnd={stableOnSongEnd} onTitleClick={scrollToBgm} onNextSong={playNextRandomSong} />
    </div>
  );
}
