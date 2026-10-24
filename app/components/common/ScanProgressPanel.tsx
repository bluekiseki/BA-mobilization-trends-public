import type { ReactNode } from 'react';

interface Props {
  step: string;
  percent: number;
  /** When set, a cancel button is shown (used by long-running video scans). */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Optional content under the bar, e.g. a live preview of the frame being analysed. */
  children?: ReactNode;
}

export function ScanProgressPanel({ step, percent, onCancel, cancelLabel, children }: Props) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-2.5 sm:p-4 mb-3">
      <div className="flex justify-between items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 mb-2">
        <span className="truncate" title={step}>
          {step}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {percent}%
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400"
            >
              {cancelLabel}
            </button>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            backgroundColor: 'var(--color-ba-btn-blue)',
          }}
        />
      </div>
      {children}
    </div>
  );
}
