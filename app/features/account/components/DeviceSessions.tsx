import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/common/ConfirmDialog';
import { describeUserAgent } from '~/features/account/logic/userAgent';
import { getRelativeTime } from '~/utils/time';
import type { Locale } from '~/utils/i18n/config';

interface DeviceSession {
  userAgent: string | null;
  createdAt: number | string;
  updatedAt: number | string;
  current: boolean;
}

// D1 returns either ISO text or epoch numbers depending on the column; normalize to epoch ms.
function toEpochMs(value: number | string): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

export function DeviceSessions() {
  const { t, i18n } = useTranslation('auth');
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth-ext?op=list-sessions', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { sessions: DeviceSession[] } = await res.json();
      setSessions(data.sessions);
      setError('');
    } catch {
      setError(t('settings.devices.failed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOthers = async () => {
    setConfirmOpen(false);
    setRevoking(true);
    try {
      const res = await fetch('/api/auth/revoke-other-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      setError(t('settings.devices.failedRevoke'));
    } finally {
      setRevoking(false);
    }
  };

  if (!sessions && !error) return null;

  const locale = i18n.language as Locale;
  const hasOthers = sessions?.some((session) => !session.current) ?? false;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">{t('settings.devices.title')}</h2>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {sessions && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {sessions.map((session, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900 dark:text-white truncate" title={describeUserAgent(session.userAgent) ?? t('settings.devices.unknown')}>
                  {describeUserAgent(session.userAgent) ?? t('settings.devices.unknown')}
                  {session.current && <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">{t('settings.devices.current')}</span>}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t('settings.devices.loginAt')} {new Date(toEpochMs(session.createdAt)).toLocaleDateString(locale)}
                </p>
              </div>
              <p className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                {t('settings.devices.lastActive')} {getRelativeTime(toEpochMs(session.updatedAt), locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {hasOthers && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={revoking}
          className="w-full py-2 px-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition disabled:opacity-50"
        >
          {t('settings.devices.signOutOthers')}
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        message={t('settings.devices.confirm')}
        confirmLabel={t('settings.devices.yes')}
        cancelLabel={t('settings.devices.no')}
        danger
        onConfirm={() => void revokeOthers()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
