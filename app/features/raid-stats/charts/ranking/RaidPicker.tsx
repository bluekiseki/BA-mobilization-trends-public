import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuChevronDown } from 'react-icons/lu';

export interface RaidPickerOption {
  index: number;
  label: ReactNode;
  text: string;
}

interface RaidPickerProps {
  options: RaidPickerOption[];
  value: number;
  onSelect: (index: number) => void;
  align: 'left' | 'right';
  ariaLabel: string;
  /** Receives the chevron so the caller can place it inside the label (e.g. next to the ID). */
  children: (chevron: ReactNode) => ReactNode;
}

/** Wraps the current raid label; clicking it opens a scrollable list to jump to any raid. */
export function RaidPicker({ options, value, onSelect, align, ariaLabel, children }: RaidPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    selectedRef.current?.scrollIntoView({ block: 'center' });
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="block cursor-pointer hover:text-neutral-900 dark:hover:text-white"
      >
        {children(<LuChevronDown className={`inline-block shrink-0 align-middle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />)}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full mt-2 z-20 w-72 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {options.map((opt) => {
            const selected = opt.index === value;
            return (
              <li key={opt.index} role="option" aria-selected={selected}>
                <button
                  type="button"
                  ref={selected ? selectedRef : undefined}
                  title={opt.text}
                  onClick={() => {
                    onSelect(opt.index);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 ${selected ? 'font-bold text-blue-600 dark:text-blue-400' : ''}`}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
