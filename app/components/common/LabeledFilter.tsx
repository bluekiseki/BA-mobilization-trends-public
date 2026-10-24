import type { ReactNode } from 'react';

// CheckboxSelect shows a blank button until something's selected, so every filter needs a
// standing caption above it to stay discoverable — otherwise it just looks like empty space.
export function LabeledFilter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{label}</span>
      {children}
    </div>
  );
}
