import { useSyncExternalStore, type ReactNode } from 'react';
import {
  getPersistenceConflicts,
  hasPersistenceConflicts,
  hasPersistenceFailures,
  hasPersistenceReadFailures,
  persistenceRevision,
  retryLocalPersistence,
  subscribePersistence,
} from '~/store/history/localPersistence';
import { useTranslation } from 'react-i18next';
import { LuRefreshCw } from 'react-icons/lu';
import { SYNC_STALE_BUTTON_MS, useSyncStore } from '~/store/syncStore';
import { useIsStale, useRelativeTime } from '~/hooks/useRelativeTime';
import type { Locale } from '~/utils/i18n/config';

function useConflictCount() {
  const serverCount = useSyncStore((state) => Object.keys(state.conflicts).length);
  useSyncExternalStore(subscribePersistence, persistenceRevision, () => 0);
  return serverCount + getPersistenceConflicts().length;
}

/**
 * Small colored dot for a collapsed trigger (account icon / hamburger button).
 * Only shown when there is something worth surfacing without a click: a sync
 * error, or data that has never synced. Transient "syncing" is intentionally
 * ignored to avoid flicker. The parent element must be `position: relative`.
 */
export function SyncStatusDot() {
  const { t } = useTranslation('auth', { keyPrefix: 'settings' });
  const status = useSyncStore((s) => s.status);
  const isInitialized = useSyncStore((s) => s.isInitialized);
  const conflictCount = useConflictCount();

  if (conflictCount > 0) {
    return (
      <span
        className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:bg-red-500 dark:ring-neutral-800"
        title={t('profiles.syncConflictCount', { count: conflictCount })}
      >
        {conflictCount > 9 ? '9+' : conflictCount}
      </span>
    );
  }

  const color = status === 'error' ? 'bg-red-500' : !isInitialized && status === 'idle' ? 'bg-amber-500' : null;

  if (!color) return null;

  return <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-neutral-800 ${color}`} title={status === 'error' ? t('profiles.syncError') : undefined} />;
}

/** One-line sync status for a panel: "Synced · 3 minutes ago" / "Syncing…" / "Sync error". */
export function SyncStatusLine() {
  const { t, i18n } = useTranslation('auth', { keyPrefix: 'settings' });
  const locale = i18n.language as Locale;

  const status = useSyncStore((s) => s.status);
  const isInitialized = useSyncStore((s) => s.isInitialized);
  const lastModifiedAt = useSyncStore((s) => s.lastModifiedAt);
  const pendingCount = useSyncStore((s) => s.pendingKeys.size);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const conflictCount = useConflictCount();
  const rejected = useSyncStore((s) => s.rejected);
  const relative = useRelativeTime(lastModifiedAt, locale);
  const isStale = useIsStale(lastSyncedAt, SYNC_STALE_BUTTON_MS);

  let text: string | null = null;
  let tone = 'text-neutral-500 dark:text-neutral-400';
  let icon: ReactNode = null;

  if (conflictCount > 0) {
    text = t('profiles.syncConflictCount', { count: conflictCount });
    tone = 'text-red-600 dark:text-red-400';
  } else if (status === 'syncing') {
    text = t('profiles.syncing');
    tone = 'text-blue-600 dark:text-blue-400';
    icon = <LuRefreshCw className="animate-spin" size={11} />;
  } else if (status === 'error') {
    text = t('profiles.syncError');
    tone = 'text-red-600 dark:text-red-400';
  } else if (pendingCount > 0) {
    text = t('profiles.syncPending');
  } else if (!isInitialized) {
    text = t('profiles.notSynced');
  } else if (status === 'synced' || lastModifiedAt != null) {
    text = relative ? `${t('profiles.synced')} · ${relative}` : t('profiles.synced');
  }

  if (!text) return null;

  const rejectedKeys = Object.keys(rejected);

  return (
    <>
      <p className={`text-xs ${tone} flex items-center gap-1.5`}>
        {icon}
        {text}
        {status === 'error' && (
          <button type="button" onClick={() => void useSyncStore.getState().forceSync()} className="font-medium underline decoration-dotted hover:no-underline">
            {t('profiles.forceSync')}
          </button>
        )}
        {status === 'synced' && isStale && (
          <button type="button" onClick={() => void useSyncStore.getState().pullAll()} className="font-medium underline decoration-dotted hover:no-underline">
            {t('profiles.forceSync')}
          </button>
        )}
      </p>
      {rejectedKeys.length > 0 && (
        <p className="text-xs text-red-600 dark:text-red-400" title={Object.values(rejected).join('\n')}>
          {t('profiles.syncRejected', { keys: rejectedKeys.join(', ') })}
        </p>
      )}
    </>
  );
}

/** Device persistence and remote acknowledgement are independent states. */
export function EditingSaveStatus({ localOnly = false, className = '' }: { localOnly?: boolean; className?: string }) {
  const { t } = useTranslation();
  const profileId = useSyncStore((state) => state.currentProfileId);
  const status = useSyncStore((state) => state.status);
  const pending = useSyncStore((state) => state.pendingKeys.size);
  const initialized = useSyncStore((state) => state.isInitialized);
  const conflicts = useSyncStore((state) => Object.keys(state.conflicts).length);
  const rejected = useSyncStore((state) => Object.keys(state.rejected).length);
  useSyncExternalStore(subscribePersistence, persistenceRevision, () => 0);
  const localFailure = hasPersistenceFailures();
  const localConflict = hasPersistenceConflicts();
  const label = conflicts ? 'serverConflict' : status === 'error' || rejected ? 'serverError' : status === 'syncing' ? 'serverSaving' : pending || !initialized ? 'serverPending' : 'serverSaved';
  if (localOnly && !localFailure) return null;
  return (
    <div className={`space-y-1 text-xs leading-relaxed ${className}`} aria-live="polite">
      <p hidden={!!profileId && !localFailure} className={localFailure ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'}>
        {localConflict
          ? t('auth:settings.profiles.syncConflictCount', { count: getPersistenceConflicts().length })
          : t(hasPersistenceReadFailures() ? 'ui:history.storageReadError' : localFailure ? 'ui:history.storageError' : 'ui:history.deviceSaved')}
        {localFailure && !localConflict && (
          <>
            {' '}
            ·{' '}
            <button type="button" className="underline underline-offset-2" onClick={retryLocalPersistence}>
              {t('ui:history.retry')}
            </button>
          </>
        )}
      </p>
      {!localOnly && profileId && (
        <p className={label === 'serverError' || conflicts ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'}>
          {label === 'serverError' && !localFailure && <>{t('ui:history.deviceSaved')} · </>}
          {t(`ui:history.${label}`)}
          {label === 'serverError' && (
            <>
              {' '}
              ·{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => void useSyncStore.getState().forceSync()}>
                {t('ui:history.retry')}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
