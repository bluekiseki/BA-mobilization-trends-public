import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck, HiOutlineClipboardDocument } from 'react-icons/hi2';

export function DescriptionUrl({ url }: { url: string }) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timeout = window.setTimeout(() => setStatus('idle'), 3000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  };

  const copyLabel = status === 'copied' ? t_ui('copied') : t('videos_copy_link');

  return (
    <span className="wrap-anywhere">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
        {url}
      </a>
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
        aria-label={`${copyLabel}: ${url}`}
        title={copyLabel}
        className={`ml-1 inline-flex size-8 items-center justify-center rounded align-middle focus-visible:outline-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 sm:size-7 ${status === 'copied' ? 'text-green-600 dark:text-green-400' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'}`}
      >
        {status === 'copied' ? <HiOutlineCheck aria-hidden="true" className="size-4" /> : <HiOutlineClipboardDocument aria-hidden="true" className="size-3.5" />}
      </button>
      <span role="status" className={status === 'error' ? 'ml-1 text-xs text-red-600 dark:text-red-400' : 'sr-only'}>
        {status === 'copied' ? t_ui('copied') : status === 'error' ? t('videos_copy_failed') : ''}
      </span>
    </span>
  );
}
