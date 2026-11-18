import type { ReactNode } from 'react';

interface SegmentedToggleProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Choose-one buttons joined into a single control; the picked one is filled with the in-game blue. */
export function SegmentedToggle<T extends string>({ options, value, onChange, className = '' }: SegmentedToggleProps<T>) {
  return (
    <div className={`flex w-fit overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700 ${className}`}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`h-7 px-2.5 text-xs font-semibold ${index > 0 ? 'border-l border-neutral-300 dark:border-neutral-700' : ''} ${value === option.value ? 'bg-ba-btn-blue text-neutral-900' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
