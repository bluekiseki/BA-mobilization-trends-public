import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaXmark } from 'react-icons/fa6';

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onReset: () => void;
  resetDisabled: boolean;
  children: ReactNode;
  doneLabel?: string;
  onDone?: () => void;
  resetLabel?: string;
  fitVisualViewport?: boolean;
}

// Native modal behavior keeps focus inside the sheet and above sticky page elements.
export function FilterModal({ open, onClose, title, onReset, resetDisabled, children, doneLabel, onDone, resetLabel, fitVisualViewport = false }: FilterModalProps) {
  const { t: t_ui } = useTranslation('ui');
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backdropPointer = useRef(false);

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
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const fit = fitVisualViewport && window.innerWidth < 640 && viewport && viewport.scale === 1;
      stage.style.height = fit ? `${viewport.height}px` : '100%';
      stage.style.top = fit ? `${viewport.offsetTop}px` : '0';
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, fitVisualViewport]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-neutral-900 backdrop:bg-black/50 dark:text-neutral-100"
    >
      {open && (
        <div
          ref={stageRef}
          className="absolute inset-x-0 top-0 flex h-full items-end sm:items-center sm:justify-center sm:p-4"
          onPointerDown={(event) => {
            backdropPointer.current = event.target === event.currentTarget;
          }}
          onPointerUp={(event) => {
            if (backdropPointer.current && event.target === event.currentTarget) onClose();
            backdropPointer.current = false;
          }}
        >
          <div className="flex h-[88dvh] max-h-full w-full flex-col border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900 sm:h-auto sm:max-h-[80vh] sm:max-w-4xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-700 sm:px-6">
              <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-base font-bold outline-none">
                {title}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onReset}
                  disabled={resetDisabled}
                  className="min-h-11 px-2 text-sm text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300"
                >
                  {resetLabel ?? t_ui('reset')}
                </button>
                <button type="button" onClick={onClose} aria-label={t_ui('close')} className="flex h-11 w-11 items-center justify-center text-neutral-600 dark:text-neutral-300">
                  <FaXmark size={18} />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
            <footer className="shrink-0 border-t border-neutral-200 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-700 sm:px-6">
              <button
                type="button"
                onClick={onDone ?? onClose}
                className="min-h-11 w-full bg-ba-btn-blue px-4 py-2 text-sm font-bold text-neutral-950 hover:bg-ba-btn-blue-dark sm:ml-auto sm:block sm:w-auto"
              >
                {doneLabel ?? t_ui('done')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </dialog>
  );
}
