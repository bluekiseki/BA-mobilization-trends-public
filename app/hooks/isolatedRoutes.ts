import { useEffect } from 'react';

// Routes whose document is served cross-origin isolated (COOP/COEP headers, see
// routes/planner/ItemScanner.tsx and StudentScanner.tsx). Headers only take effect on a full document load, so
// links into these routes must bypass client-side navigation (`reloadDocument` / location.assign).
const ISOLATED_ROUTE_RE = /^(?:\/[a-zA-Z_]+)?\/scanner\/(?:item|student)(?:[/?#]|$)/;

export function needsDocumentLoad(path: string): boolean {
  return ISOLATED_ROUTE_RE.test(path);
}

// Safety net for every exit (nav, footer, returnTo links, browser back): once client-side
// navigation leaves an isolated route, the document is still isolated (COEP blocks cross-origin
// iframes such as YouTube embeds on other pages), so reload to get that page's normal document.
export function useLeaveIsolatedDocument(pathname: string): void {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.crossOriginIsolated && !needsDocumentLoad(pathname)) window.location.reload();
  }, [pathname]);
}
