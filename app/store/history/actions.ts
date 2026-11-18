import type { ProfileDataKey } from '~/schemas/profileDataValidation';
import { applyProfileData, applyWithoutSyncPush, useSyncStore } from '../syncStore';
import { editHistory } from './history';

export function replayLocalHistory(direction: 'undo' | 'redo') {
  editHistory.replay(
    direction,
    (key, value) => applyWithoutSyncPush(() => applyProfileData(key, value)),
    (key, value, version) => useSyncStore.getState().push(key as ProfileDataKey, value, version),
  );
}

export function selectLocalHistory(cursor: number) {
  editHistory.endGroup();
  if (cursor < 0 || cursor > editHistory.entries.length) return;
  while (editHistory.cursor !== cursor) {
    const previous = editHistory.cursor;
    replayLocalHistory(cursor < previous ? 'undo' : 'redo');
    if (editHistory.cursor === previous || !editHistory.entries.length) break;
  }
}
