// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSyncWatcher } from './useSyncWatcher';
import { useEventPlanStore } from './useEventPlanStore';
import { useSyncStore, applyWithoutSyncPush } from '../syncStore';
import { editHistory } from '../history/history';

let root: Root;
function Harness() {
  useSyncWatcher();
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  useSyncStore.getState().clearAccountData();
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  useSyncStore.getState().clearAccountData();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('saves continuous event input every minute and updates the server modification time', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  let revision = 1;
  const savedAt: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a GraphQL request body');
      const request = JSON.parse(init.body) as { query: string };
      const now = Math.floor(Date.now() / 1000);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(Response.json({ data: { profileAllData: [{ key: 'eventPlans:1', value: { ownedCurrency: { 100: 0 } }, revision, schemaVersion: 1, updatedAt: now }] } }));
      }
      savedAt.push(Date.now());
      return Promise.resolve(Response.json({ data: { syncProfileData: [{ key: 'eventPlans:1', status: 'APPLIED', revision: ++revision, updatedAt: now }] } }));
    }),
  );
  useSyncStore.setState({ currentProfileId: 'profile-1' });
  await useSyncStore.getState().pullAll();
  act(() => {
    root.render(createElement(Harness));
  });
  const startedAt = Date.now();
  for (let count = 1; count <= 36; count++) {
    act(() => {
      useEventPlanStore.getState().setOwnedCurrency(1, { 100: count });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
  }
  expect(savedAt.map((time) => time - startedAt)).toEqual([60_000, 120_000, 180_000]);
  expect(useSyncStore.getState().lastModifiedAt).toBe(Date.now());
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(useSyncStore.getState().status).toBe('synced');
});

it('does not treat automatic calculations in a read-only tab as edits or sync writes', () => {
  const push = vi.spyOn(useSyncStore.getState(), 'push');
  act(() => {
    root.render(createElement(Harness));
  });
  const cache = { savedAt: 1, gained: {}, spent: {}, availableAp: 100 };
  useEventPlanStore.getState().setCachedTotalItems(1, cache);
  expect(push).not.toHaveBeenCalled();
  expect(editHistory.entries).toHaveLength(0);

  applyWithoutSyncPush(() => useEventPlanStore.setState({ plans: { '1': { selectedStudents: ['10'] } } }));
  push.mockClear();
  useEventPlanStore.getState().setCachedTotalItems(1, { ...cache, savedAt: 2 });
  expect(push).not.toHaveBeenCalled();
  expect(editHistory.entries).toHaveLength(0);

  useEventPlanStore.getState().setOwnedCurrency(1, { 100: 5 });
  editHistory.commit();
  expect(push).toHaveBeenCalledExactlyOnceWith('eventPlans:1', { selectedStudents: ['10'], ownedCurrency: { 100: 5 } });
  expect(editHistory.entries).toHaveLength(1);
});
