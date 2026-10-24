import { useEffect, useRef } from 'react';
import { Link } from 'react-router';

interface Props {
  title: string;
  description: string;
  stayLabel: string;
  doneLabel: string;
  returnTo?: string | null;
  onClose: () => void;
}

export function ApplySuccessDialog({ title, description, stayLabel, doneLabel, returnTo, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (returnTo) closeRef.current?.focus();
    else confirmRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-3"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="scanner-apply-success-title" className="w-full max-w-sm border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 id="scanner-apply-success-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-5 text-neutral-600 dark:text-neutral-400">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          {returnTo ? (
            <>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="border border-neutral-300 bg-white px-4 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {stayLabel}
              </button>
              <Link to={returnTo} className="bg-ba-btn-blue px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark">
                {doneLabel}
              </Link>
            </>
          ) : (
            <button ref={confirmRef} type="button" onClick={onClose} className="bg-ba-btn-blue px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark">
              {doneLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
