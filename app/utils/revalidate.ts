import type { ShouldRevalidateFunctionArgs } from 'react-router';

// The root and layout loaders read the path and `?lang=` only, so a change to any other search param (filters, sorting) has nothing
// to reload. Without this every such change asks the server for both loaders again.
export function shouldRevalidateOnPathOrLang({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs): boolean {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  return currentUrl.searchParams.get('lang') !== nextUrl.searchParams.get('lang');
}
