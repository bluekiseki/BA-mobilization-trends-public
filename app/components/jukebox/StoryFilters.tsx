import React from 'react';
import type { Student } from '~/types/data';
import { AutoplayIcon, RepeatIcon, StopIcon } from '~/routes/utils/jukeboxMetadata';

export interface StoryFiltersProps {
  // Data
  mainStoryList: [string, string][];
  eventStoryList: [string, string][];
  studentFilterList: [string, Student][];
  // Filter state
  spoilerFilters: {
    mainStories: Record<string, boolean>;
    eventStories: Record<string, boolean>;
    favorStudents: Record<string, boolean>;
    memorialStudents: Record<string, boolean>;
  };
  activeFilters: {
    mainStories: string[];
    eventStories: string[];
    favorStudents: string[];
    memorialStudents: string[];
  };
  // Section search
  sectionSearch: {
    mainStories: string;
    eventStories: string;
    favorStudents: string;
    memorialStudents: string;
  };
  setSectionSearch: React.Dispatch<
    React.SetStateAction<{
      mainStories: string;
      eventStories: string;
      favorStudents: string;
      memorialStudents: string;
    }>
  >;
  // Handlers
  handleFilterToggle: (type: 'mainStories' | 'eventStories' | 'favorStudents' | 'memorialStudents' | 'general', key: string) => void;
  handleClearCategory: (type: 'mainStories' | 'eventStories' | 'favorStudents' | 'memorialStudents') => void;
  handleSelectAllCategory: (type: 'mainStories' | 'eventStories' | 'favorStudents' | 'memorialStudents') => void; //
  // Options
  showStoryNames: boolean;
  setShowStoryNames: React.Dispatch<React.SetStateAction<boolean>>;
  isAutoScrollEnabled: boolean;
  setAutoScrollEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  playbackMode: 'autoplay' | 'repeat' | 'off';
  setPlaybackMode: React.Dispatch<React.SetStateAction<'autoplay' | 'repeat' | 'off'>>;
  // i18n
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (...args: any[]) => string;
}

const SectionHeader = ({
  label,
  activeCount,
  total,
  onClear,
  onSelectAll,
  t,
}: {
  label: string;
  activeCount: number;
  total: number;
  onClear: () => void;
  onSelectAll: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (...args: any[]) => string;
}) => (
  <div className="flex items-center justify-between mb-1.5">
    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">
        {activeCount}/{total}
      </span>
      {/* Select All (Show only when not all are selected) */}
      {activeCount < total && total > 0 && (
        <button onClick={onSelectAll} className="text-xs text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 transition-colors">
          {t('actions.select_all')}
        </button>
      )}

      {/* Deselect All (Show only when at least one is selected; use rose color for distinction) */}
      {activeCount > 0 && (
        <button onClick={onClear} className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-colors">
          {t('actions.deselect_all')}
        </button>
      )}
    </div>
  </div>
);

const SectionSearch = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <input
    type="text"
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full px-2.5 py-1.5 mb-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 dark:focus:border-sky-500 transition-colors"
  />
);

export default function StoryFilters({
  mainStoryList,
  eventStoryList,
  studentFilterList,
  spoilerFilters,
  activeFilters,
  sectionSearch,
  setSectionSearch,
  handleFilterToggle,
  handleClearCategory,
  handleSelectAllCategory,
  showStoryNames,
  setShowStoryNames,
  isAutoScrollEnabled,
  setAutoScrollEnabled,
  playbackMode,
  setPlaybackMode,
  t,
}: StoryFiltersProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* ── Options ── */}
      <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-400">{showStoryNames ? t('actions.hide_story_names') : t('actions.show_story_names')}</span>
          <button
            onClick={() => setShowStoryNames((p) => !p)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${showStoryNames ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mt-[3px] ${showStoryNames ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('playback.autoplay_scroll')}</span>
          <button
            onClick={() => setAutoScrollEnabled((p) => !p)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${isAutoScrollEnabled ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mt-[3px] ${isAutoScrollEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('playback.options')}</span>
          <button
            onClick={() => setPlaybackMode((p) => (p === 'autoplay' ? 'repeat' : p === 'repeat' ? 'off' : 'autoplay'))}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
          >
            {playbackMode === 'autoplay' && (
              <>
                <AutoplayIcon />
                <span className="text-xs">{t('playback.autoplay')}</span>
              </>
            )}
            {playbackMode === 'repeat' && (
              <>
                <RepeatIcon />
                <span className="text-xs">{t('playback.repeat_current')}</span>
              </>
            )}
            {playbackMode === 'off' && (
              <>
                <StopIcon />
                <span className="text-xs">{t('playback.stop_after')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main Story ── */}
      <div>
        <SectionHeader
          label={t('selection.main_story')}
          activeCount={activeFilters.mainStories.length}
          total={mainStoryList.length}
          onClear={() => handleClearCategory('mainStories')}
          onSelectAll={() => handleSelectAllCategory('mainStories')}
          t={t}
        />
        <SectionSearch value={sectionSearch.mainStories} onChange={(v) => setSectionSearch((p) => ({ ...p, mainStories: v }))} placeholder={t('search.placeholder')} />
        <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
          {mainStoryList
            .filter(([, name]) => !sectionSearch.mainStories || name.toLowerCase().includes(sectionSearch.mainStories.toLowerCase()))
            .map(([id, name]) => (
              <label key={id} className="flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <input
                  type="checkbox"
                  checked={!!spoilerFilters.mainStories[id]}
                  onChange={() => handleFilterToggle('mainStories', id)}
                  className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer"
                />
                <span className={`text-xs leading-snug ${spoilerFilters.mainStories[id] ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>{name}</span>
              </label>
            ))}
        </div>
      </div>

      {/* ── Event Story ── */}
      <div>
        <SectionHeader
          label={t('selection.event_story')}
          activeCount={activeFilters.eventStories.length}
          total={eventStoryList.length}
          onClear={() => handleClearCategory('eventStories')}
          onSelectAll={() => handleSelectAllCategory('eventStories')}
          t={t}
        />
        <SectionSearch value={sectionSearch.eventStories} onChange={(v) => setSectionSearch((p) => ({ ...p, eventStories: v }))} placeholder={t('search.placeholder')} />
        <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
          {eventStoryList
            .filter(([, name]) => !sectionSearch.eventStories || name.toLowerCase().includes(sectionSearch.eventStories.toLowerCase()))
            .map(([id, name]) => (
              <label key={id} className="flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <input
                  type="checkbox"
                  checked={!!spoilerFilters.eventStories[id]}
                  onChange={() => handleFilterToggle('eventStories', id)}
                  className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer"
                />
                <span className={`text-xs leading-snug truncate ${spoilerFilters.eventStories[id] ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                  {name}
                </span>
              </label>
            ))}
        </div>
      </div>

      {/* ── Favor Story ── */}
      <div>
        <SectionHeader
          label={t('selection.favor_story')}
          activeCount={activeFilters.favorStudents.length}
          total={studentFilterList.length}
          onClear={() => handleClearCategory('favorStudents')}
          onSelectAll={() => handleSelectAllCategory('favorStudents')}
          t={t}
        />
        <SectionSearch value={sectionSearch.favorStudents} onChange={(v) => setSectionSearch((p) => ({ ...p, favorStudents: v }))} placeholder={t('search.student_name') || t('search.placeholder')} />
        <div className="max-h-36 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-0.5">
            {studentFilterList
              .filter(([, s]) => !sectionSearch.favorStudents || s.Name.toLowerCase().includes(sectionSearch.favorStudents.toLowerCase()))
              .map(([id, s]) => (
                <label key={id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <input
                    type="checkbox"
                    checked={!!spoilerFilters.favorStudents[id]}
                    onChange={() => handleFilterToggle('favorStudents', id)}
                    className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer shrink-0"
                  />
                  <img className="h-4 w-4 rounded-full" src={`data:image/webp;base64,${s.Portrait}`} alt={s.Name}></img>
                  <span className={`text-xs truncate ${spoilerFilters.favorStudents[id] ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>{s.Name}</span>
                </label>
              ))}
          </div>
        </div>
      </div>

      {/* ── Memorial ── */}
      <div>
        <SectionHeader
          label={t('selection.memorial')}
          activeCount={activeFilters.memorialStudents.length}
          total={studentFilterList.length}
          onClear={() => handleClearCategory('memorialStudents')}
          onSelectAll={() => handleSelectAllCategory('memorialStudents')}
          t={t}
        />
        <SectionSearch
          value={sectionSearch.memorialStudents}
          onChange={(v) => setSectionSearch((p) => ({ ...p, memorialStudents: v }))}
          placeholder={t('search.student_name') || t('search.placeholder')}
        />
        <div className="max-h-36 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-0.5">
            {studentFilterList
              .filter(([, s]) => !sectionSearch.memorialStudents || s.Name.toLowerCase().includes(sectionSearch.memorialStudents.toLowerCase()))
              .map(([id, s]) => (
                <label key={id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <input
                    type="checkbox"
                    checked={!!spoilerFilters.memorialStudents[id]}
                    onChange={() => handleFilterToggle('memorialStudents', id)}
                    className="w-3.5 h-3.5 rounded accent-sky-500 cursor-pointer shrink-0"
                  />
                  <img className="h-4 w-4 rounded-full" src={`data:image/webp;base64,${s.Portrait}`} alt={s.Name}></img>
                  <span className={`text-xs truncate ${spoilerFilters.memorialStudents[id] ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>{s.Name}</span>
                </label>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
