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
  inputSuffix?: React.ReactNode;
  className?: string;
  // Provide itemCount + onSelectIndex to enable arrow-key / Enter navigation
  itemCount?: number;
  onSelectIndex?: (index: number) => void;
  // Render prop when keyboard nav is enabled; plain ReactNode otherwise
  children: RenderChildren | React.ReactNode;
}

export function SearchableDropdown({
  value,
  onChange,
  isOpen,
  onOpenChange,
  placeholder,
  inputClassName,
  inputId,
  inputSuffix,
  className = 'relative',
  itemCount,
  onSelectIndex,
  children,
}: SearchableDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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
        onSelectIndex?.(highlightedIndex);
      }
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  const renderedChildren = typeof children === 'function' ? children(highlightedIndex, setHighlightedIndex) : children;

  return (
    <div className={className} ref={wrapperRef}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
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
