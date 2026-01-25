import { type Path } from 'react-router';
import { DEFAULT_LOCALE, type Locale } from '~/utils/i18n/config';

export function localeLink(locale: Locale, to: string | Partial<Path>) {
  if (typeof to !== 'string' || to.startsWith('http') || to.startsWith('#') || to.startsWith('?')) {
    return to;
  }

  if (locale && locale != DEFAULT_LOCALE && to.startsWith('/')) {
    const finalTo = to === '/' ? `/${locale}` : `/${locale}${to}`;
    return finalTo;
  }

  return to;
}
