'use client';

import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlContentProps {
  html: string;
  className?: string;
}

export function SafeHtmlContent({ html, className }: SafeHtmlContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current && html) {
      const cleanHTML = DOMPurify.sanitize(html);
      contentRef.current.innerHTML = cleanHTML;
    }
  }, [html]);

  return <div ref={contentRef} className={className} />;
}
