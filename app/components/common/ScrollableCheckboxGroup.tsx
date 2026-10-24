import { useTranslation } from 'react-i18next';
import { FaCheck, FaRotateLeft } from 'react-icons/fa6';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';

interface ScrollableCheckboxGroupProps<T extends string> {
  label: string;
  options: readonly CheckboxSelectOption<T>[];
  selected: ReadonlySet<T>;
  onChange: (values: Set<T>) => void;
  className?: string;
}

// Every option is visible up front (no click-to-open dropdown), with its own bounded,
// independently scrolling list — so a long list (e.g. schools) can't blow up the page and a
// popover can never get clipped by a scrolling ancestor (the bug a CheckboxSelect dropdown had
// inside the filter modals' scrollable body). Deliberately no card box (no all-around border,
// own background, or padding around the border) — just a top divider marks the scroll region,
// per the project's "no nested containers" rule (the modal already supplies the background).
export function ScrollableCheckboxGroup<T extends string>({ label, options, selected, onChange, className }: ScrollableCheckboxGroupProps<T>) {
  const { t: t_ui } = useTranslation('ui');
  const toggle = (value: T) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  const allSelected = options.length > 0 && options.every((option) => selected.has(option.value));

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{label}</span>
        {selected.size > 0 && <span className="text-xs text-blue-600 dark:text-blue-400">{selected.size}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(new Set(options.map((option) => option.value)))}
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
      <div className="max-h-40 overflow-y-auto border-t border-neutral-200 pt-1 pr-2 dark:border-neutral-700">
        {options.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">-</p>}
        {options.map((option) => {
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
