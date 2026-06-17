import { useEffect, useRef, useState } from 'react';

interface InfiniteScrollListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  pageSize?: number;
  className?: string;
}

export function InfiniteScrollList<T>({ items, renderItem, pageSize = 20, className }: InfiniteScrollListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const containerRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < items.length;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => Math.min(c + pageSize, items.length));
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, pageSize, items.length]);

  return (
    <ul ref={containerRef} className={className}>
      {items.slice(0, visibleCount).map((item, idx) => renderItem(item, idx))}
      {hasMore && <div ref={sentinelRef} className="h-4" />}
    </ul>
  );
}
