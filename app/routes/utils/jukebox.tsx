import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import eventList from '~/data/jp/eventList.json';
import { useDataCache } from '~/utils/cache';
import type { Student } from '~/types/data';
// import bgmData from '~/data/jp/bgm_database_combined.json'
import { AutoplayIcon, eventConvertor, FilterIcon, GENERAL_CATEGORIES, mainStoryChapters, otherStoryTitles, RepeatIcon, StopIcon, XREF_PREFIXES, type OtherStoryData } from './jukeboxMetadata';
import { data } from 'react-router';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import RubyText from '~/components/RubyText';
import { FaSortAmountUp, FaSortAmountDown } from 'react-icons/fa';
import type { Route } from './+types/jukebox';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { FilterModal, StudentFilterModal } from '~/components/jukebox/filterModal';

const PlayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
);

const SoundWaveIcon = () => (
    <div className="flex items-center justify-center w-8 h-8 space-x-1">
        <span className="w-1 h-3 bg-current animate-[wave_1s_ease-in-out_infinite] delay-[-0.4s]"></span>
        <span className="w-1 h-5 bg-current animate-[wave_1s_ease-in-out_infinite] delay-[-0.2s]"></span>
        <span className="w-1 h-2 bg-current animate-[wave_1s_ease-in-out_infinite]"></span>
    </div>
);

// const SortAscIcon = () => (
//     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
//         <path d="M3 3a1 1 0 000 2h14a1 1 0 100-2H3zM3 7a1 1 0 000 2h14a1 1 0 100-2H3zM3 11a1 1 0 100 2h14a1 1 0 100-2H3zM3 15a1 1 0 100 2h14a1 1 0 100-2H3z" />
//         <path fillRule="evenodd" d="M10 18a.5.5 0 01-.5-.5v-6.793l-1.646 1.647a.5.5 0 01-.708-.708l2.5-2.5a.5.5 0 01.708 0l2.5 2.5a.5.5 0 01-.708.708L10.5 10.707V17.5a.5.5 0 01-.5.5z" clipRule="evenodd" />
//     </svg>
// );
// const SortDescIcon = () => (
//      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
//         <path d="M3 3a1 1 0 000 2h14a1 1 0 100-2H3zM3 7a1 1 0 000 2h14a1 1 0 100-2H3zM3 11a1 1 0 100 2h14a1 1 0 100-2H3zM3 15a1 1 0 100 2h14a1 1 0 100-2H3z" />
//         <path fillRule="evenodd" d="M10 5a.5.5 0 01.5.5v6.793l1.646-1.647a.5.5 0 01.708.708l-2.5 2.5a.5.5 0 01-.708 0l-2.5-2.5a.5.5 0 11.708-.708L9.5 12.207V5.5A.5.5 0 0110 5z" clipRule="evenodd" />
//     </svg>
// );


// --- TYPE DEFINITIONS ---
type Language = 'en' | 'jp' | 'ko' | 'tw';

interface LocalizedName {
    ja?: string | string[] | null;
    ko?: string | string[] | null;
    en?: string | string[] | null;
    tw?: string | string[] | null;
}


// --- YouTube IFrame API TYPE DECLARATION ---
declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

// --- HELPER FUNCTIONS ---
const getYouTubeId = (url: string): string | null => url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2] || null;
const getLocalizedText = (obj: any, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string => obj?.[lang] || obj?.[fallbackKey] || obj?.['Name'] || '';
const getLocalizedTextArr = (obj: any, lang: Language, fallbackKey: keyof LocalizedName = 'ja'): string | string[] => obj?.[lang] || obj?.[fallbackKey] || obj?.['Name'] || '';


interface PlayerProps {
    song: any | null; // Typed as any to match BGM type shorthand
    onClose: () => void;
    onSongEnd: (player: any) => void;
    onTitleClick: (id: string) => void; // New Prop
}

const Player: React.FC<PlayerProps> = React.memo(({ song, onClose, onSongEnd, onTitleClick }) => {
    const playerRef = useRef<any>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    // useTranslation inside component if needed for tooltips, but song data is passed in

    useEffect(() => {
        const videoId = song?.youtube_url ? getYouTubeId(song.youtube_url) : null;
        if (!videoId) {
            if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
            return;
        }

        const initPlayer = () => {
            if (playerRef.current) playerRef.current.destroy();
            playerRef.current = new window.YT.Player('youtube-player', {
                videoId, height: '100%', width: '100%', playerVars: { autoplay: 1, controls: 1 },
                events: {
                    onStateChange: (e: any) => {
                        if (e.data === window.YT.PlayerState.ENDED) {
                            onSongEnd(e.target);
                        }
                    }
                }
            });
        };

        if (window.YT?.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
        }
    }, [song, onSongEnd]);

    if (!song) return null;

    return (
        <div className={`fixed bottom-4 right-4 w-10/12 max-w-sm transition-transform duration-300 ease-in-out z-50 ${isMinimized ? 'translate-x-[calc(100%-20px)]' : 'translate-x-0'}`}>
            <div className="relative bg-white/80 dark:bg-neutral-800/80 backdrop-blur-md rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
                <button
                    onClick={() => { setIsMinimized(!isMinimized) }}
                    className="absolute z-10 top-1/2 -translate-y-1/2 left-0 w-8 h-full flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                >
                    {isMinimized ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    )}
                </button>

                <div className={`pl-8 p-4 transition-opacity duration-300 ${isMinimized ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center mb-3">
                        {/* Title Clickable Area */}
                        <div
                            className="cursor-pointer group"
                            onClick={() => onTitleClick(song.id)}
                            title="Click to locate in list"
                        >
                            <h3 className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400 truncate group-hover:underline">
                                {song.title ? song.title : `BGM ${song.id}`}
                            </h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                                {`${Number(song.id) < 10000 ? '#' + song.id : ''} ${song.composer?.split('/').map((v: string) => '#' + v.replace(/\s/gi, '_')).join(' ') || ''}`}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="aspect-w-16 aspect-h-9 rounded-md overflow-hidden bg-black/70 dark:bg-black/90">
                        <div id="youtube-player"></div>
                    </div>
                </div>
            </div>
        </div>
    );
});


export async function loader({ context }: Route.LoaderArgs) {
    let i18n = getInstance(context);
    const locale = i18n.language as Locale

    return data({ locale, site_title: i18n.t("home:title"), title: i18n.t("jukebox:title"), description: i18n.t("jukebox:description") });
}

// export const meta: MetaFunction<typeof rootLorder, {
//     "root": typeof rootLorder,
// }> = ({ matches, params }) => {
//     matches.find(m => m.id)
//     const rootMatch = matches.find(m => m.id === "root");
//     const locale_data = rootMatch ? rootMatch.loaderData : null;
//     const locale = locale_data ? locale_data.locale : DEFAULT_LOCALE;

//     const t = i18n.getFixedT(locale, undefined, 'home');

export function meta({ loaderData }: Route.MetaArgs) {

    const language = { ja: 'jp', ko: 'ko', en: 'en', 'zh-Hant': 'zh_Hant' }[loaderData.locale] as Language

    return createMetaDescriptor(
        getLocalizedText(loaderData.title, language) + ' | ' + loaderData.site_title,
        getLocalizedText(loaderData.description, language),
        "/img/j.webp"
    )
}
export const handle: AppHandle = {
    preload: (data) => {
        //   const { eventId } = useLoaderData<typeof rootLorder>().params
        return [
            {
                rel: 'preload',
                href: cdn(`/w/${getLocaleShortName(data?.locale)}.students.bin`),
                as: 'fetch',
                crossOrigin: 'anonymous',
            },
            {
                rel: 'preload',
                href: cdn(`/w/students_portrait.json`),
                as: 'fetch',
                crossOrigin: 'anonymous',
            },
            ...createLinkHreflang(`/utils/jukebox`)
        ]
    }
}

export default function JukeboxPage() {
    const { t, i18n } = useTranslation("jukebox");
    const { t:t_club } = useTranslation("club");
    const locale = i18n.language as Locale;
    const language = { ja: 'jp', ko: 'ko', en: 'en', 'zh-Hant': 'zh_Hant' }[locale] as Language || 'jp';

    // State Hooks
    const [allBgm, setAllBgm] = useState<any[]>([]);
    // const allBgms = useMemo(() => bgmData.sort((a, b) => Number(a.id) - Number(b.id)), []);
    const [studentData, setStudentData] = useState<Record<string, Student>>({});
    const [eventData, setEventData] = useState<any>({});
    const [filteredBgm, setFilteredBgm] = useState<any[]>([]);
    const [currentSong, setCurrentSong] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [otherStoryData, _setOtherStoryData] = useState<OtherStoryData>(otherStoryTitles);

    const [searchTerm, setSearchTerm] = useState<string>('');
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

    const [isMainStoryModalOpen, setMainStoryModalOpen] = useState<boolean>(false);
    const [isEventStoryModalOpen, setEventStoryModalOpen] = useState<boolean>(false);
    const [isFavorStudentModalOpen, setFavorStudentModalOpen] = useState<boolean>(false);
    const [isMemorialStudentModalOpen, setMemorialStudentModalOpen] = useState<boolean>(false);

    const [expandedBgmIds, setExpandedBgmIds] = useState<Record<string, boolean>>({});
    const [playbackMode, setPlaybackMode] = useState<'autoplay' | 'repeat' | 'off'>('autoplay');
    const [showStoryNames, setShowStoryNames] = useState<boolean>(false);
    const [sortOrder, setSortOrder] = useState<'ascending' | 'descending'>('ascending');

    // Auto-Scroll State
    const [isAutoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);

    const filterPanelRef = useRef<HTMLDivElement>(null);
    const fetchStudents = useDataCache<Record<string, Student>>();

    useEffect(()=>{
        fetch(cdn('/w/bgm_database_combined.json')).then(res=>res.json()).then((bgmData: any)=>{
            setAllBgm(
                bgmData.sort((a: { id: any; }, b: { id: any; }) => Number(a.id) - Number(b.id))
            )
        })
    }, [setAllBgm]);

    // --- Fetch Data Effect ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                // In a real app, define proper types for fetchStudents
                const studentsRes = await fetchStudents(cdn(`/w/${getLocaleShortName(locale)}.students.bin`), res => res.json() as Promise<Record<string, Student>>);

                const studentJson = studentsRes || {};
                const eventJson: any = eventList;
                setStudentData(studentJson);
                setEventData(eventJson);

                const mainStories = new Map<keyof typeof mainStoryChapters, string>();
                const eventStories = new Map<string, string>();
                const students = new Map<string, Student>();

                allBgm.forEach((bgm: any) => bgm.xref.forEach((xref: any) => {
                    if (xref.type === 'Main_Story' && xref.title) {
                        const titleKey = String(xref.title) as keyof typeof mainStoryChapters;
                        if (mainStoryChapters[titleKey]) {
                            // Use main_story keys from JSON
                            mainStories.set(titleKey, t(`main_story.${mainStoryChapters[titleKey].key}`));
                        } else {
                            mainStories.set(titleKey, titleKey);
                        }
                    }
                    if (xref.type === 'Event_Story' && xref.title) {
                        eventStories.set(
                            String(xref.title),
                            (!Number.isNaN(Number(xref.title)) ? eventJson[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.[{ en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' }[locale] as 'En' | 'Jp' | 'Kr'] : '') || (Number(xref.title) ? eventJson[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.Jp : '') || xref.title.toString()
                        );
                    }
                    if ((xref.type === 'Favor_Story' || xref.type === 'Memorial') && xref.title) {
                        const studentId = String(xref.title);
                        if (studentJson[studentId] && !students.has(studentId)) {
                            students.set(studentId, studentJson[studentId]);
                        }
                    }
                }));

                setEventStoryList(Array.from(eventStories.entries()).sort((a, b) => (Number(isNaN(Number(a[0]))) - Number(isNaN(Number(b[0])))) || (Number(b[0]) - Number(a[0]))))
                setStudentFilterList(Array.from(students.entries()).sort((a, b) => a[1].Name.localeCompare(b[1].Name)));
                setMainStoryList(Array.from(mainStories.entries()).sort((a, b) => - Number(new Date(mainStoryChapters[a[0] as any]?.date || 0)) + Number(new Date(mainStoryChapters[b[0] as any]?.date || 0))));

                // Initial Filters
                setSpoilerFilters(prev => ({
                    ...prev,
                    general: Object.fromEntries(Object.keys(GENERAL_CATEGORIES).map(k => [k, false])),
                    mainStories: Object.fromEntries(Array.from(mainStories.keys()).map(k => [k, false])),
                    eventStories: Object.fromEntries(Array.from(eventStories.keys()).map(k => [k, false])),
                    favorStudents: Object.fromEntries(Array.from(students.keys()).map(k => [k, false])),
                    memorialStudents: Object.fromEntries(Array.from(students.keys()).map(k => [k, false])),
                }));

            } catch (err) {
                console.error(err)
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [locale, t, fetchStudents, allBgm]);


    // --- Filtering Logic Effect ---
    useEffect(() => {
        if (!isLoading && !error) {
            const activeGeneral = Object.entries(spoilerFilters.general).filter(([, v]) => v).map(([k]) => k);
            const activeMain = Object.keys(spoilerFilters.mainStories).filter(k => spoilerFilters.mainStories[k]);
            const activeEvents = Object.keys(spoilerFilters.eventStories).filter(k => spoilerFilters.eventStories[k]);
            const activeFavorStudents = Object.keys(spoilerFilters.favorStudents).filter(k => spoilerFilters.favorStudents[k]);
            const activeMemorialStudents = Object.keys(spoilerFilters.memorialStudents).filter(k => spoilerFilters.memorialStudents[k]);

            let results: any[] = [];
            // Only filter if at least one filter is active
            if ([...activeGeneral, ...activeMain, ...activeEvents, ...activeFavorStudents, ...activeMemorialStudents].length > 0) {
                results = allBgm.filter((bgm: any) => bgm.xref.some((xref: any) => {
                    if (xref.type === 'Favor_Story' && xref.title && activeFavorStudents.includes(String(xref.title))) return true;
                    if (xref.type === 'Memorial' && xref.title && activeMemorialStudents.includes(String(xref.title))) return true;
                    if ((xref.type === 'raid' || xref.type === 'limitraid') && activeGeneral.includes('Raid')) return true;
                    if ((xref.type === 'UI') && activeGeneral.includes('Other')) return true;
                    if ((xref.type === 'main_work' || xref.type === 'event_work') && activeGeneral.includes('Work')) return true;
                    if (xref.type === 'Main_Story' && xref.title && activeMain.includes(String(xref.title))) return true;
                    if (xref.type === 'Event_Story' && xref.title && activeEvents.includes(String(xref.title))) return true;
                    if (xref.type === 'Group_Story' && activeGeneral.includes('GroupStory')) return true;
                    if (xref.type === 'Mini_Story' && activeGeneral.includes('MiniStory')) return true;
                    if ((xref.type === 'Work_Story') && activeGeneral.includes('WorkStory')) return true;
                    return false;
                }));
            }

            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                results = results.filter((bgm: any) =>
                    bgm.id.includes(lowerSearchTerm) ||
                    bgm.title?.toLowerCase().includes(lowerSearchTerm) ||
                    bgm.composer?.toLowerCase().includes(lowerSearchTerm)
                );
            }

            results.sort((a, b) => {
                const idA = Number(a.id);
                const idB = Number(b.id);
                return sortOrder === 'ascending' ? idA - idB : idB - idA;
            });
            setFilteredBgm(results);
        }
    }, [searchTerm, spoilerFilters, allBgm, isLoading, error, sortOrder]);


    // --- Scroll Logic ---
    const scrollToBgm = useCallback((bgmId: string) => {
        const element = document.getElementById(`bgm-item-${bgmId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    useEffect(() => {
        if (isAutoScrollEnabled && currentSong) {
            scrollToBgm(currentSong.id);
        }
    }, [currentSong, isAutoScrollEnabled, scrollToBgm]);


    // --- Playback Handlers ---
    const playNextRandomSong = useCallback(() => {
        if (filteredBgm.length === 0) return;
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * filteredBgm.length);
        } while (filteredBgm.length > 1 && filteredBgm[nextIndex].id === currentSong?.id);
        setCurrentSong(filteredBgm[nextIndex]);
    }, [filteredBgm, currentSong?.id]);

    const playNextRef = useRef(playNextRandomSong);
    useEffect(() => { playNextRef.current = playNextRandomSong; }, [playNextRandomSong]);

    const stableOnSongEnd = useCallback((player: any) => {
        if (playbackMode === 'autoplay') playNextRef.current();
        else if (playbackMode === 'repeat' && player) {
            player.seekTo(0);
            player.playVideo();
        }
    }, [playbackMode]);

    useEffect(() => {
        if (window.YT) return;
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }, []);



    // --- Global Filter Toggle ---
    const handleToggleGlobalAll = () => {
        const allCategories = ['general', 'mainStories', 'eventStories', 'favorStudents', 'memorialStudents'] as const;
        const allActive = allCategories.every(cat =>
            Object.values(spoilerFilters[cat]).every(val => val === true)
        );
        const newFilters = { ...spoilerFilters };
        allCategories.forEach(cat => {
            const targetState = !allActive;
            const keys = Object.keys(newFilters[cat]);
            keys.forEach(key => { newFilters[cat][key] = targetState; });
        });
        setSpoilerFilters(newFilters);
    };

    // Check current state for global button label
    const areAllFiltersActive = useMemo(() => {
        const allCategories = ['general', 'mainStories', 'eventStories', 'favorStudents', 'memorialStudents'] as const;
        return allCategories.every(cat => Object.values(spoilerFilters[cat]).every(val => val === true));
    }, [spoilerFilters]);

    // --- Individual Filter Handlers ---
    const handleFilterToggle = (type: keyof typeof spoilerFilters, key: string) =>
        setSpoilerFilters(p => ({ ...p, [type]: { ...p[type], [key]: !p[type][key] } }));

    const handleToggleAll = (type: 'mainStories' | 'eventStories', allIds: string[]) => {
        const allSelected = allIds.every(id => spoilerFilters[type][id]);
        const newFilters = { ...spoilerFilters[type] };
        allIds.forEach(id => { newFilters[id] = !allSelected; });
        setSpoilerFilters(p => ({ ...p, [type]: newFilters }));
    };

    const handleStudentToggleAll = (type: 'favorStudents' | 'memorialStudents', filteredIds: string[]) => {
        const allSelected = filteredIds.every(id => spoilerFilters[type][id]);
        const newStudentFilters = { ...spoilerFilters[type] };
        filteredIds.forEach(id => { newStudentFilters[id] = !allSelected; });
        setSpoilerFilters(p => ({ ...p, [type]: newStudentFilters }));
    };

    // --- Detail Toggle Handlers ---
    const handleToggleDetails = (bgmId: string) =>
        setExpandedBgmIds(prev => ({ ...prev, [bgmId]: !prev[bgmId] }));

    const handleToggleAllDetails = () => {
        const allAreExpanded = filteredBgm.length > 0 && filteredBgm.every(bgm => !!expandedBgmIds[bgm.id]);
        if (allAreExpanded) setExpandedBgmIds({});
        else setExpandedBgmIds(Object.fromEntries(filteredBgm.map(bgm => [bgm.id, true])));
    };

    // --- Rendering Helpers ---
    const renderXrefLine = (xref: any, bgm: any): string => {
        const name_title = getLocalizedTextArr(xref.name, locale as Language) || getLocalizedTextArr(xref.name, 'ja' as Language) || getLocalizedTextArr(xref.name, 'ko' as Language)
        let name = ((name_title: string | string[]) => {
            if (Array.isArray(name_title)) {
                return showStoryNames ? name_title.join(' - ') : (name_title[0] || '');
            } else {
                return name_title;
            }
        })(name_title);

        let baseString = '';
        // Use meta.episode for "Episode X"
        const episodeString = xref.episode ? `${t('meta.episode', { x: xref.episode })}` : '';

        // Helper to get prefix from translation
        const getPrefix = (key: keyof typeof XREF_PREFIXES) => t(XREF_PREFIXES[key] || key);

        if (xref.type === 'Favor_Story' || xref.type === 'Memorial') {
            // Use meta.rank
            if (episodeString && showStoryNames) name = `${t('meta.rank')} ${xref.episode} - ${name}`;
            else if (episodeString) name = `${t('meta.rank')} ${xref.episode}`;
        }

        switch (xref.type) {
            case 'Main_Story':
                const mainTitleKey = String(xref.title) as keyof typeof mainStoryChapters;
                const localizedMainTitle = mainStoryChapters[mainTitleKey] ? t(`main_story.${mainStoryChapters[mainTitleKey].key}`) : mainTitleKey;
                baseString = `${getPrefix('Main_Story')} ${localizedMainTitle} ${name}`;
                break;

            case 'Event_Story':
                const eventName = (!Number.isNaN(Number(xref.title)) && eventData[eventConvertor[Number(xref.title) as keyof typeof eventConvertor]]?.[{ en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' }[locale] as 'En' | 'Jp' | 'Kr']) || xref.title?.toString();
                baseString = `${getPrefix('Event_Story')} ${eventName} ${name}`;
                break;
            case 'Favor_Story': case 'Memorial':
                const prefix = getPrefix(xref.type);
                const studentId = xref.title || bgm.xref.find((x: any) => x.type === 'Favor_Story')?.title;
                const studentName = studentId ? studentData[studentId]?.Name || '' : '';
                baseString = `${prefix} ${studentName} ${name}`;
                break;
            case 'event_work': case 'main_work':
                baseString = `${getPrefix('Work')} ${name}`;
                break;
            case 'UI':
                baseString = `${getPrefix('UI')} ${name}`;
                break;
            case 'raid':
                baseString = `${getPrefix('raid')} ${xref.title}`;
                break;
            case 'limitraid':
                baseString = `${getPrefix('limitraid')} ${xref.title}`;
                break;
            case 'Group_Story':
                // console.log('xref',xref.title, otherStoryData.Group_Story, otherStoryData.Group_Story[String(xref.title)])
                // const groupTitle = xref.title ? getLocalizedText(otherStoryData.Group_Story[String(xref.title) as keyof typeof otherStoryData.Group_Story], language) : '';
                const groupTitle = (xref.title && String(xref.title) in otherStoryData.Group_Story) ? t_club(otherStoryData.Group_Story[String(xref.title) as keyof typeof otherStoryData.Group_Story], language) : '';
                baseString = `${getPrefix('Group_Story')} ${groupTitle} - ${name}`;
                break;
            case 'Mini_Story':
                const miniTitle = xref.title ? getLocalizedText(otherStoryData.Mini_Story[String(xref.title) as keyof typeof otherStoryData.Mini_Story], language) : '';
                baseString = `${getPrefix('Mini_Story')} ${miniTitle} ${name}`;
                break;
            case 'Work_Story':
                baseString = `${getPrefix('Work_Story')} ${name}`;
                break;
            default:
                baseString = name.trim() || `${xref.title}`;
        }
        return baseString;
    };


    const pageBackground = "bg-gradient-to-b from-sky-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-950 text-neutral-800 dark:text-neutral-200";

    if (isLoading) return <div className={`flex items-center justify-center min-h-screen font-sans ${pageBackground}`}>{t('status.loading')}</div>;
    if (error) return <div className={`flex items-center justify-center min-h-screen font-sans ${pageBackground} text-red-500`}>{t('status.error')}: {error}</div>;

    return (
        <div className={`min-h-screen font-sans ${pageBackground}`}>
            <div className="max-w-7xl mx-auto p-2 sm:p-4 lg:p-8">
                <header className="mb-8 p-4 sm:p-0 ml-1">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mt-3 mb-2 tracking-tight">
                        {t('title')}
                    </h1>
                    <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-3xl">
                        {t('description')}
                    </p>
                </header>

                <hr className="mb-6 border-neutral-200 dark:border-neutral-700" />

                <main className="grid grid-cols-1 md:grid-cols-3 gap-8" ref={filterPanelRef}>
                    {/* Filter Sidebar */}
                    <div className="md:col-span-1 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl p-6 flex flex-col gap-5 self-start sticky top-6 shadow-lg border border-neutral-200 dark:border-neutral-700">

                        {/* Search & Header */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('filter_title')}</h2>
                                {/* Global Select All / Deselect All */}
                                <button
                                    onClick={handleToggleGlobalAll}
                                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    {areAllFiltersActive ? t('actions.deselect_all') : t('actions.select_all')}
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder={t('search.placeholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:placeholder-neutral-400"
                                />
                            </div>
                        </div>

                        {/* Specific Story Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setMainStoryModalOpen(true)} className="text-sm text-center py-2 px-3 bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors text-neutral-700 dark:text-neutral-200">
                                {t('selection.main_story')}
                                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">({Object.values(spoilerFilters.mainStories).filter(Boolean).length}/{mainStoryList.length})</span>
                            </button>
                            <button onClick={() => setEventStoryModalOpen(true)} className="text-sm text-center py-2 px-3 bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors text-neutral-700 dark:text-neutral-200">
                                {t('selection.event_story')}
                                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">({Object.values(spoilerFilters.eventStories).filter(Boolean).length}/{eventStoryList.length})</span>
                            </button>
                            <button onClick={() => setFavorStudentModalOpen(true)} className="text-sm text-center py-2 px-3 bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors text-neutral-700 dark:text-neutral-200">
                                {t('selection.favor_story')}
                                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">({Object.values(spoilerFilters.favorStudents).filter(Boolean).length}/{studentFilterList.length})</span>
                            </button>
                            <button onClick={() => setMemorialStudentModalOpen(true)} className="text-sm text-center py-2 px-3 bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors text-neutral-700 dark:text-neutral-200">
                                {t('selection.memorial')}
                                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">({Object.values(spoilerFilters.memorialStudents).filter(Boolean).length}/{studentFilterList.length})</span>
                            </button>
                        </div>

                        {/* General Filter Buttons */}
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(GENERAL_CATEGORIES) as Array<keyof typeof GENERAL_CATEGORIES>).map((key) => (
                                <button
                                    key={key}
                                    onClick={() => handleFilterToggle('general', key)}
                                    className={`text-sm py-2 px-2 rounded-lg transition-colors ${spoilerFilters.general[key]
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                        }`}
                                >
                                    {t(GENERAL_CATEGORIES[key])}
                                </button>
                            ))}
                        </div>

                        {/* Options & Actions */}
                        <div className="flex flex-col gap-3 pt-2 border-t border-neutral-300 dark:border-neutral-700">

                            {/* Option: Show Story Names (Mapped to actions keys in JSON) */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                    {showStoryNames ? t('actions.hide_story_names') : t('actions.show_story_names')}
                                </span>
                                <button onClick={() => setShowStoryNames(prev => !prev)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${showStoryNames ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
                                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${showStoryNames ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Option: Auto Scroll (Key not in JSON, using Playback Next as placeholder or hardcoded) */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                    {t('playback.autoplay_scroll')}
                                </span>
                                <button onClick={() => setAutoScrollEnabled(prev => !prev)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${isAutoScrollEnabled ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
                                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isAutoScrollEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Playback Mode */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('playback.options')}</span>
                                <button onClick={() => setPlaybackMode(p => p === 'autoplay' ? 'repeat' : p === 'repeat' ? 'off' : 'autoplay')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-neutral-600 dark:text-neutral-300">
                                    {playbackMode === 'autoplay' && <><AutoplayIcon /> <span className="text-sm font-medium">{t('playback.autoplay')}</span></>}
                                    {playbackMode === 'repeat' && <><RepeatIcon /> <span className="text-sm font-medium">{t('playback.repeat_current')}</span></>}
                                    {playbackMode === 'off' && <><StopIcon /> <span className="text-sm font-medium">{t('playback.stop_after')}</span></>}
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleToggleAllDetails} disabled={filteredBgm.length === 0} className="w-full text-sm bg-neutral-500 hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold py-2 px-3 rounded-lg transition-colors">
                                    {filteredBgm.length > 0 && filteredBgm.every(bgm => !!expandedBgmIds[bgm.id]) ? t('actions.hide_all_details') : t('actions.view_all_details')}
                                </button>
                                <button onClick={playNextRandomSong} disabled={filteredBgm.length === 0} className="w-full text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold py-2 px-3 rounded-lg transition-colors">
                                    {t('playback.play_random')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* BGM List Area */}
                    <div className="md:col-span-2 bg-white/60 dark:bg-neutral-800/60 backdrop-blur-md rounded-xl p-4 sm:p-6 shadow-lg border border-neutral-200 dark:border-neutral-700">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('meta.bgm_list_title')}</h2>
                            <button
                                onClick={() => setSortOrder(prev => prev === 'ascending' ? 'descending' : 'ascending')}
                                className="flex items-center gap-1.5 p-2 rounded-lg bg-neutral-100 dark:bg-neutral-700/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
                            >
                                {sortOrder === 'ascending' ? <FaSortAmountDown className="h-4 w-4" /> : <FaSortAmountUp className="h-4 w-4" />}
                                <span className="text-sm font-medium">{sortOrder === 'ascending' ? t('meta.sort_ascending') : t('meta.sort_descending')}</span>
                            </button>
                        </div>
                        <style>{`@keyframes wave { 0%, 100% { transform: scaleY(0.8); } 50% { transform: scaleY(1); } }`}</style>
                        <div className="max-h-[80vh] overflow-y-auto">
                            {filteredBgm.length > 0 ? (
                                <ul className="space-y-1">
                                    {filteredBgm.map((bgm: any) => (
                                        <li
                                            key={bgm.id}
                                            id={`bgm-item-${bgm.id}`} // Assign ID for scroll targeting
                                            className={`scroll-mt-12 group p-3 px-1 sm:px-3 rounded-xl transition-all duration-300 border ${currentSong?.id === bgm.id ? 'bg-blue-100/50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 shadow-md' : 'bg-transparent hover:bg-neutral-100/50 dark:hover:bg-neutral-700/40 border-transparent'}`}
                                        >
                                            <div className="cursor-pointer" onClick={() => setCurrentSong(bgm)}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center min-w-0">
                                                        <span className="font-mono text-xl font-bold text-blue-500 dark:text-blue-400 w-12 shrink-0">{Number(bgm.id) < 10000 ? bgm.id : 'N/A'}</span>
                                                        <div className="grow pl-2">
                                                            <h3 className="font-bold text-lg text-neutral-800 dark:text-neutral-100 ">{bgm.title || `BGM #${bgm.id}`}</h3>
                                                            <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">{bgm.composer}</p>
                                                        </div>
                                                    </div>
                                                    {bgm.youtube_url && <div className="flex items-center justify-center w-12 h-12 shrink-0 ml-4">
                                                        {currentSong?.id === bgm.id ? <div className="text-blue-500 dark:text-blue-400"><SoundWaveIcon /></div> : <div className="text-blue-500 dark:text-blue-400"><PlayIcon /></div>}
                                                    </div>}
                                                </div>
                                            </div>
                                            <div className="mt-1.5 pt-1.5 border-t border-neutral-400 dark:border-neutral-700/50">
                                                <button onClick={() => handleToggleDetails(bgm.id)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                                                    {!!expandedBgmIds[bgm.id] ? t('actions.hide_details') : t('actions.view_details')}
                                                </button>
                                                {!!expandedBgmIds[bgm.id] && (
                                                    <div className="mt-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 space-y-1.5 pl-3 border-l-2 border-neutral-400 dark:border-neutral-600 ml-2">
                                                        {bgm.xref.filter((xref: any) => {
                                                            const { general, mainStories, eventStories, favorStudents, memorialStudents } = spoilerFilters;
                                                            if (xref.type === 'Favor_Story' && favorStudents[String(xref.title)]) return true;
                                                            if (xref.type === 'Memorial' && memorialStudents[String(xref.title)]) return true;
                                                            if ((xref.type === 'UI') && general.Other) return true;
                                                            if ((xref.type === 'raid' || xref.type === 'limitraid') && general.Raid) return true;
                                                            if ((xref.type === 'main_work' || xref.type === 'event_work') && general.Work) return true;
                                                            if (xref.type === 'Main_Story' && xref.title && mainStories[String(xref.title)]) return true;
                                                            if (xref.type === 'Event_Story' && xref.title && eventStories[String(xref.title)]) return true;
                                                            if (xref.type === 'Group_Story' && general.GroupStory) return true;
                                                            if (xref.type === 'Mini_Story' && general.MiniStory) return true;
                                                            if (xref.type === 'Work_Story' && general.WorkStory) return true;
                                                            return false;
                                                        }).map((x: any, i: number) => <div key={i}><RubyText>{renderXrefLine(x, bgm)}</RubyText></div>)
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                        </li>))}
                                </ul>
                            ) : (<p className="text-center text-neutral-500 dark:text-neutral-400 py-12">{t('search.no_results')}</p>)}
                        </div>
                    </div>
                </main>
            </div>

            {/* Modals */}
            <FilterModal isOpen={isMainStoryModalOpen} onClose={() => setMainStoryModalOpen(false)} title={t('selection.main_story')} items={mainStoryList} selectedItems={spoilerFilters.mainStories} onToggleItem={(id) => handleFilterToggle('mainStories', id)} onToggleAll={() => handleToggleAll('mainStories', mainStoryList.map(([id]) => id))} />
            <FilterModal isOpen={isEventStoryModalOpen} onClose={() => setEventStoryModalOpen(false)} title={t('selection.event_story')} items={eventStoryList} selectedItems={spoilerFilters.eventStories} onToggleItem={(id) => handleFilterToggle('eventStories', id)} onToggleAll={() => handleToggleAll('eventStories', eventStoryList.map(([id]) => id))} />
            <StudentFilterModal isOpen={isFavorStudentModalOpen} onClose={() => setFavorStudentModalOpen(false)} title={t('selection.favor_story')} items={studentFilterList} selectedItems={spoilerFilters.favorStudents} onToggleItem={(id) => handleFilterToggle('favorStudents', id)} onToggleAll={(filteredIds) => handleStudentToggleAll('favorStudents', filteredIds)} />
            <StudentFilterModal isOpen={isMemorialStudentModalOpen} onClose={() => setMemorialStudentModalOpen(false)} title={t('selection.memorial')} items={studentFilterList} selectedItems={spoilerFilters.memorialStudents} onToggleItem={(id) => handleFilterToggle('memorialStudents', id)} onToggleAll={(filteredIds) => handleStudentToggleAll('memorialStudents', filteredIds)} />

            {/* Mobile Scroll to Filter Button */}
            <button
                onClick={() => { if (filterPanelRef.current) window.scrollTo({ top: filterPanelRef.current.offsetTop - 60, behavior: 'smooth' }); }}
                className="md:hidden fixed bottom-4 left-4 z-51 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label={t('meta.sort_order')} // Placeholder as specific key doesn't exist
            >
                <FilterIcon />
            </button>

            {/* Music Player */}
            <Player
                song={currentSong}
                onClose={() => setCurrentSong(null)}
                onSongEnd={stableOnSongEnd}
                onTitleClick={scrollToBgm} // Pass scroll function
            />
            <style>{`@keyframes slide-in-right{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.animate-slide-in-right{animation:slide-in-right .3s ease-out forwards}`}</style>
        </div>
    );
}