import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheck, FaMagnifyingGlass, FaRotateLeft } from 'react-icons/fa6';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

interface ScrollableCheckboxGroupProps<T extends string> {
  label: string;
  labelIcon?: ReactNode;
  options: readonly CheckboxSelectOption<T>[];
  selected: ReadonlySet<T>;
  onChange: (values: Set<T>) => void;
  className?: string;
  // Max-height utility for the scrolling list; override to give it more room.
  listMaxHeightClassName?: string;
}

// Keep options in a bounded scroll region to avoid clipping inside filter modals.
export function ScrollableCheckboxGroup<T extends string>({ label, labelIcon, options, selected, onChange, className, listMaxHeightClassName = 'max-h-40' }: ScrollableCheckboxGroupProps<T>) {
  const { t: t_ui, i18n } = useTranslation('ui');
  const matcher = useSearchMatcher(i18n.language as Locale);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const trimmedQuery = query.trim();
  // Same locale-aware matcher as the page search (e.g. Korean initial-consonant search).
  const visibleOptions = trimmedQuery ? options.filter((option) => matcher(option.label, trimmedQuery.toLowerCase())) : options;
  const toggle = (value: T) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  const allSelected = visibleOptions.length > 0 && visibleOptions.every((option) => selected.has(option.value));

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {/* The search input takes the label's place so opening it never shifts the list below. */}
        {searchOpen ? (
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${label} ${t_ui('searchOptions')}`}
            aria-label={`${label} ${t_ui('searchOptions')}`}
            className="h-6 min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none dark:border-neutral-600 dark:text-neutral-100"
          />
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">
              {labelIcon}
              {label}
            </span>
            {selected.size > 0 && <span className="text-xs text-blue-600 dark:text-blue-400">{selected.size}</span>}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (searchOpen) setQuery('');
              setSearchOpen(!searchOpen);
            }}
            aria-label={t_ui('searchOptions')}
            aria-pressed={searchOpen}
            title={t_ui('searchOptions')}
            className={`p-1.5 hover:text-blue-600 dark:hover:text-blue-400 ${searchOpen ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}
          >
            <FaMagnifyingGlass size={10} />
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set([...selected, ...visibleOptions.map((option) => option.value)]))}
            disabled={allSelected}
            aria-label={t_ui('selectAll')}
            title={t_ui('selectAll')}
            className="p-1.5 text-neutral-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:text-blue-400"
          >
            <FaCheck size={10} />
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            disabled={selected.size === 0}
            aria-label={t_ui('reset')}
            title={t_ui('reset')}
            className="p-1.5 text-neutral-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:text-blue-400"
          >
            <FaRotateLeft size={10} />
          </button>
        </div>
      </div>
      {/* pr- reserves a gutter so an overlay scrollbar (macOS trackpad style) floats there instead of covering the trailing count. */}
      <div className={`${listMaxHeightClassName} overflow-y-auto border-t border-neutral-200 pt-1 pr-2 dark:border-neutral-700`}>
        {visibleOptions.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">{trimmedQuery ? t_ui('noResults') : '-'}</p>}
        {visibleOptions.map((option) => {
          const checked = selected.has(option.value);
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-sm ${checked ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100' : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.value)}
                className="h-4 w-4 shrink-0 border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              {option.icon}
              {option.colorClassName ? (
                <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${option.colorClassName}`} />
              ) : (
                option.color && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
              )}
              <span className="truncate" title={option.label}>
                {option.label}
              </span>
              {option.count !== undefined && <span className="ml-auto shrink-0 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">{option.count}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
