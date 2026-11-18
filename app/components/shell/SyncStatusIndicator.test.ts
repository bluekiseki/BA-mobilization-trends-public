// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SyncStatusLine } from './SyncStatusIndicator';
import { useSyncStore } from '~/store/syncStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ko' } }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useSyncStore.getState().clearAccountData();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  useSyncStore.getState().clearAccountData();
  vi.unstubAllGlobals();
});

it('replaces the old synced time with a waiting label as soon as an edit is queued', () => {
  useSyncStore.setState({ currentProfileId: 'profile-1', isInitialized: true, status: 'synced', lastModifiedAt: Date.now() - 180_000 });
  act(() => root.render(createElement(SyncStatusLine)));
  expect(container.textContent).toContain('profiles.synced');
  act(() => useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} }));
  expect(container.textContent).toBe('profiles.syncPending');
});
