import { useState, type ReactNode } from 'react';
import { LuSettings } from 'react-icons/lu';
import { useLocation, useParams } from 'react-router';
import { StoryLink } from './StorySections';
import type { StoryLang } from '../logic/types';
import { useStorySettings } from './useStorySettings';
import { storyCopy } from '../logic/uiText';
import { StorySettingsPanel } from './StorySettingsPanel';
import { storyListPath, storyQuery } from '../logic/navigation';

interface StoryShellProps {
  lang: StoryLang;
  onLang: (lang: StoryLang) => void;
  langQuery: string;
  error: string | null;
  loading: boolean;
  children: ReactNode;
}

export function StoryShell({ lang, onLang, langQuery, error, loading, children }: StoryShellProps) {
  const t = storyCopy(lang);
  const { settings, save } = useStorySettings();
  const [editing, setEditing] = useState(false);
  const flow = useLocation().pathname.endsWith('/story/map');
  const { series } = useParams();
  const params = new URLSearchParams(langQuery);
  const flowQuery = storyQuery(langQuery, { selected: series ?? params.get('selected') ?? params.get('focus') });
  return (
    <div className="min-h-screen bg-white px-4 py-6 text-neutral-900 sm:px-6 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <div className="flex items-center gap-4">
          {settings && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Settings"
              title="Settings"
              className="inline-flex size-11 items-center justify-center text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark dark:text-neutral-400 dark:hover:text-white"
            >
              <LuSettings size={20} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{t.description}</p>
      <nav aria-label={t.title} className="my-5 flex gap-5 border-b border-neutral-200 dark:border-neutral-700">
        {[
          { active: flow, to: `/utils/story/map${flowQuery}`, label: t.flow },
          { active: !flow, to: storyListPath(langQuery), label: t.list },
        ].map((tab) => (
          <StoryLink
            key={tab.label}
            to={tab.to}
            aria-current={tab.active ? 'page' : undefined}
            className={`flex min-h-12 items-center border-b-2 px-1 text-sm font-semibold ${tab.active ? 'border-ba-btn-blue-dark text-neutral-900 dark:text-white' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'}`}
          >
            {tab.label}
          </StoryLink>
        ))}
      </nav>
      {(settings === null || editing) && (
        <StorySettingsPanel
          lang={lang}
          onLang={onLang}
          initial={settings ?? { server: lang === 'ko' ? 'kr' : 'jp', spoilers: false }}
          onSave={(next) => {
            save(next);
            setEditing(false);
          }}
          onCancel={settings ? () => setEditing(false) : undefined}
        />
      )}
      {error ? (
        <p role="alert" className="py-16 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : loading ? (
        <p role="status" className="py-16 text-center text-sm text-neutral-500">
          {t.loading}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
