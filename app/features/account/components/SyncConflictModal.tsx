import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuDownload, LuTriangleAlert } from 'react-icons/lu';
import { useSyncStore } from '~/store/syncStore';
import { downloadFile } from '~/utils/downloadFile';
import { getConflictStats, type ConflictStatKey } from '~/utils/profileDataStats';
import { getRelativeTime } from '~/utils/time';
import type { Locale } from '~/utils/i18n/config';

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
  const conflicts = Object.values(conflictsByKey);
  const conflict = conflicts[0];
  const [sizes, setSizes] = useState<{ key: string; server: PayloadSize; local: PayloadSize } | null>(null);

  useEffect(() => {
    if (!conflict) return;
    let cancelled = false;
    Promise.all([measurePayload(conflict.serverValue), measurePayload(conflict.localValue)])
      .then(([server, local]) => {
        if (!cancelled) setSizes({ key: conflict.key, server, local });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conflict?.key, conflict?.serverValue, conflict?.localValue]);

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
  }, [conflict?.key]);

  if (!conflict || typeof document === 'undefined') return null;

  const statLabels: Record<Exclude<ConflictStatKey, 'inventoryTotal'>, string> = {
    students: t('settings.profiles.stats.students'),
    equipmentPlans: t('settings.profiles.stats.equipmentPlans'),
    resourceGoals: t('settings.profiles.stats.resourceGoals'),
    gachaStrategies: t('settings.profiles.stats.gachaStrategies'),
    gachaRecords: t('settings.profiles.stats.gachaRecords'),
    eventPlans: t('settings.profiles.stats.eventPlans'),
    raidRecords: t('settings.profiles.stats.raidRecords'),
  };

  const formatSummary = (value: unknown): string => {
    const summaries = getConflictStats(conflict.key, value).map((stat) => {
      const formattedValue = stat.value.toLocaleString(i18n.language);
      return stat.key === 'inventoryTotal' ? t('settings.profiles.stats.inventory', { total: formattedValue }) : `${statLabels[stat.key]} ${formattedValue}`;
    });
    return summaries.length > 0 ? summaries.join(' · ') : conflict.key;
  };

  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return t('settings.profiles.conflictTimeUnknown');
    return t('settings.profiles.conflictUpdated', { time: getRelativeTime(timestamp, i18n.language as Locale) });
  };

  const formatKb = (bytes: number): string => `${(bytes / 1024).toLocaleString(i18n.language, { maximumFractionDigits: bytes < 10240 ? 1 : 0 })} KB`;

  const formatSize = (side: 'server' | 'local'): string | null => {
    if (!sizes || sizes.key !== conflict.key) return null;
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
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{t('settings.profiles.serverVersion')}</h3>
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
              onClick={() => resolveConflict(conflict.key, 'server')}
              className="w-full border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {t('settings.profiles.useThisVersion')}
            </button>
          </section>

          <section className="space-y-3 p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{t('settings.profiles.deviceVersion')}</h3>
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
              onClick={() => resolveConflict(conflict.key, 'local')}
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
