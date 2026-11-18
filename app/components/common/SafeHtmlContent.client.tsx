'use client';

import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { archiveImageUrl, isArchivable } from '~/utils/archiveImage';

interface SafeHtmlContentProps {
  html: string;
  className?: string;
}

export function SafeHtmlContent({ html, className }: SafeHtmlContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || !html) return;
    container.innerHTML = DOMPurify.sanitize(html);

    // Image errors do not bubble, so listen in the capture phase. Sanitizing strips inline onerror.
    // Each image falls back to its archived copy once; a second failure leaves it alone.
    const handleError = (event: Event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.archiveTried) return;
      const original = img.getAttribute('src') ?? '';
      if (!isArchivable(original)) return;
      img.dataset.archiveTried = '1';
      archiveImageUrl(original)
        .then((url) => {
          img.src = url;
        })
        // Hashing can fail outside secure contexts; the image then stays broken.
        .catch(() => undefined);
    };
    container.addEventListener('error', handleError, true);
    return () => container.removeEventListener('error', handleError, true);
  }, [html]);

  return <div ref={contentRef} className={className} />;
}
