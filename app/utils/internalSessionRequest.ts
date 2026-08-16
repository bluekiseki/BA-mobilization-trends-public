import { getSupportedProfileLocale } from './profileServer';

export function createInternalSessionRequest(request: Request, locale?: string): Request {
  const sessionUrl = new URL('/__internal/session', request.url);
  const pathLocale = new URL(request.url).pathname.split('/').filter(Boolean)[0];
  const requestedLocale = getSupportedProfileLocale(locale) ?? getSupportedProfileLocale(pathLocale);
  if (requestedLocale) sessionUrl.searchParams.set('locale', requestedLocale);
  return new Request(sessionUrl, { headers: request.headers });
}
