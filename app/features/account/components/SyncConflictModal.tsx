import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuDownload, LuTriangleAlert } from 'react-icons/lu';
import { useSyncStore } from '~/store/syncStore';
import { downloadFile } from '~/utils/downloadFile';
import { profileSummary, storageProfileSummary } from '~/utils/profileDataComparison';
import { getRelativeTime } from '~/utils/time';
import type { Locale } from '~/utils/i18n/config';

import { getPersistenceConflicts, persistenceRevision, resolvePersistenceConflicts, subscribePersistence } from '~/store/history/localPersistence';

function parseStoredValue(raw: string | null | undefined): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

interface PayloadSize {
  raw: number;
  gzip: number | null;
}

// Byte size of whitespace-free JSON, plus its gzip size when CompressionStream is available.
async function measurePayload(value: unknown): Promise<PayloadSize> {
  const bytes = new TextEncoder().encode(JSON.stringify(value) ?? '');
  if (typeof CompressionStream === 'undefined') return { raw: bytes.length, gzip: null };
  const compressed = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return { raw: bytes.length, gzip: compressed.byteLength };
}

export function SyncConflictModal() {
  const { t, i18n } = useTranslation('auth');
  const conflictsByKey = useSyncStore((state) => state.conflicts);
  const resolveConflict = useSyncStore((state) => state.resolveConflict);
  const serverButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const persistenceVersion = useSyncExternalStore(subscribePersistence, persistenceRevision, () => 0);
  const tabConflicts = useMemo(
    () =>
      getPersistenceConflicts().map((entry) => ({
        ...entry,
        source: 'tab' as const,
        id: `tab:${entry.key}`,
        serverValue: parseStoredValue(entry.remoteValue),
        localValue: parseStoredValue(entry.localValue),
        serverUpdatedAt: null,
        localUpdatedAt: null,
      })),
    [persistenceVersion],
  );
  // Resolve device writes first so an old failed draft cannot replace a chosen server version.
  const conflicts = [...tabConflicts, ...Object.values(conflictsByKey).map((entry) => ({ ...entry, source: 'server' as const, id: `server:${entry.key}` }))];
  const conflict = conflicts[0];
  const [sizes, setSizes] = useState<{ key: string; server: PayloadSize; local: PayloadSize } | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!conflict) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [conflict?.id]);

  useEffect(() => {
    if (!conflict) return;
    let cancelled = false;
    Promise.all([measurePayload(conflict.serverValue), measurePayload(conflict.localValue)])
      .then(([server, local]) => {
        if (!cancelled) setSizes({ key: conflict.id, server, local });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conflict?.id, conflict?.serverValue, conflict?.localValue]);

  useEffect(() => {
    if (!conflict) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    serverButtonRef.current?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons || buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keepFocusInside);
    };
  }, [conflict?.id]);

  if (!conflict || typeof document === 'undefined') return null;

  const formatSummary = (value: unknown): string => (conflict.source === 'tab' ? storageProfileSummary : profileSummary)(conflict.key, value, t, i18n.language) || conflict.key;

  const selectVersion = (side: 'server' | 'local') => {
    if (conflict.source === 'tab') resolvePersistenceConflicts(side === 'server' ? 'remote' : 'local', conflict.key, conflict.remoteValue);
    else resolveConflict(conflict.key, side);
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return t('settings.profiles.conflictTimeUnknown');
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
    const relative = seconds < 60 ? new Intl.RelativeTimeFormat(i18n.language, { numeric: 'always' }).format(-seconds, 'second') : getRelativeTime(timestamp, i18n.language as Locale);
    const date = new Date(timestamp);
    const exact = date.toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'medium' });
    return (
      <time dateTime={date.toISOString()} title={exact}>
        {t('settings.profiles.conflictUpdated', { time: relative })}
        <span className="mt-0.5 block tabular-nums">{exact}</span>
      </time>
    );
  };

  const formatKb = (bytes: number): string => `${(bytes / 1024).toLocaleString(i18n.language, { maximumFractionDigits: bytes < 10240 ? 1 : 0 })} KB`;

  const formatSize = (side: 'server' | 'local'): string | null => {
    if (!sizes || sizes.key !== conflict.id) return null;
    const size = sizes[side];
    return size.gzip === null ? formatKb(size.raw) : `${formatKb(size.raw)} · gzip ${formatKb(size.gzip)}`;
  };

  const handleDownload = (value: unknown, side: 'server' | 'local') => {
    downloadFile(JSON.stringify(value, null, 2), `${conflict.key}-${side}.json`);
  };

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-neutral-950/60 p-3 font-ba">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sync-conflict-title"
        aria-describedby="sync-conflict-description"
        className="w-full max-w-lg border border-amber-300 bg-white dark:border-amber-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-start gap-2">
            <LuTriangleAlert className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} />
            <div>
              <h2 id="sync-conflict-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {t('settings.profiles.syncConflictCount', { count: conflicts.length })}
              </h2>
              <p id="sync-conflict-description" className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {t('settings.profiles.syncConflict')}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">1 / {conflicts.length}</span>
        </div>

        <div className="grid divide-y divide-neutral-200 dark:divide-neutral-700 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <section className="space-y-3 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {t(conflict.source === 'tab' ? 'settings.profiles.otherTabVersion' : 'settings.profiles.serverVersion')}
                </h3>
                <button
                  type="button"
                  onClick={() => handleDownload(conflict.serverValue, 'server')}
                  aria-label={t('common.save')}
                  title={t('common.save')}
                  className="shrink-0 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  <LuDownload size={16} />
                </button>
              </div>
              <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">{formatSummary(conflict.serverValue)}</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{formatTime(conflict.serverUpdatedAt)}</p>
              {formatSize('server') && <p className="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{formatSize('server')}</p>}
            </div>
            <button
              ref={serverButtonRef}
              type="button"
              onClick={() => selectVersion('server')}
              disabled={conflict.source === 'tab' && conflict.remoteValue === undefined}
              className="w-full disabled:cursor-not-allowed disabled:opacity-50 border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {t('settings.profiles.useThisVersion')}
            </button>
          </section>

          <section className="space-y-3 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {t(conflict.source === 'tab' ? 'settings.profiles.thisTabVersion' : 'settings.profiles.deviceVersion')}
                </h3>
                <button
                  type="button"
                  onClick={() => handleDownload(conflict.localValue, 'local')}
                  aria-label={t('common.save')}
                  title={t('common.save')}
                  className="shrink-0 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  <LuDownload size={16} />
                </button>
              </div>
              <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">{formatSummary(conflict.localValue)}</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{formatTime(conflict.localUpdatedAt)}</p>
              {formatSize('local') && <p className="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{formatSize('local')}</p>}
            </div>
            <button
              type="button"
              onClick={() => selectVersion('local')}
              className="w-full bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {t('settings.profiles.useThisVersion')}
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
