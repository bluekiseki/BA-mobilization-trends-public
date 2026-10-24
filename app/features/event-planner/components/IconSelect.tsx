// app/components/planner/common/IconSelect.tsx
import { useEffect, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

export interface IconSelectOption {
  value: string;
  label: string;
  // Small icon shown before the label (e.g. an item image)
  icon?: React.ReactNode;
}

export interface IconSelectGroup {
  // Non-selectable heading rendered above the group's options
  label?: string;
  options: IconSelectOption[];
}

interface IconSelectProps {
  value: string;
  onChange: (value: string) => void;
  groups: IconSelectGroup[];
  className?: string;
}

// Dropdown that can show icons and group headings, which a native <select> cannot.
export const IconSelect = ({ value, onChange, groups, className = '' }: IconSelectProps) => {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flat = groups.flatMap((group) => group.options);
  const selected = flat.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || highlighted < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  const openList = () => {
    setHighlighted(
      Math.max(
        0,
        flat.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  };

  const choose = (option: IconSelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setHighlighted((prev) => (e.key === 'ArrowDown' ? (prev + 1) % flat.length : (prev <= 0 ? flat.length : prev) - 1));
    } else if (e.key === 'Enter' && open && highlighted >= 0) {
      e.preventDefault();
      choose(flat[highlighted]);
    }
  };

  let index = -1;
  return (
    <div ref={wrapperRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        className="h-8 w-full flex items-center justify-between gap-2 px-2 text-sm text-left border border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-700/50 dark:text-neutral-200"
      >
        <span className="flex min-w-0 items-center gap-2" title={selected?.label}>
          {selected?.icon}
          <span className="truncate">{selected?.label}</span>
        </span>
        <FiChevronDown size={16} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-full w-max max-w-[90vw] overflow-y-auto border border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-800"
        >
          {groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.label && (
                <div className="sticky top-0 border-y border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                  {group.label}
                </div>
              )}
              {group.options.map((option) => {
                index++;
                const optionIndex = index;
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={optionIndex}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setHighlighted(optionIndex)}
                    className={`flex min-h-9 w-full items-center gap-2 px-2 py-1 text-left text-sm text-neutral-800 dark:text-neutral-100 ${highlighted === optionIndex ? 'bg-neutral-100 dark:bg-neutral-700' : ''} ${isSelected ? 'font-semibold' : ''}`}
                  >
                    {option.icon}
                    <span className="min-w-0 truncate" title={option.label}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
