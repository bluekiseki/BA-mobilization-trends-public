import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { profileHistoryFingerprint } from '~/utils/profileHistoryFingerprint';
import { gqlFetch } from '~/utils/gqlFetch';
import { localeLink } from '~/utils/localeLink';
import { useSyncStore } from '~/store/syncStore';
import { useAuthStore } from '~/store/authStore';
import { editHistory } from '~/store/history/history';
import { readLocalProfile } from '~/store/history/profileSnapshot';
import { compareProfileValues, profileSummary, sameProfileValue } from '~/utils/profileDataComparison';

interface Point {
  disabled?: boolean;
  recordedAt: number;
  before: number | null;
  keys: string[] | null;
}
interface Value {
  key: string;
  value: unknown;
  schemaVersion: number;
}
const OPEN_HISTORY = 'open-profile-history';
export const openProfileHistory = () => window.dispatchEvent(new Event(OPEN_HISTORY));
const button = 'min-h-10 rounded-sm px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800';

export function ProfileHistory() {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={openProfileHistory} className={`${button} w-full text-left`}>
      {t('ui:history.versions')}
    </button>
  );
}

export function ProfileHistoryDialog() {
  const { t, i18n } = useTranslation();
  const profileId = useSyncStore((state) => state.currentProfileId);
  const conflictCount = useSyncStore((state) => Object.keys(state.conflicts).length);
  const user = useAuthStore((state) => state.user);
  const profile = user?.profiles?.find((item) => item.id === profileId);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [values, setValues] = useState<Value[]>([]);
  const [baseline, setBaseline] = useState(new Map<string, unknown>());
  const [keys, setKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [completion, setCompletion] = useState<{ at: number; point: Point; labels: string } | null>(null);
  const requestId = useRef('');
  const fingerprint = useRef('');
  const operation = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const keyLabel = (key: string) => (key.startsWith('eventPlans:') ? t('ui:history.event', { id: key.slice(11) }) : t(`ui:history.groups.${key}`, { defaultValue: key }));
  const date = (at: number) => new Date(at).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  const load = useCallback(async (id: string, before?: number) => {
    const result = await gqlFetch<{ profileHistory: Point[] }>('query($id:ID!,$before:Float){profileHistory(id:$id,before:$before){recordedAt disabled before keys}}', { id, before });
    return result.profileHistory;
  }, []);
  useEffect(() => {
    const show = () => {
      if (!busyRef.current) setOpen(true);
    };
    window.addEventListener(OPEN_HISTORY, show);
    return () => window.removeEventListener(OPEN_HISTORY, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const token = ++operation.current;
    setSelected(null);
    setKeys([]);
    setValues([]);
    setStale(false);
    setCompletion(null);
    setPoints([]);
    setLoaded(false);
    setError('');
    setBusy(false);
    busyRef.current = false;
    if (!profileId) return;
    setBusy(true);
    busyRef.current = true;
    void load(profileId)
      .then((items) => {
        if (token !== operation.current) return;
        setPoints(items);
        setHasMore(items.length === 20);
        setLoaded(true);
      })
      .catch(() => {
        if (token === operation.current) setError(t('ui:history.loadError'));
      })
      .finally(() => {
        if (token === operation.current) {
          setBusy(false);
          busyRef.current = false;
        }
      });
    return () => {
      operation.current++;
      busyRef.current = false;
    };
  }, [open, profileId, load, t]);
  useEffect(() => {
    if (!open || conflictCount) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary');
      const first = elements?.[0];
      const last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open, conflictCount]);
  useEffect(() => {
    if (!selected) return;
    const invalidate = () => {
      if (!sameProfileValue(Object.fromEntries(baseline), Object.fromEntries(readLocalProfile()))) {
        setStale(true);
      }
    };
    const unsubscribeHistory = editHistory.subscribe(invalidate);
    const unsubscribeSync = useSyncStore.subscribe((state, previous) => {
      invalidate();
      if (!sameProfileValue(state.revisions, previous.revisions)) {
        setStale(true);
      }
    });
    return () => {
      unsubscribeHistory();
      unsubscribeSync();
    };
  }, [baseline, selected]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const token = operation.current;
    try {
      await action();
    } catch (cause) {
      if (token === operation.current) setError(cause instanceof Error && cause.message.startsWith('UI:') ? cause.message.slice(3) : t('ui:history.operationError'));
    } finally {
      if (token === operation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const preview = async (at: number, preselect: string[] = []) => {
    const token = operation.current;
    const response = await gqlFetch<{ profileHistoryPreview: Value[] }>('query($id:ID!,$at:Float!){profileHistoryPreview(id:$id,at:$at){key value schemaVersion}}', { id: profileId, at });
    const hash = await profileHistoryFingerprint(response.profileHistoryPreview);
    if (token !== operation.current) return;
    fingerprint.current = hash;
    setValues(response.profileHistoryPreview);
    setBaseline(readLocalProfile());
    setSelected(at);
    setKeys(preselect.filter((key) => !sameProfileValue(readLocalProfile().get(key) ?? null, response.profileHistoryPreview.find((value) => value.key === key)?.value ?? null)));
    setStale(false);
    requestId.current = crypto.randomUUID();
  };
  const restore = async () => {
    if (!profileId || !selected || stale || !keys.length) return;
    const token = operation.current;
    const expected = Object.fromEntries(baseline);
    const unchanged = () => sameProfileValue(expected, Object.fromEntries(readLocalProfile()));
    if (!unchanged()) {
      setStale(true);
      return;
    }
    const oldRevisions = { ...useSyncStore.getState().revisions };
    const pending = new Set(useSyncStore.getState().pendingKeys);
    await useSyncStore.getState().forceSync();
    const state = useSyncStore.getState();
    if (state.currentProfileId !== profileId || token !== operation.current) return;
    if (state.pendingKeys.size || state.error || state.isPulling || Object.keys(state.conflicts).length || Object.keys(state.rejected).length || !state.isInitialized)
      throw new Error(`UI:${t('ui:history.pending')}`);
    if (!unchanged() || Object.keys(state.revisions).some((key) => !pending.has(key) && state.revisions[key] !== oldRevisions[key])) {
      setStale(true);
      return;
    }
    const response = await gqlFetch<{ restoreProfileHistory: number }>(
      'mutation($id:ID!,$at:Float!,$revisions:[HistoryRevision!]!,$requestId:String!,$fingerprint:String!){restoreProfileHistory(profileId:$id,at:$at,revisions:$revisions,requestId:$requestId,fingerprint:$fingerprint)}',
      { id: profileId, at: selected, revisions: keys.map((key) => ({ key, revision: state.revisions[key] ?? 0 })), requestId: requestId.current, fingerprint: fingerprint.current },
    );
    if (token !== operation.current) return;
    editHistory.clear();
    const pulled = await useSyncStore.getState().pullAll();
    if (!pulled) throw new Error(`UI:${t('ui:history.appliedRefreshError')}`);
    const items = await load(profileId);
    setPoints(items);
    setHasMore(items.length === 20);
    const point = items.find((item) => item.recordedAt === response.restoreProfileHistory);
    if (point) setCompletion({ at: selected, point, labels: keys.map(keyLabel).join(' · ') });
    setSelected(null);
    setKeys([]);
  };
  if (!open || typeof document === 'undefined' || conflictCount > 0) return null;
  const target = new Map(values.map((value) => [value.key, value.value]));
  const rows = Array.from(new Set([...baseline.keys(), ...target.keys()]))
    .filter((key) => baseline.has(key))
    .map((key) => ({ key, ...compareProfileValues(baseline.get(key) ?? null, target.get(key) ?? null) }));
  // Historical-only supported keys must also be available for restoration.
  for (const key of target.keys())
    if (!baseline.has(key) && (key.startsWith('eventPlans:') || key === 'gacha_prefs' || key === 'gacha_strategies')) rows.push({ key, ...compareProfileValues(null, target.get(key)) });
  const changedRows = rows.filter((row) => !row.same);
  const unchangedRows = rows.filter((row) => row.same);
  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) setOpen(false);
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-history-title"
        aria-busy={busy}
        className="flex h-dvh w-full flex-col bg-white text-neutral-900 sm:h-[32rem] sm:max-h-[85dvh] sm:w-[48rem] sm:border sm:border-neutral-300 dark:bg-neutral-900 dark:text-neutral-100 dark:sm:border-neutral-600"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <div>
            <h2 id="profile-history-title" className="text-base font-semibold">
              {t('ui:history.versions')}
            </h2>
            {profile && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {profile.name} · {profile.server.toUpperCase()}
              </p>
            )}
          </div>
          <button
            ref={closeButton}
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="-mr-2 rounded-sm p-2 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
            aria-label={t('ui:history.close')}
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </header>
        {!user || !profileId ? (
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t('ui:history.login')}</p>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{t('ui:history.loginDetail')}</p>
            <Link
              to={localeLink(i18n.language, '/login')}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-10 items-center rounded-sm bg-ba-btn-blue px-4 text-sm font-medium text-neutral-900"
            >
              {t('ui:history.signIn')}
            </Link>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {completion && (
                <div role="status" className="mx-5 mb-4 border-l-2 border-green-500 pl-3 text-sm">
                  <p>{t('ui:history.completed', { groups: completion.labels, time: date(completion.at) })}</p>
                  {completion.point.before && (
                    <button
                      className={`${button} mt-1 -ml-3 underline underline-offset-4`}
                      disabled={busy || !points.some((point) => point.recordedAt === completion.point.before)}
                      onClick={() =>
                        void run(async () => {
                          if (completion.point.before !== null) await preview(completion.point.before, completion.point.keys ?? []);
                        })
                      }
                    >
                      {t('ui:history.cancelRestore')}
                    </button>
                  )}
                  {completion.point.before && !points.some((point) => point.recordedAt === completion.point.before) && <p className="text-xs text-neutral-500">{t('ui:history.expired')}</p>}
                </div>
              )}
              <div className="min-h-full sm:grid sm:grid-cols-[13rem_1fr]">
                <section aria-label={t('ui:history.timeline')} className="border-b border-neutral-200 sm:border-b-0 sm:border-r dark:border-neutral-800">
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('ui:history.timeline')}</h3>
                    <button
                      className={`${button} px-1 text-xs`}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const items = await load(profileId);
                          setPoints(items);
                          setHasMore(items.length === 20);
                          setLoaded(true);
                          if (selected) await preview(selected);
                        })
                      }
                    >
                      {t('ui:history.refresh')}
                    </button>
                  </div>
                  {!loaded && busy && (
                    <p role="status" className="px-3 py-2 text-sm text-neutral-500">
                      {t('ui:history.loading')}
                    </p>
                  )}
                  {loaded && !points.length && <p className="px-3 py-2 text-sm text-neutral-500">{t('ui:history.empty')}</p>}
                  <ul className="flex overflow-x-auto sm:block sm:overflow-visible">
                    {points.map((point) => (
                      <li key={point.recordedAt} className="min-w-36 sm:min-w-0">
                        <button
                          disabled={busy || point.disabled}
                          aria-pressed={selected === point.recordedAt}
                          onClick={() => void run(() => preview(point.recordedAt))}
                          className={`w-full border-l-2 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800 ${selected === point.recordedAt ? 'border-ba-btn-blue bg-neutral-100 dark:bg-neutral-800' : 'border-transparent'}`}
                        >
                          <time dateTime={new Date(point.recordedAt).toISOString()} title={date(point.recordedAt)}>
                            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                              {new Date(point.recordedAt).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="mt-0.5 block tabular-nums">{new Date(point.recordedAt).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                          </time>
                          {point.before && <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{t('ui:history.restoreRecord')}</span>}
                          {point.disabled && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">{t('ui:history.capacity')}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {hasMore && (
                    <button
                      disabled={busy}
                      className={`${button} w-full`}
                      onClick={() =>
                        void run(async () => {
                          const items = await load(profileId, points.at(-1)?.recordedAt);
                          setPoints((previous) => [...previous, ...items]);
                          setHasMore(items.length === 20);
                        })
                      }
                    >
                      {t('ui:history.more')}
                    </button>
                  )}
                  <details className="border-t border-neutral-200 px-3 py-2 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <summary className="cursor-pointer py-1">{t('ui:history.restoreHelp')}</summary>
                    <p className="mt-2">{t('ui:history.restoreHelpText')}</p>
                  </details>
                </section>
                <section className={`px-4 py-4 ${!selected ? 'flex items-center justify-center' : ''}`}>
                  {!selected ? (
                    <p className="py-8 text-sm text-neutral-500 dark:text-neutral-400">{t('ui:history.choosePoint')}</p>
                  ) : (
                    <>
                      <h3 className="text-sm font-semibold">{t('ui:history.comparison')}</h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {t('ui:history.currentLocal')} → {date(selected)}
                      </p>
                      {stale && (
                        <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                          {t('ui:history.stale')}{' '}
                          <button className="underline" disabled={busy} onClick={() => void run(() => preview(selected))}>
                            {t('ui:history.refreshComparison')}
                          </button>
                        </p>
                      )}
                      {!changedRows.length && <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">{t('ui:history.same')}</p>}
                      <fieldset disabled={busy || stale} className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
                        <legend className="sr-only">{t('ui:history.selectData')}</legend>
                        {changedRows.map((row) => (
                          <label key={row.key} className="flex cursor-pointer items-start gap-3 py-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 accent-ba-btn-blue"
                              checked={keys.includes(row.key)}
                              onChange={(event) => setKeys((previous) => (event.target.checked ? [...previous, row.key] : previous.filter((key) => key !== row.key)))}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="text-sm font-medium">{keyLabel(row.key)}</span>
                              <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-300">
                                {profileSummary(row.key, baseline.get(row.key), i18n.getFixedT(i18n.language, 'auth'), i18n.language) || t('ui:history.currentLocal')} →{' '}
                                {target.get(row.key) == null
                                  ? t('ui:history.reset')
                                  : profileSummary(row.key, target.get(row.key), i18n.getFixedT(i18n.language, 'auth'), i18n.language) || t('ui:history.selectedState')}
                              </span>
                              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{t('ui:history.changeCounts', row)}</span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      {unchangedRows.length > 0 && (
                        <details className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                          <summary className="cursor-pointer py-1">{t('ui:history.unchangedCount', { count: unchangedRows.length })}</summary>
                          <ul className="mt-1 space-y-1">
                            {unchangedRows.map((row) => (
                              <li key={row.key}>{keyLabel(row.key)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </section>
              </div>
            </div>
            {(selected || error) && (
              <footer className="shrink-0 space-y-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
                {error && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
                {selected && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex-1 text-xs text-neutral-600 dark:text-neutral-300">{t('ui:history.replaceSelected')}</p>
                    <button
                      type="button"
                      disabled={busy || !keys.length || stale}
                      className="min-h-10 bg-ba-btn-yellow px-4 py-2 text-sm font-medium text-neutral-900 hover:opacity-90 disabled:opacity-40"
                      onClick={() => void run(restore)}
                    >
                      {busy ? t('ui:history.working') : keys.length ? t('ui:history.restoreCount', { count: keys.length }) : t('ui:history.restore')}
                    </button>
                  </div>
                )}
              </footer>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
