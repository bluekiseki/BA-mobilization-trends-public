import { useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '../Icon';

export interface CheckboxSelectOption<T extends string> {
  value: T;
  label: string;
}

interface CheckboxSelectProps<T extends string> {
  ariaLabel: string;
  options: readonly CheckboxSelectOption<T>[];
  selectedValues: ReadonlySet<T>;
  onChange: (values: Set<T>) => void;
  allOption?: CheckboxSelectOption<T>;
  className?: string;
}

export function CheckboxSelect<T extends string>({ ariaLabel, options, selectedValues, onChange, allOption, className }: CheckboxSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isAllSelected = allOption !== undefined && selectedValues.has(allOption.value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };

    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const updateSelection = (value: T) => {
    if (allOption && value === allOption.value) {
      onChange(isAllSelected ? new Set() : new Set([allOption.value]));
      return;
    }

    const next = new Set(selectedValues);
    if (allOption) next.delete(allOption.value);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const selectedLabels = isAllSelected
    ? allOption.label
    : options
        .filter(({ value }) => selectedValues.has(value))
        .map(({ label }) => label)
        .join(', ');

  return (
    <div className={`relative ${className ?? ''}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className="flex w-full min-w-32 items-center justify-between gap-2 rounded-md border border-neutral-300 bg-transparent p-1 text-left text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
      >
        <span className="truncate" title={selectedLabels}>
          {selectedLabels}
        </span>
        <ChevronIcon className={`h-3! w-3! shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-40 rounded-md border border-neutral-300 bg-white p-2 dark:border-neutral-600 dark:bg-neutral-700">
          {allOption && <CheckboxSelectItem option={allOption} checked={isAllSelected} onChange={updateSelection} />}
          {options.map((option) => (
            <CheckboxSelectItem key={option.value} option={option} checked={!isAllSelected && selectedValues.has(option.value)} onChange={updateSelection} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckboxSelectItem<T extends string>({ option, checked, onChange }: { option: CheckboxSelectOption<T>; checked: boolean; onChange: (value: T) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-600">
      <input type="checkbox" checked={checked} onChange={() => onChange(option.value)} className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600" />
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{option.label}</span>
    </label>
  );
}
