// app/components/dashboard/YouTubeSearchGenerator.tsx

import { useMemo, useState, useEffect, useRef } from 'react';
import { FiYoutube, FiClipboard, FiCheck, FiX } from 'react-icons/fi';
import type { RaidInfo, Student } from '~/types/data';
import { getLocaleShortName, SUPORTED_LOCALES, SUPORTED_SHORT_LOCALES, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';
import { useTranslation } from 'react-i18next';
import { isTotalAssault } from './common';
import { type_translation } from '../raidToString';
import { getKstTime } from '~/data/globalRaidDates';
import { cdn } from '~/utils/cdn';

// --- Props ---
export type DefenseType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';

interface YouTubeSearchGeneratorProps {
  raidInfo: RaidInfo;
  showType: boolean | DefenseType[];
  /** Party member IDs to include in search query. Each inner array is one party. */
  partyStudentIds?: number[][];
}

// --- Translation Data (Internal) ---

const raid_translation: Record<string, Record<LocaleShortName, string>> = {
  raid: { ko: '총력전', en: 'Total Assault', ja: '総力戦', zh_Hant: '總力戰' },
  eraid: { ko: '대결전', en: 'Grand Assault', ja: '大決戦', zh_Hant: '大決戰' },
};

export const terrain_translation: Record<string, Record<LocaleShortName, string>> = {
  Outdoor: { ko: '야외', en: 'Outdoor', ja: '屋外', zh_Hant: '室外' },
  Indoor: { ko: '실내', en: 'Indoor', ja: '屋内', zh_Hant: '室內' },
  Street: { ko: '시가지', en: 'Street', ja: '市街地', zh_Hant: '市區' },
};
const defense_type_translation = type_translation;

export const attack_type_translation: Record<string, Record<LocaleShortName, string>> = {
  LightArmor: { ko: '폭발', en: 'Explosive', ja: '爆発', zh_Hant: '爆炸' },
  HeavyArmor: { ko: '관통', en: 'Piercing', ja: '貫通', zh_Hant: '貫通' },
  Unarmed: { ko: '신비', en: 'Mystic', ja: '神秘', zh_Hant: '神祕' },
  ElasticArmor: { ko: '진동', en: 'Sonic', ja: '振動', zh_Hant: '振動' },
  CompositeArmor: { ko: '분해', en: 'Chemical', ja: '分解', zh_Hant: '分解' },
};

function convertLocale(searchString: string, trans: Record<string, Record<LocaleShortName, string>>, locale: Locale, searchLocale: Locale) {
  const locale_s = getLocaleShortName(locale);
  const searchLocale_s = getLocaleShortName(searchLocale);

  for (const [, value] of Object.entries(trans)) {
    if (value[locale_s] === searchString) return value[searchLocale_s];
  }
  if (searchString in trans) return trans[searchString][searchLocale_s];

  // if no matched locale
  for (const allLocale of SUPORTED_SHORT_LOCALES) {
    for (const [, value] of Object.entries(trans)) {
      if (value[allLocale] === searchString) return value[searchLocale_s];
    }
  }
  return searchString;
}

// --- Component ---
export function YouTubeSearchGenerator({ raidInfo, showType, partyStudentIds }: YouTubeSearchGeneratorProps) {
  const { t, i18n } = useTranslation('dashboard', {
    keyPrefix: 'searchYouTube',
  });
  const locale = i18n.language as Locale;

  const isGrandAssault = !isTotalAssault(raidInfo);

  // Popup display state
  const [isOpen, setIsOpen] = useState(false);

  const bossNameData = Object.fromEntries(
    Object.entries(bossData).map(([k, v]) => {
      return [k, v.name as Record<LocaleShortName, string>];
    }),
  );

  // --- Search Generator State ---
  const [searchLang, setSearchLang] = useState<Locale>('ja');
  const [searchDifficulty, setSearchDifficulty] = useState<string | null>(null);

  // Manages a single selected defense type when defense types are provided as an array
  const [selectedDefenseType, setSelectedDefenseType] = useState<DefenseType | null>(Array.isArray(showType) && showType.length > 0 ? showType[0] : null);

  const [includeTerrain, setIncludeTerrain] = useState(true);
  const [includeDefense, setIncludeDefense] = useState(false);
  const [includeAttack, setIncludeAttack] = useState(true);
  const [copied, setCopied] = useState(false);
  const [includeDateRange, setIncludeDateRange] = useState(true);
  const [includeStudents, setIncludeStudents] = useState(true);
  const [studentNameMap, setStudentNameMap] = useState<Record<number, string>>({});

  // Fetch localized student names when partyStudentIds provided and language changes
  useEffect(() => {
    if (!partyStudentIds || partyStudentIds.length === 0) return;
    const shortLang = getLocaleShortName(searchLang as Locale);
    fetch(cdn(`/schaledb.com/${shortLang}.students.min.json`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const map: Record<number, string> = {};
        for (const [id, student] of Object.entries(data as Record<number, Student>)) {
          map[Number(id)] = (student as Student).Name;
        }
        setStudentNameMap(map);
      })
      .catch(() => {});
  }, [partyStudentIds, searchLang]);

  // Reset selectedDefenseType when showType props change
  useEffect(() => {
    if (Array.isArray(showType) && showType.length > 0) {
      setSelectedDefenseType(showType[0]);
    } else {
      setSelectedDefenseType(null);
    }
  }, [showType]);

  const searchableDifficulties = useMemo(() => {
    return Object.keys(raidInfo.Cnt).filter((v) => v !== 'All');
  }, [raidInfo]);

  const dateRangeStrings = useMemo(() => {
    if (!raidInfo.Date) return null;
    try {
      const startDate = !raidInfo.Date.includes(' ') ? new Date(raidInfo.Date + 'T09:00:00') : new Date(getKstTime(raidInfo.Date));
      const endDate = new Date(startDate);

      // console.log('raidInfo.Date', raidInfo.Date);

      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(startDate.getDate() + 14);

      const afterStr = startDate.toISOString().split('T')[0];
      const beforeStr = endDate.toISOString().split('T')[0];

      return {
        after: `after:${afterStr}`,
        before: `before:${beforeStr}`,
      };
    } catch (e) {
      console.error('Error parsing raid date:', raidInfo.Date, e);
      return null;
    }
  }, [raidInfo.Date]);

  const handleDifficultyToggle = (diff: string) => {
    setSearchDifficulty((prevDifficulty) => (prevDifficulty === diff ? null : diff));
  };

  // --- Search Query Generation Logic ---
  const searchQuery = useMemo(() => {
    const lang = searchLang as Locale;
    const parts: string[] = [];

    // 1. Raid Type & Boss Name
    parts.push(convertLocale(isGrandAssault ? 'eraid' : 'raid', raid_translation, locale, searchLang));
    parts.push(convertLocale(raidInfo.Boss, bossNameData, locale, searchLang));

    // 2. Terrain
    if (includeTerrain && raidInfo.Location) {
      parts.push(convertLocale(raidInfo.Location, terrain_translation, locale, searchLang));
    }

    // Determined target defense type (selected value if array, default boss type if boolean)
    const currentDefenseType = Array.isArray(showType) ? selectedDefenseType : raidInfo.Type;

    // 3. Defense Type
    if (showType && includeDefense && currentDefenseType) {
      parts.push(convertLocale(currentDefenseType, defense_type_translation, locale, searchLang));
    }

    // 4. Attack Type (Effective type)
    if (showType && includeAttack && currentDefenseType) {
      const translated = attack_type_translation[currentDefenseType]?.[getLocaleShortName(lang)];
      if (translated) parts.push(translated);
    }

    // 5. Difficulty
    if (searchDifficulty) {
      parts.push(searchDifficulty);
    }

    // 6. Student names
    if (includeStudents && partyStudentIds && partyStudentIds.length > 0) {
      for (const party of partyStudentIds) {
        for (const id of party) {
          const name = studentNameMap[id];
          if (name) parts.push(name);
        }
      }
    }

    // 7. Date Range
    if (includeDateRange && dateRangeStrings) {
      parts.push(dateRangeStrings.after);
      parts.push(dateRangeStrings.before);
    }

    return parts.filter(Boolean).join(' ');
  }, [
    bossNameData,
    raidInfo,
    searchLang,
    searchDifficulty,
    includeTerrain,
    includeDefense,
    includeAttack,
    isGrandAssault,
    includeDateRange,
    showType,
    dateRangeStrings,
    locale,
    selectedDefenseType,
    includeStudents,
    partyStudentIds,
    studentNameMap,
  ]);

  // --- Handlers ---
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(searchQuery).then(() => {
      setCopied(true);
    });
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleYouTubeSearch = () => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    setSearchDifficulty(null);
  }, [includeDefense, includeAttack]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        title={t('searchYouTube')}
        className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full transition-colors ${isOpen ? 'bg-red-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
      >
        <FiYoutube className="h-[1.5em]" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div ref={wrapperRef} className="w-full max-w-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl p-5 text-left">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-lg text-neutral-800 dark:text-neutral-200">{t('title')}</h4>
              <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-red-500 transition-colors">
                <FiX size={20} />
              </button>
            </div>

            {/* Search Query Preview */}
            <div className="p-3 mb-4 bg-gray-100 dark:bg-neutral-900 rounded-lg text-center font-mono text-sm text-neutral-700 dark:text-neutral-300 break-all">{searchQuery}</div>

            {/* Options Panel */}
            <div className="space-y-4">
              {/* Language Selection */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold shrink-0 text-neutral-600 dark:text-neutral-400">{t('language')}:</span>
                <div className="flex gap-2 flex-wrap">
                  {SUPORTED_LOCALES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSearchLang(lang as Locale)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${searchLang === lang ? 'bg-blue-500 text-white shadow-sm' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Selection */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold shrink-0 text-neutral-600 dark:text-neutral-400">{t('difficulty')}:</span>
                <div className="flex gap-2 flex-wrap">
                  {searchableDifficulties.map((diff) => (
                    <button
                      key={diff}
                      onClick={() => handleDifficultyToggle(diff)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                        searchDifficulty === diff
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single selection button for defense type arrays */}
              {Array.isArray(showType) && showType.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold shrink-0 text-neutral-600 dark:text-neutral-400">{t('defenseType')}:</span>
                  <div className="flex gap-2 flex-wrap">
                    {showType.map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedDefenseType(type)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                          selectedDefenseType === type
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                        }`}
                      >
                        {defense_type_translation[type]?.[getLocaleShortName(locale)] || type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="flex items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex flex-wrap gap-4 text-sm font-medium text-neutral-800 dark:text-neutral-300">
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors">
                    <input type="checkbox" checked={includeTerrain} onChange={() => setIncludeTerrain((v) => !v)} className="rounded accent-blue-500 w-4 h-4" />
                    <span>{t('terrain')}</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors">
                    <input type="checkbox" checked={includeDateRange} onChange={() => setIncludeDateRange((v) => !v)} className="rounded accent-blue-500 w-4 h-4" />
                    <span>{t('dateRange')}</span>
                  </label>

                  {/* Defense/Attack type toggle (renders only when showType is active) */}
                  {!!showType && (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors">
                        <input type="checkbox" checked={includeDefense} onChange={() => setIncludeDefense((v) => !v)} className="rounded accent-blue-500 w-4 h-4" />
                        <span>{t('defenseType')}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors">
                        <input type="checkbox" checked={includeAttack} onChange={() => setIncludeAttack((v) => !v)} className="rounded accent-blue-500 w-4 h-4" />
                        <span>{t('attackType')}</span>
                      </label>
                    </>
                  )}

                  {/* Student names toggle (only when partyStudentIds provided) */}
                  {partyStudentIds && partyStudentIds.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-500 transition-colors">
                      <input type="checkbox" checked={includeStudents} onChange={() => setIncludeStudents((v) => !v)} className="rounded accent-blue-500 w-4 h-4" />
                      <span>{t('student_name')}</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={handleCopyToClipboard}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${copied ? 'bg-green-500 text-white shadow-md' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
              >
                {copied ? <FiCheck size={18} /> : <FiClipboard size={18} />}
                {copied ? t('copied') : t('copy')}
              </button>
              <button
                onClick={handleYouTubeSearch}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm bg-red-600 text-white shadow-md hover:bg-red-700 transition-colors"
              >
                <FiYoutube size={18} />
                {t('searchYouTube')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
