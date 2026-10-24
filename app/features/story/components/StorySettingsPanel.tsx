import { useEffect, useRef, useState } from 'react';
import { SERVER_LABELS, SERVERS } from '../logic/releaseDates';
import type { StorySettings } from '../logic/storySettings';
import { LANG_LABELS } from '../logic/storyIndex';
import { STORY_LANGS, type StoryLang } from '../logic/types';
import { storyChipClass, storyButtonClass } from './StorySections';

interface StorySettingsPanelProps {
  lang: StoryLang;
  onLang: (lang: StoryLang) => void;
  initial: StorySettings;
  onSave: (settings: StorySettings) => void;
  onCancel?: () => void;
}

// Asked in a modal before the stories are used, because summaries and images give away the plot. The first time it cannot be dismissed.
export function StorySettingsPanel({ lang, onLang, initial, onSave, onCancel }: StorySettingsPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [language, setLanguage] = useState(lang);
  const [server, setServer] = useState(initial.server);
  const [spoilers, setSpoilers] = useState(initial.spoilers);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const choice = (label: string, active: boolean, pick: () => void) => (
    <button key={label} type="button" role="radio" aria-checked={active} onClick={pick} className={storyChipClass(active)}>
      {label}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="story-settings-title"
      onCancel={(event) => {
        // Escape closes it only when there is a choice to fall back on.
        event.preventDefault();
        onCancel?.();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border border-neutral-300 bg-white p-6 text-neutral-900 backdrop:bg-neutral-900/40 backdrop:backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          onLang(language);
          onSave({ server, spoilers });
        }}
      >
        <h2 id="story-settings-title" className="text-lg font-bold">
          Before you start
        </h2>
        <div className="flex flex-col gap-2">
          <p id="story-setting-language" className="text-sm font-semibold">
            Story language
          </p>
          <div role="radiogroup" aria-labelledby="story-setting-language" className="flex flex-wrap gap-2">
            {STORY_LANGS.map((value) => choice(LANG_LABELS[value], language === value, () => setLanguage(value)))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p id="story-setting-server" className="text-sm font-semibold">
            Choose the server to use as the display reference.
          </p>
          <div role="radiogroup" aria-labelledby="story-setting-server" className="flex flex-wrap gap-2">
            {SERVERS.map((value) => choice(SERVER_LABELS[value], server === value, () => setServer(value)))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p id="story-setting-spoilers" className="text-sm font-semibold">
            Thumbnails and summaries
          </p>
          <div role="radiogroup" aria-labelledby="story-setting-spoilers" className="flex flex-wrap gap-2">
            {choice('Hide', !spoilers, () => setSpoilers(false))}
            {choice('Show', spoilers, () => setSpoilers(true))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded bg-ba-btn-blue px-6 py-2 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark"
          >
            Start
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className={storyButtonClass}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
