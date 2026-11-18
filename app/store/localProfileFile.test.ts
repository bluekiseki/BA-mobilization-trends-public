// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importLocalProfile, parseLocalProfileFile } from './localProfileFile.client';
import { useSyncWatcher } from './planner/useSyncWatcher';
import { useGlobalStore } from './planner/useGlobalStore';
import { useEquipmentPlanStore } from './planner/useEquipmentPlanStore';
import { useSyncStore } from './syncStore';
import { useAuthStore } from './authStore';
import { editHistory } from './history/history';
import { replayLocalHistory } from './history/actions';
import { readLocalProfile } from './history/profileSnapshot';

let root: Root;
function Harness() {
  useSyncWatcher();
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  useAuthStore.getState().logout();
  useSyncStore.getState().clearAccountData();
  root = createRoot(document.createElement('div'));
  act(() => {
    root.render(createElement(Harness));
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  useSyncStore.getState().clearAccountData();
  editHistory.clear();
  vi.unstubAllGlobals();
});

describe('local planner file import', () => {
  it('imports store and storage data as one undoable step and supports redo', () => {
    const before = useGlobalStore.getState().ownedGifts;
    const values = parseLocalProfileFile(
      JSON.stringify({
        data: {
          growthPlans: { growthPlans: [], ownedGifts: { gift: 42 }, materialInventory: {} },
          equipmentPlan: { runCounts: { stage: 5 } },
          gacha_prefs: { server: 'JP' },
        },
      }),
    );
    importLocalProfile(values);
    expect(editHistory.entries).toHaveLength(1);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 42 });
    expect(useEquipmentPlanStore.getState().runCounts).toEqual({ stage: 5 });
    expect(readLocalProfile().get('gacha_prefs')).toEqual({ server: 'JP' });
    replayLocalHistory('undo');
    expect(useGlobalStore.getState().ownedGifts).toEqual(before);
    expect(useEquipmentPlanStore.getState().runCounts).toEqual({});
    expect(readLocalProfile().has('gacha_prefs')).toBe(false);
    expect(editHistory.cursor).toBe(0);
    replayLocalHistory('redo');
    expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 42 });
    expect(readLocalProfile().get('gacha_prefs')).toEqual({ server: 'JP' });
    expect(editHistory.cursor).toBe(1);
  });

  it('validates the whole file before applying and strips store method names', () => {
    expect(() =>
      parseLocalProfileFile(
        JSON.stringify({
          data: {
            equipmentPlan: { runCounts: { stage: 5 } },
            raidHistory: { entries: 'invalid' },
          },
        }),
      ),
    ).toThrow();
    expect(useEquipmentPlanStore.getState().runCounts).toEqual({});
    const values = parseLocalProfileFile(
      JSON.stringify({
        data: {
          growthPlans: { growthPlans: [], resetAll: 'invalid', ownedGifts: {} },
          theme: 'dark',
          session: 'secret',
        },
      }),
    );
    expect(values.size).toBe(1);
    expect(values.get('growthPlans')).toEqual({ growthPlans: [], ownedGifts: {} });
    expect(() => parseLocalProfileFile('{"data":[]}')).toThrow();
  });
});
