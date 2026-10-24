import type { ReactNode } from 'react';

// Bigger, unambiguous click target — replaces a plain checkbox+label for toggles that matter.
export function ToggleButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'text-xs px-2.5 py-1.5 rounded border whitespace-nowrap transition-colors',
        active
          ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white'
          : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
