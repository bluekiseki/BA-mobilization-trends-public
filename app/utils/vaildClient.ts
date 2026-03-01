import { domain, vercelDomain, localDomain } from '~/data/livedataServer.json';
const ALLOWED_DOMAINS = ['https://' + domain, 'https://' + vercelDomain, 'http://' + localDomain];

export function vaildClient(request: Request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  // Security headers supported by modern browsers (clearly indicates where the request originated)
  // Value types: 'same-origin', 'same-site', 'cross-site', 'none'
  const fetchSite = request.headers.get('Sec-Fetch-Site');

  // 1. Strongly block requests probing from external domains (cross-site)
  if (fetchSite && fetchSite != 'same-origin') {
    return false;
  }

  // 2. Traditional Origin / Referer validation (check for malice only when values exist)
  if (origin && !ALLOWED_DOMAINS.includes(origin)) {
    return false;
  }

  if (!referer || !ALLOWED_DOMAINS.some((domain) => referer.startsWith(domain))) {
    return false;
  }

  return true;
}
