import { redirect } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import type { Route } from './+types/LegacyStudentScanner';

export function loader({ context, request }: Route.LoaderArgs) {
  const locale = getInstance(context).language as Locale;
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(localeLink(locale, '/scanner/student'), sourceUrl.origin);
  targetUrl.search = sourceUrl.search;

  throw redirect(`${targetUrl.pathname}${targetUrl.search}`, 301);
}
