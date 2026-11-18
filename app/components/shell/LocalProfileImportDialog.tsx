import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { compareProfileValues, profileSummary } from '~/utils/profileDataComparison';

interface Props {
  values: Map<string, unknown> | null;
  current: Map<string, unknown>;
  signedIn: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function LocalProfileImportDialog({ values, current, signedIn, onConfirm, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!values) return;
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, [values]);
  const changes = [...(values ?? [])].filter(([key, value]) => !compareProfileValues(current.get(key), value).same);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] border border-neutral-300 bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 sm:w-[30rem]"
    >
      {values && (
        <>
          <h2 id={titleId} className="border-b border-neutral-200 px-4 py-3 text-base font-semibold dark:border-neutral-700">
            {t('ui:history.importLocal')}
          </h2>
          <div className="max-h-[55dvh] overflow-y-auto px-4 py-3 text-sm">
            <p className="text-neutral-600 dark:text-neutral-300">{t('ui:history.importNotice')}</p>
            {signedIn && <p className="mt-2 text-amber-700 dark:text-amber-300">{t('ui:history.importSyncNotice')}</p>}
            {changes.length ? (
              <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-700">
                {changes.map(([key, value]) => {
                  const comparison = compareProfileValues(current.get(key), value);
                  const summary = profileSummary(key, value, i18n.getFixedT(i18n.language, 'auth'), i18n.language);
                  return (
                    <li key={key} className="py-2">
                      <p>{key.startsWith('eventPlans:') ? t('ui:history.event', { id: key.slice(11) }) : t(`ui:history.groups.${key}`, { defaultValue: key })}</p>
                      {summary && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{summary}</p>}
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('ui:history.changeCounts', comparison)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3">{t('ui:history.same')}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <button autoFocus type="button" onClick={onClose} className="min-h-10 px-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              {t('ui:cancel')}
            </button>
            <button
              type="button"
              disabled={!changes.length}
              onClick={onConfirm}
              className="min-h-10 bg-ba-btn-blue px-3 text-sm font-medium text-neutral-950 hover:bg-ba-btn-blue-dark disabled:opacity-40"
            >
              {t('ui:history.importApply')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
