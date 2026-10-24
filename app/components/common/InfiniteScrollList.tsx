import { useEffect, useRef, useState } from 'react';

interface InfiniteScrollListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  pageSize?: number;
  className?: string;
  /** Wrapper element. Defaults to 'ul' for backwards compatibility. Use 'div' for grid layouts. */
  as?: 'ul' | 'div';
  /**
   * Which element scroll position drives loading more items.
   * 'self' (default): the list element itself is the scroll container (needs its own overflow).
   * 'viewport': the page viewport scroll triggers loading (for full-page lists).
   */
  scrollRoot?: 'self' | 'viewport';
  /** IntersectionObserver rootMargin, e.g. '1200px 0px' to prefetch before the sentinel is visible. */
  rootMargin?: string;
  /** Class for the sentinel element (e.g. 'col-span-full h-4' inside a grid). */
  sentinelClassName?: string;
}

export function InfiniteScrollList<T>({ items, renderItem, pageSize = 20, className, as = 'ul', scrollRoot = 'self', rootMargin = '0px', sentinelClassName = 'h-4' }: InfiniteScrollListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const containerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel) return;
    const root = scrollRoot === 'viewport' ? null : container;
    if (scrollRoot !== 'viewport' && !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => Math.min(c + pageSize, items.length));
      },
      { root, rootMargin, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, pageSize, items.length, scrollRoot, rootMargin]);

  const Wrapper = as;

  return (
    <Wrapper ref={containerRef as React.Ref<HTMLUListElement & HTMLDivElement>} className={className}>
      {items.slice(0, visibleCount).map((item, idx) => renderItem(item, idx))}
      {hasMore && <div ref={sentinelRef} className={sentinelClassName} />}
    </Wrapper>
  );
}
