import { useState, useRef, useEffect } from 'react';

type RenderChildren = (highlightedIndex: number, onHighlight: (i: number) => void) => React.ReactNode;

interface SearchableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  inputClassName?: string;
  inputId?: string;
  listboxId?: string;
  inputSuffix?: React.ReactNode;
  className?: string;
  // Provide itemCount + onSelectIndex to enable arrow-key / Enter navigation
  itemCount?: number;
  onSelectIndex?: (index: number) => void;
  items?: ReadonlyArray<{ id: string; content: React.ReactNode }>;
  resultsPresentation?: 'dropdown' | 'inline';
  itemClassName?: string;
  noResultsText?: string;
  loadMoreText?: string;
  // Render prop when keyboard nav is enabled; plain ReactNode otherwise
  children?: RenderChildren | React.ReactNode;
}

export function SearchableDropdown({
  value,
  onChange,
  isOpen,
  onOpenChange,
  placeholder,
  inputClassName,
  inputId,
  listboxId,
  inputSuffix,
  className = 'relative',
  itemCount: providedItemCount,
  onSelectIndex,
  items,
  resultsPresentation = 'dropdown',
  itemClassName = 'flex min-h-11 w-full items-center gap-2 px-2 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-700',
  noResultsText,
  loadMoreText,
  children,
}: SearchableDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(8);
  const inline = resultsPresentation === 'inline';
  const visibleItems = inline ? items?.slice(0, visibleCount) : items;
  const itemCount = visibleItems?.length ?? providedItemCount;
  const selectIndex = (index: number) => {
    onSelectIndex?.(index);
    setVisibleCount(8);
    setHighlightedIndex(-1);
  };

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        onOpenChangeRef.current(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when dropdown closes or search changes
  useEffect(() => {
    if (!isOpen) setHighlightedIndex(-1);
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !containerRef.current) return;
    const item = containerRef.current.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
      return;
    }
    if (!itemCount) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        onOpenChange(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % itemCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? itemCount - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < itemCount) {
        selectIndex(highlightedIndex);
      }
    }
  };

  const renderedChildren = items ? (
    <>
      <ul
        id={listboxId}
        role="listbox"
        className={
          inline
            ? 'mt-2 divide-y divide-neutral-200 dark:divide-neutral-700'
            : 'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800'
        }
      >
        {visibleItems?.map((item, index) => (
          <li
            key={item.id}
            id={listboxId ? `${listboxId}-${index}` : undefined}
            role="option"
            aria-selected={highlightedIndex === index}
            data-index={index}
            onMouseEnter={() => setHighlightedIndex(index)}
            className={highlightedIndex === index ? 'bg-neutral-100 dark:bg-neutral-700' : ''}
          >
            <button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => selectIndex(index)} className={itemClassName}>
              {item.content}
            </button>
          </li>
        ))}
        {visibleItems?.length === 0 && (
          <li role="presentation" className="py-3 text-sm text-neutral-500 dark:text-neutral-400">
            {noResultsText}
          </li>
        )}
      </ul>
      {inline && visibleCount < items.length && (
        <button type="button" onClick={() => setVisibleCount((count) => count + 8)} className="min-h-11 w-full text-sm text-neutral-700 dark:text-neutral-200">
          {loadMoreText}
        </button>
      )}
    </>
  ) : typeof children === 'function' ? (
    children(highlightedIndex, setHighlightedIndex)
  ) : (
    children
  );

  return (
    <div className={className} ref={wrapperRef}>
      <div className="relative">
        <input
          id={inputId}
          role={listboxId ? 'combobox' : undefined}
          aria-label={listboxId ? placeholder : undefined}
          aria-controls={listboxId && isOpen ? listboxId : undefined}
          aria-expanded={listboxId ? isOpen : undefined}
          aria-autocomplete={listboxId ? 'list' : undefined}
          aria-activedescendant={listboxId && isOpen && highlightedIndex >= 0 && highlightedIndex < (itemCount ?? 0) ? `${listboxId}-${highlightedIndex}` : undefined}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setVisibleCount(8);
            onOpenChange(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => onOpenChange(true)}
          onKeyDown={handleKeyDown}
          className={inputClassName}
        />
        {inputSuffix}
      </div>
      {isOpen && <div ref={containerRef}>{renderedChildren}</div>}
    </div>
  );
}
