import { useSyncExternalStore } from 'react';
import { storySettingsStore, type StorySettings } from '../logic/storySettings';

// React subscriptions live in the UI layer; the settings store remains framework-independent.
export function useStorySettings(): { settings: StorySettings | null; save: (settings: StorySettings) => void } {
  const settings = useSyncExternalStore(storySettingsStore.subscribe, storySettingsStore.read, () => null);
  return { settings, save: storySettingsStore.write };
}
