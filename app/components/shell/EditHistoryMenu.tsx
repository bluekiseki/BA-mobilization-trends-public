import { useCallback, useEffect, useId, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowUturnLeft, HiOutlineArrowUturnRight, HiOutlineChevronDown } from 'react-icons/hi2';
import { LuCommand, LuHistory } from 'react-icons/lu';
import { BsShift } from 'react-icons/bs';
import { ProfileHistoryDialog, openProfileHistory } from '~/features/account/components/ProfileHistory';
import { replayLocalHistory, selectLocalHistory } from '~/store/history/actions';
import { EditingSaveStatus } from './SyncStatusIndicator';
import { useOutsideClick } from '~/hooks/useOutsideClick';
import { editHistory } from '~/store/history/history';
import { hasPersistenceFailures, persistenceRevision, subscribePersistence } from '~/store/history/localPersistence';
import { readLocalProfile } from '~/store/history/profileSnapshot';
import { sameProfileValue } from '~/utils/profileDataComparison';
import { useAuthStore } from '~/store/authStore';
import { LocalProfileImportDialog } from './LocalProfileImportDialog';
import { useHistoryNames } from '~/hooks/useHistoryNames';
import { describeHistoryEntry } from '~/utils/editHistoryDescription';
import { DEFAULT_LOCALE, SUPORTED_LOCALES, type Locale } from '~/utils/i18n/config';

export function EditHistoryMenu() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const [historyRevision, refresh] = useReducer((value) => value + 1, 0);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const locale = SUPORTED_LOCALES.includes(i18n.language as Locale) ? (i18n.language as Locale) : DEFAULT_LOCALE;
  const names = useHistoryNames(locale, open && expanded && editHistory.entries.length > 0);
  const [pressedShortcut, setPressedShortcut] = useState<'undo' | 'redo' | null>(null);
  const userId = useAuthStore((state) => state.user?.id);
  const profileId = useAuthStore((state) => state.activeProfileId);
  const [importValues, setImportValues] = useState<Map<string, unknown> | null>(null);
  const [importCurrent, setImportCurrent] = useState(new Map<string, unknown>());
  const [fileBusy, setFileBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileOperation = useRef(0);
  const historyId = useId();
  const [mac, setMac] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!open || !expanded) return;
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !selected) return;
    const top = selected.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + selected.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + selected.offsetHeight - list.clientHeight;
  }, [open, expanded, historyRevision]);
  useSyncExternalStore(subscribePersistence, persistenceRevision, () => 0);
  useOutsideClick(ref, () => setOpen(false));
  useEffect(() => editHistory.subscribe(refresh), []);
  useEffect(() => {
    editHistory.endGroup();
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  useEffect(() => {
    fileOperation.current++;
    setImportValues(null);
    setFileBusy(false);
  }, [userId, profileId]);
  const loadFile = async (file: File) => {
    const operation = ++fileOperation.current;
    setFileBusy(true);
    setError('');
    try {
      const tools = await import('~/store/localProfileFile.client');
      if (file.size > tools.MAX_IMPORT_BYTES) throw new Error('Invalid file size');
      const values = tools.parseLocalProfileFile(await file.text());
      if (operation !== fileOperation.current) return;
      setImportCurrent(readLocalProfile());
      setImportValues(values);
      setOpen(false);
    } catch {
      if (operation === fileOperation.current) {
        setError(t('ui:history.fileError'));
        setOpen(true);
      }
    } finally {
      if (operation === fileOperation.current) setFileBusy(false);
    }
  };
  const importFile = async () => {
    if (!importValues) return;
    const current = readLocalProfile();
    if ([...importValues.keys()].some((key) => !sameProfileValue(current.get(key), importCurrent.get(key)))) {
      setImportCurrent(current);
      return;
    }
    const operation = fileOperation.current;
    try {
      const tools = await import('~/store/localProfileFile.client');
      if (operation !== fileOperation.current) return;
      tools.importLocalProfile(importValues);
      setImportValues(null);
      setError('');
      trigger.current?.focus();
    } catch {
      setImportValues(null);
      setError(t('ui:history.fileError'));
      setOpen(true);
    }
  };
  const replay = useCallback(
    (direction: 'undo' | 'redo') => {
      try {
        replayLocalHistory(direction);
        setError('');
      } catch {
        setError(t('ui:history.operationError'));
        setOpen(true);
      }
    },
    [t],
  );
  useEffect(() => {
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(releaseTimer);
      setPressedShortcut(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      // Native text undo and modal-specific shortcuts belong to their focused editor.
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [role="dialog"], dialog'))) return;
      const key = event.key.toLowerCase();
      const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey ? 'redo' : null;
      if (!direction) return;
      editHistory.commit();
      if (direction === 'undo' ? editHistory.cursor === 0 : editHistory.cursor === editHistory.entries.length) return;
      event.preventDefault();
      if (!event.repeat) {
        clearTimeout(releaseTimer);
        setPressedShortcut(direction);
        // Bound visual feedback even when a shortcut's keyup event is not delivered.
        releaseTimer = setTimeout(release, 180);
        replay(direction);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyZ' || event.code === 'KeyY' || ['z', 'y', 'control', 'meta', 'shift'].includes(event.key.toLowerCase())) release();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', release);
      clearTimeout(releaseTimer);
    };
  }, [replay]);
  const row =
    'flex min-h-9 w-full items-center gap-3 px-3 py-1.5 text-left text-sm font-normal text-neutral-800 enabled:hover:bg-neutral-100 enabled:active:bg-neutral-200 data-[pressed=true]:bg-neutral-200 data-[pressed=true]:enabled:hover:bg-neutral-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ba-btn-blue disabled:cursor-default disabled:text-neutral-400 dark:text-neutral-100 dark:enabled:hover:bg-neutral-800 dark:enabled:active:bg-neutral-700 dark:data-[pressed=true]:bg-neutral-700 dark:data-[pressed=true]:enabled:hover:bg-neutral-700 dark:disabled:text-neutral-500';
  const states = [
    { text: t('ui:history.recordStart'), summary: '', full: t('ui:history.recordStart') },
    ...editHistory.entries.map((entry) => {
      const descriptions = describeHistoryEntry(entry, names, locale, t);
      const parts = descriptions[0]?.split(' · ').slice(0, -1) ?? [];
      while (parts.length && !descriptions.every((text) => text.startsWith(`${parts.join(' · ')} · `))) parts.pop();
      const prefix = parts.join(' · ');
      const shared = prefix.length > 0;
      const details = shared ? descriptions.map((text) => text.slice(prefix.length + 3)) : descriptions.slice(1);
      const visible = details.slice(0, 2).join(' · ');
      return {
        text: shared ? prefix : descriptions[0],
        summary: details.length > 2 ? t('ui:history.moreChanges', { text: visible, count: details.length - 2 }) : visible,
        full: descriptions.join('\n'),
      };
    }),
  ];
  const notice = hasPersistenceFailures() || !!error || !!editHistory.warning;
  const shortcut = (redo: boolean) => (
    <kbd
      aria-label={`${mac ? 'Command' : 'Ctrl'}+${redo ? 'Shift+' : ''}Z`}
      className="hidden items-center gap-1 whitespace-nowrap text-xs font-normal text-neutral-500 sm:inline-flex dark:text-neutral-400"
    >
      {mac ? <LuCommand aria-hidden="true" className="h-3.5 w-3.5" /> : <span>Ctrl</span>}
      {redo &&
        (mac ? (
          <BsShift aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <>
            <span>+</span>
            <span>Shift</span>
          </>
        ))}
      {!mac && <span>+</span>}
      <span>Z</span>
    </kbd>
  );
  return (
    <>
      <div
        ref={ref}
        className="relative flex items-center"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          ref={trigger}
          type="button"
          title={t('ui:history.edit')}
          aria-label={t('ui:history.edit')}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="relative flex items-center text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
          <LuHistory aria-hidden="true" className="text-xl" strokeWidth={1.5} />
          {notice && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </button>
        {open && (
          <div
            id={panelId}
            aria-label={t('ui:history.edit')}
            className="fixed inset-x-2 top-14 z-50 mt-1 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] rounded-sm border border-neutral-300 bg-white py-1 shadow-[0_4px_16px_rgb(0_0_0/0.12)] dark:border-neutral-600 dark:bg-neutral-900 dark:shadow-[0_6px_20px_rgb(0_0_0/0.24)]"
          >
            <button className={row} data-pressed={pressedShortcut === 'undo' || undefined} disabled={!editHistory.cursor} onClick={() => replay('undo')}>
              <HiOutlineArrowUturnLeft aria-hidden="true" className="shrink-0 text-lg" strokeWidth={1.5} />
              <span className="flex-1">{t('ui:history.undo')}</span>
              {shortcut(false)}
            </button>
            <button className={row} data-pressed={pressedShortcut === 'redo' || undefined} disabled={editHistory.cursor === editHistory.entries.length} onClick={() => replay('redo')}>
              <HiOutlineArrowUturnRight aria-hidden="true" className="shrink-0 text-lg" strokeWidth={1.5} />
              <span className="flex-1">{t('ui:history.redo')}</span>
              {shortcut(true)}
            </button>
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={historyId}
              onClick={() => {
                editHistory.endGroup();
                setExpanded((value) => !value);
              }}
              className={row}
            >
              <span className="flex flex-1 items-center gap-2">
                {t('ui:history.records')}
                <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{t('ui:history.recordCount', { count: editHistory.entries.length })}</span>
              </span>
              <HiOutlineChevronDown aria-hidden="true" className={`h-4 w-4 text-neutral-500 dark:text-neutral-400 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <section id={historyId} aria-label={t('ui:history.records')}>
                <ol ref={listRef} className="relative max-h-[min(11rem,26dvh)] overflow-y-auto overscroll-contain">
                  {states.map(({ text, summary, full }, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        title={full}
                        aria-current={editHistory.cursor === index ? 'step' : undefined}
                        onClick={() => {
                          try {
                            selectLocalHistory(index);
                            setError('');
                          } catch {
                            setError(t('ui:history.operationError'));
                          }
                        }}
                        className={`flex min-h-9 w-full items-center gap-3 border-l-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ba-btn-blue dark:hover:bg-neutral-800 ${index === editHistory.cursor ? 'border-ba-btn-blue bg-neutral-100 font-medium dark:bg-neutral-800' : 'border-transparent'} ${index > editHistory.cursor ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-800 dark:text-neutral-100'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span title={text} className="block truncate">
                            {text}
                          </span>
                          {summary && (
                            <span title={full} className="block truncate text-xs font-normal text-neutral-600 dark:text-neutral-300">
                              {summary}
                            </span>
                          )}
                        </span>
                        {index === editHistory.cursor && <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-300">{t('ui:history.currentStep')}</span>}
                        {index > editHistory.cursor && <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{t('ui:history.redoAvailable')}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="px-3 py-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{t('ui:history.reloadHint')}</p>
              </section>
            )}
            <div className="mt-1 border-t border-neutral-200 dark:border-neutral-700">
              <button
                type="button"
                className={row}
                disabled={!userId}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  openProfileHistory();
                }}
              >
                <span className="flex-1">{t('ui:history.browseVersions')}</span>
                {!userId && <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui:history.loginToUse')}</span>}
              </button>
              <EditingSaveStatus localOnly className="px-3 py-2" />
            </div>
            <div className="mt-1 border-t border-neutral-200 dark:border-neutral-700">
              <button
                type="button"
                className={row}
                disabled={fileBusy}
                onClick={() => {
                  void import('~/store/localProfileFile.client')
                    .then((tools) => {
                      tools.exportLocalProfile();
                      setError('');
                    })
                    .catch(() => setError(t('ui:history.fileError')));
                }}
              >
                {t('ui:history.exportLocal')}
              </button>
              <button type="button" className={row} disabled={fileBusy} onClick={() => fileInput.current?.click()}>
                {t('ui:history.importLocal')}
              </button>
            </div>
            {editHistory.warning && (
              <p className="px-4 py-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400" role="status">
                {t(`ui:history.${editHistory.warning}`)}
              </p>
            )}
            {error && (
              <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void loadFile(file);
        }}
      />
      <LocalProfileImportDialog
        values={importValues}
        current={importCurrent}
        signedIn={!!userId}
        onConfirm={() => void importFile()}
        onClose={() => {
          setImportValues(null);
          trigger.current?.focus();
        }}
      />
      <ProfileHistoryDialog />
    </>
  );
}
