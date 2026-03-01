// app/components/dashboard/YouTubeSearchGenerator.tsx

import { useMemo, useState, useEffect, useRef } from 'react';
import { FiYoutube, FiClipboard, FiCheck, FiX } from 'react-icons/fi';
import type { RaidInfo } from '~/types/data';
import { getLocaleShortName, SUPORTED_LOCALES, SUPORTED_SHORT_LOCALES, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';
import { useTranslation } from 'react-i18next';
import { isTotalAssault } from './common';
import { type_translation } from '../raidToString';

// --- Props ---
interface YouTubeSearchGeneratorProps {
  raidInfo: RaidInfo;
  showType: boolean;
}

// --- Translation Data (Internal) ---

const raid_translation: Record<string, Record<LocaleShortName, string>> = {
  raid: { ko: '총력전', en: 'Total Assault', ja: '総力戦', zh_Hant: '總力戰' },
  eraid: { ko: '대결전', en: 'Grand Assault', ja: '大決戦', zh_Hant: '大決戰' },
};

const terrain_translation: Record<string, Record<LocaleShortName, string>> = {
  Outdoor: { ko: '야외', en: 'Outdoor', ja: '屋外', zh_Hant: '室外' },
  Indoor: { ko: '실내', en: 'Indoor', ja: '屋内', zh_Hant: '室內' },
  Street: { ko: '시가지', en: 'Street', ja: '市街地', zh_Hant: '市區' },
};
const defense_type_translation = type_translation;

const attack_type_translation: Record<string, Record<LocaleShortName, string>> = {
  LightArmor: { ko: '폭발', en: 'Explosive', ja: '爆発', zh_Hant: '爆炸' },
  HeavyArmor: { ko: '관통', en: 'Piercing', ja: '貫通', zh_Hant: '貫通' },
  Unarmed: { ko: '신비', en: 'Mystic', ja: '神秘', zh_Hant: '神祕' },
  ElasticArmor: { ko: '진동', en: 'Sonic', ja: '振動', zh_Hant: '振動' },
  CompositeArmor: { ko: '분해', en: 'Chemical', ja: '分解', zh_Hant: '分解' },
};

// const searchableDifficulties = ['Extreme', 'Insane', 'Torment'];

function convertLocale(searchString: string, trans: Record<string, Record<LocaleShortName, string>>, locale: Locale, searchLocale: Locale) {
  const locale_s = getLocaleShortName(locale);
  const searchLocale_s = getLocaleShortName(searchLocale);

  for (const [, value] of Object.entries(trans)) {
    if (value[locale_s] == searchString) return value[searchLocale_s];
  }
  if (searchString in trans) return trans[searchString][searchLocale_s];

  // if no mached locale
  for (const allLocale of SUPORTED_SHORT_LOCALES) {
    for (const [, value] of Object.entries(trans)) {
      if (value[allLocale] == searchString) return value[searchLocale_s];
    }
  }
  return searchString;
}

// --- Component ---
export function YouTubeSearchGenerator({ raidInfo, showType }: YouTubeSearchGeneratorProps) {
  const { t, i18n } = useTranslation('dashboard', {
    keyPrefix: 'searchYouTube',
  });
  const locale = i18n.language as Locale;

  const isGrandAssault = !isTotalAssault(raidInfo);

  // Popup display state
  const [isOpen, setIsOpen] = useState(false);

  // const bossData = (bossNameData as Record<string, any>)[raidInfo.Id];
  const bossNameData = Object.fromEntries(
    Object.entries(bossData).map(([k, v]) => {
      return [k, v.name as Record<LocaleShortName, string>];
    }),
  );

  // --- Search Generator State ---
  const [searchLang, setSearchLang] = useState<Locale>('ja');
  const [searchDifficulty, setSearchDifficulty] = useState<string | null>(null);
  const [includeTerrain, setIncludeTerrain] = useState(true);
  const [includeDefense, setIncludeDefense] = useState(false);
  const [includeAttack, setIncludeAttack] = useState(true);
  const [copied, setCopied] = useState(false);
  const [includeDateRange, setIncludeDateRange] = useState(true);

  const searchableDifficulties = useMemo(() => {
    return Object.keys(raidInfo.Cnt).filter((v) => v != 'All');
  }, [raidInfo]);

  const dateRangeStrings = useMemo(() => {
    if (!raidInfo.Date) return null;
    try {
      // Parse YYYY-MM-DD as local date
      const startDate = new Date(raidInfo.Date + 'T09:00:00');
      const endDate = new Date(startDate);
      startDate.setDate(startDate.getDate() - 1);
      // Add 14 days
      endDate.setDate(startDate.getDate() + 14);

      const afterStr = startDate.toISOString().split('T')[0]; //raidInfo.Date; // YYYY-MM-DD
      const beforeStr = endDate.toISOString().split('T')[0]; // Format to YYYY-MM-DD

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
    setSearchDifficulty((prevDifficulty) => {
      // Set to null (deselect) if already selected button is clicked again
      if (prevDifficulty === diff) {
        return null;
      }
      // Change to that button if another button is clicked
      return diff;
    });
  };

  // --- Search Query Generation Logic ---
  const searchQuery = useMemo(() => {
    const lang = searchLang as Locale;
    const parts: string[] = [];

    if (isGrandAssault) {
      // raid_translation
      parts.push(convertLocale('eraid', raid_translation, locale, searchLang));
    } else {
      parts.push(convertLocale('raid', raid_translation, locale, searchLang));
    }

    parts.push(convertLocale(raidInfo.Boss, bossNameData, locale, searchLang));

    // 2. Terrain
    if (includeTerrain && raidInfo.Location) {
      // parts.push(terrain_translation[raidInfo.Location]?.[lang] || raidInfo.Location);
      parts.push(convertLocale(raidInfo.Location, terrain_translation, locale, searchLang));
    }

    // 3. Defense Type
    if (showType && includeDefense && raidInfo.Type) {
      // parts.push(defense_type_translation[raidInfo.Type]?.[lang]);
      parts.push(convertLocale(raidInfo.Type, defense_type_translation, locale, searchLang));
    }

    // 5. Attack Type (Effective type)
    if (showType && includeAttack && raidInfo.Type) {
      parts.push(attack_type_translation[raidInfo.Type]?.[getLocaleShortName(lang)]);
    }

    // 4. Difficulty
    if (searchDifficulty) {
      parts.push(searchDifficulty);
    }

    // 7. Date Range
    if (includeDateRange && dateRangeStrings) {
      parts.push(dateRangeStrings.after);
      parts.push(dateRangeStrings.before);
    }

    return parts.filter(Boolean).join(' '); // Filter out any null/undefined parts
  }, [bossData, raidInfo, searchLang, searchDifficulty, includeTerrain, includeDefense, includeAttack, isGrandAssault, includeDateRange]);

  // --- Handlers ---
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(searchQuery).then(() => {
      setCopied(true);
    });
  };

  // --- Reset Copy Completion Message ---
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // --- YouTube Search Handler ---
  const handleYouTubeSearch = () => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ref for detecting outside clicks
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
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
  }, [isOpen, wrapperRef]);

  useEffect(() => {
    setSearchDifficulty(null);
  }, [includeDefense, includeAttack]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        title={t('searchYouTube')}
        className={`inline-flex items-center px-3 py-1 text-s font-semibold rounded-full transition-colors ${isOpen ? 'bg-red-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
      >
        <FiYoutube className="h-[1.5em]" />
      </button>

      {}
      {isOpen && (
        <div
          // This is now a fixed-position backdrop
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <div
            // This is the modal content box
            ref={wrapperRef} // Ref is now on the content box
            className="w-full max-w-md bg-white dark:bg-neutral-800 
                                   border border-neutral-200 dark:border-neutral-700 
                                   rounded-lg shadow-xl p-4 text-left"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-neutral-800 dark:text-neutral-200">{t('title')}</h4>
              <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
                <FiX size={18} />
              </button>
            </div>

            {/* Search Query */}
            <div className="p-3 bg-gray-100 dark:bg-neutral-900 rounded-lg text-center font-mono text-sm text-neutral-700 dark:text-neutral-300">{searchQuery}</div>

            {/* 2. Option Panel */}
            <div className="mt-4 space-y-3">
              {/* Language Selection */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold shrink-0 text-neutral-600 dark:text-neutral-400">{t('language')}: </span>
                <div className="flex gap-2">
                  {SUPORTED_LOCALES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSearchLang(lang as Locale)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${searchLang === lang ? 'bg-blue-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Selection */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold shrink-0 text-neutral-600 dark:text-neutral-400">{t('difficulty')}: </span>
                <div className="flex gap-2 flex-wrap">
                  {searchableDifficulties.map((diff) => (
                    <button
                      key={diff}
                      onClick={() => handleDifficultyToggle(diff)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                        // This activation logic works the same even without the 'None' button.
                        searchDifficulty === diff
                          ? 'bg-blue-500 text-white'
                          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Include Options (Toggle) */}
              {/* Include Toggles */}
              <div className="flex items-center gap-2">
                <div className="flex gap-3 flex-wrap text-sm text-neutral-800 dark:text-neutral-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={includeTerrain} onChange={() => setIncludeTerrain((v) => !v)} className="rounded" />
                    <span>{t('terrain')}</span>
                  </label>

                  {/* Date Range Toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={includeDateRange} onChange={() => setIncludeDateRange((v) => !v)} className="rounded" />
                    <span>{t('dateRange')}</span>
                  </label>

                  {showType && isGrandAssault && (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={includeDefense} onChange={() => setIncludeDefense((v) => !v)} className="rounded" />
                        <span>{t('defenseType')}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={includeAttack} onChange={() => setIncludeAttack((v) => !v)} className="rounded" />
                        <span>{t('attackType')}</span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Action Buttons */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={handleCopyToClipboard}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
              >
                {copied ? <FiCheck /> : <FiClipboard />}
                {copied ? t('copied') : t('copy')}
              </button>
              <button
                onClick={handleYouTubeSearch}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <FiYoutube />
                {t('searchYouTube')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
