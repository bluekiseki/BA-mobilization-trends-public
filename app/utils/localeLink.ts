import { type Path } from 'react-router';
import { DEFAULT_LOCALE } from '~/utils/i18n/config';

export function localeLink(locale: string | undefined, to: string): string;
export function localeLink(locale: string | undefined, to: Partial<Path>): Partial<Path>;
export function localeLink(locale: string | undefined, to: string | Partial<Path>): string | Partial<Path> {
  if (typeof to !== 'string' || to.startsWith('http') || to.startsWith('#') || to.startsWith('?')) {
    return to;
  }

  const resolvedLocale = locale || DEFAULT_LOCALE;
  if (resolvedLocale && resolvedLocale !== DEFAULT_LOCALE && to.startsWith('/')) {
    const finalTo = to === '/' ? `/${resolvedLocale}` : `/${resolvedLocale}${to}`;
    return finalTo;
  }

  return to;
}
