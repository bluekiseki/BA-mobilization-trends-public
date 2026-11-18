import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChevronIcon } from './SvgIcons';

export interface CheckboxSelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional swatch color (e.g. attack/defense type), applied via inline style. Shown next to
   * the label in the dropdown, and — when every selected option carries one — as a compact dot
   * row on the closed trigger button instead of the (often long) joined label text. */
  color?: string;
  /** Same swatch, but as a Tailwind bg-* class (e.g. rarity, which needs baked-in dark: variants)
   * instead of a raw hex value. Mutually exclusive with `color` in practice. */
  colorClassName?: string;
  /** Optional leading icon (e.g. StarRating badge for star grade), shown before the label. Mutually exclusive with `color`/`colorClassName` in practice. */
  icon?: ReactNode;
  /** Optional facet count (how many currently-matching items have this value), shown trailing the label. */
  count?: number;
}

const DEFAULT_BUTTON_CLASS =
  'flex w-full min-w-32 items-center justify-between gap-2 rounded-md border border-neutral-300 bg-transparent p-1 text-left text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white';

interface CheckboxSelectProps<T extends string> {
  ariaLabel: string;
  options: readonly CheckboxSelectOption<T>[];
  selectedValues: ReadonlySet<T>;
  onChange: (values: Set<T>) => void;
  allOption?: CheckboxSelectOption<T>;
  className?: string;
  /** Overrides the trigger button's classes entirely (default styling otherwise). Use to match a neighboring native <select>. */
  buttonClassName?: string;
  /** Set to false to keep the joined label text on the trigger even when every selected option has a color. Defaults to true. */
  colorDotsInTrigger?: boolean;
}

export function CheckboxSelect<T extends string>({ ariaLabel, options, selectedValues, onChange, allOption, className, buttonClassName, colorDotsInTrigger = true }: CheckboxSelectProps<T>) {
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

  // Double-click selects only that option (ignores the preceding single-click toggles).
  const selectOnly = (value: T) => {
    if (allOption && value === allOption.value) {
      onChange(new Set([allOption.value]));
      return;
    }
    onChange(new Set([value]));
  };

  const selectedOptions = isAllSelected ? [] : options.filter(({ value }) => selectedValues.has(value));
  const selectedLabels = isAllSelected ? allOption.label : selectedOptions.map(({ label }) => label).join(', ');
  // When every selected option carries a color, show compact dots instead of the (potentially
  // long) joined label text — the label is still available via the button's title tooltip.
  const showColorDots = colorDotsInTrigger && !isAllSelected && selectedOptions.length > 0 && selectedOptions.every((option) => option.color || option.colorClassName);

  return (
    <div className={`relative ${className ?? ''}`} ref={dropdownRef}>
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-label={ariaLabel} aria-expanded={isOpen} title={selectedLabels} className={buttonClassName ?? DEFAULT_BUTTON_CLASS}>
        {showColorDots ? (
          <span className="flex items-center gap-1">
            {selectedOptions.map((option) => (
              <span
                key={option.value}
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full ${option.colorClassName ?? ''}`}
                style={option.colorClassName ? undefined : { backgroundColor: option.color }}
              />
            ))}
          </span>
        ) : (
          <span className="truncate">{selectedLabels}</span>
        )}
        <ChevronIcon className={`h-3! w-3! shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-40 rounded-md border border-neutral-300 bg-white p-2 dark:border-neutral-600 dark:bg-neutral-700">
          {allOption && <CheckboxSelectItem option={allOption} checked={isAllSelected} onChange={updateSelection} onSelectOnly={selectOnly} />}
          {options.map((option) => (
            <CheckboxSelectItem key={option.value} option={option} checked={!isAllSelected && selectedValues.has(option.value)} onChange={updateSelection} onSelectOnly={selectOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckboxSelectItem<T extends string>({
  option,
  checked,
  onChange,
  onSelectOnly,
}: {
  option: CheckboxSelectOption<T>;
  checked: boolean;
  onChange: (value: T) => void;
  onSelectOnly: (value: T) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-600" onDoubleClick={() => onSelectOnly(option.value)}>
      <input type="checkbox" checked={checked} onChange={() => onChange(option.value)} className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600" />
      {option.colorClassName ? (
        <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${option.colorClassName}`} />
      ) : (
        option.color && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
      )}
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{option.label}</span>
    </label>
  );
}
