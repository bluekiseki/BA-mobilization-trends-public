import { redirect } from 'react-router';
import type { Route } from './+types/calendarLegacy';
import { getInstance } from '~/middleware/i18next';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';

export function loader({ context, params, request }: Route.LoaderArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const server = params.server;

  if (server !== 'jp' && server !== 'kr') {
    throw new Response('Not Found: Invalid server parameter.', { status: 404 });
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(localeLink(locale, '/calendar'), sourceUrl.origin);
  sourceUrl.searchParams.forEach((value, key) => targetUrl.searchParams.append(key, value));
  targetUrl.searchParams.set('server', server);

  throw redirect(`${targetUrl.pathname}${targetUrl.search}`, 301);
}
