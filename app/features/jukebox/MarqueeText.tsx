import { useEffect, useRef, useState } from 'react';

export default function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    const overflow = textEl.scrollWidth - container.clientWidth;
    setOffset(overflow > 0 ? overflow : 0);
  }, [text]);

  const duration = offset > 0 ? Math.max(4, offset / 30) : 0;

  return (
    <div ref={containerRef} className="overflow-hidden">
      <span
        ref={textRef}
        className={`inline-block whitespace-nowrap ${className ?? ''}`}
        style={offset > 0 ? ({ animation: `marquee-scroll ${duration}s linear infinite`, '--marquee-offset': `-${offset}px` } as React.CSSProperties) : undefined}
      >
        {text}
      </span>
    </div>
  );
}
