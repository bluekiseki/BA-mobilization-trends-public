import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import type { TitleDictionary } from './titleTranslation';
import { segmentDescription } from './descriptionTranslation';
import { linkDescription } from './descriptionLinks';
import { DescriptionUrl } from './DescriptionUrl';

export function VideoDescription({ description, title, url, dict }: { description?: string | null; title: string; url: string; dict: TitleDictionary | null }) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [open, setOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const backdropPointer = useRef(false);
  const text = description?.trim();
  const parts = useMemo(
    () => (open ? linkDescription(text ?? '', url).map((part) => (part.type === 'text' ? { ...part, segments: dict ? segmentDescription(part.text, dict) : [part.text] } : part)) : []),
    [open, text, dict, url],
  );
  const hasTranslation = parts.some((part) => part.type === 'text' && part.segments.some((segment) => typeof segment !== 'string'));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    titleRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!text) return null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setShowOriginal(false);
          setOpen(true);
        }}
        className="-my-1 min-h-8 shrink-0 rounded-sm px-1 sm:min-h-6 font-pretendard text-[10px] font-normal text-neutral-400 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-neutral-500 dark:hover:text-white dark:focus-visible:outline-blue-400"
      >
        {t('videos_description')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-lg border border-neutral-300 bg-white p-0 font-pretendard font-normal text-neutral-900 backdrop:bg-black/50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        onPointerDown={(event) => {
          backdropPointer.current = event.target === event.currentTarget;
        }}
        onPointerUp={(event) => {
          if (backdropPointer.current && event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false);
          }
          backdropPointer.current = false;
        }}
      >
        {open && (
          <div className="flex max-h-[85dvh] flex-col">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 dark:border-neutral-700">
              <h2 ref={titleRef} id={titleId} tabIndex={-1} className="flex-1 text-sm font-semibold outline-none">
                {t('videos_description')}
              </h2>
              {hasTranslation && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((current) => !current)}
                  className="min-h-11 shrink-0 rounded-sm px-1 text-xs font-normal text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 dark:text-neutral-300 dark:hover:text-white"
                >
                  {showOriginal ? t('videos_view_translation') : t('videos_view_original')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t_ui('close')}
                className="flex size-11 shrink-0 items-center justify-center rounded-sm hover:text-blue-600 focus-visible:outline-2 dark:hover:text-blue-400"
              >
                <HiOutlineXMark aria-hidden="true" className="size-5" />
              </button>
            </header>
            <div
              tabIndex={0}
              className="min-h-0 overflow-y-auto overscroll-contain p-4 text-sm leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
            >
              <p className="wrap-anywhere font-medium">{title}</p>
              <div className="mt-1 mb-4 text-xs">
                <DescriptionUrl url={url} />
              </div>
              {hasTranslation && !showOriginal && <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">{t('videos_description_translation_note')}</p>}
              <p className={`whitespace-pre-wrap wrap-anywhere text-neutral-700 dark:text-neutral-300 ${hasTranslation && !showOriginal ? 'leading-8' : 'leading-relaxed'}`}>
                {parts.map((part, index) => {
                  if (part.type === 'text') {
                    return showOriginal
                      ? part.text
                      : part.segments.map((segment, segmentIndex) =>
                          typeof segment === 'string' ? (
                            segment
                          ) : (
                            <ruby key={`${index}-${segmentIndex}`}>
                              {segment.dst}
                              <rt className="text-[9px] text-neutral-500 dark:text-neutral-400">{segment.src}</rt>
                            </ruby>
                          ),
                        );
                  }
                  return part.kind === 'url' ? (
                    <DescriptionUrl key={index} url={part.href} />
                  ) : (
                    <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline dark:text-blue-400">
                      {part.text}
                    </a>
                  );
                })}
              </p>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
