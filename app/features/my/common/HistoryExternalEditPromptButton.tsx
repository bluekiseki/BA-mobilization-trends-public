import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineClipboardDocument } from 'react-icons/hi2';
import { getHistoryExternalEditPrompt, type HistoryExternalEditPromptKind } from '~/features/my/common/historyExternalEditPrompts';

type CopyState = 'idle' | 'copied' | 'failed';

export function HistoryExternalEditPromptButton({ kind }: { kind: HistoryExternalEditPromptKind }) {
  const { t } = useTranslation('mypage');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(getHistoryExternalEditPrompt(kind));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyState('idle'), 2500);
  };

  const label = copyState === 'copied' ? t('externalEdit.copied') : copyState === 'failed' ? t('externalEdit.copyFailed') : t('externalEdit.copyPrompt');

  return (
    <button
      type="button"
      onClick={() => void copyPrompt()}
      className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold transition-colors ${
        copyState === 'copied'
          ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-300'
          : copyState === 'failed'
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300'
            : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'
      }`}
      aria-label={label}
      title={t('externalEdit.description')}
    >
      <HiOutlineClipboardDocument className="h-4 w-4" />
      <span className="hidden sm:inline" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
