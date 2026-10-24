import { domain, localDomain } from '~/data/livedataServer.json';
const ALLOWED_DOMAINS = ['https://' + domain, 'http://' + localDomain];

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

  if (!referer || !isAllowedReferer(referer)) {
    return false;
  }

  return true;
}

// Compare the parsed origin exactly; a prefix match accepts "https://domain.evil.test" and "https://domain@evil.test".
function isAllowedReferer(referer: string): boolean {
  try {
    return ALLOWED_DOMAINS.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}
