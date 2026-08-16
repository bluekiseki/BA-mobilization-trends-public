// Minimal in-house replacement for the `pretty-cache-header` package — we only ever
// use a handful of time-based directives, so a full parser library is unnecessary.

type TimeUnit = 's' | 'm' | 'h' | 'd' | 'w';
type TimeString = `${number}${TimeUnit}`;

const UNIT_SECONDS: Record<TimeUnit, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
  w: 60 * 60 * 24 * 7,
};

function toSeconds(value: TimeString): number {
  const amount = parseFloat(value);
  const unit = value.slice(String(amount).length) as TimeUnit;
  return Math.round(amount * UNIT_SECONDS[unit]);
}

interface CacheHeaderParams {
  maxAge?: TimeString;
  sMaxage?: TimeString;
  staleWhileRevalidate?: TimeString;
  staleIfError?: TimeString;
}

const DIRECTIVE_NAMES: Record<keyof CacheHeaderParams, string> = {
  maxAge: 'max-age',
  sMaxage: 's-maxage',
  staleWhileRevalidate: 'stale-while-revalidate',
  staleIfError: 'stale-if-error',
};

export function cacheHeader(params: CacheHeaderParams): string {
  return (Object.entries(params) as [keyof CacheHeaderParams, TimeString][]).map(([key, value]) => `${DIRECTIVE_NAMES[key]}=${toSeconds(value)}`).join(', ');
}

// Browser: 10m, Cloudflare Edge: 2h, SWR: 4h, stale-if-error: 7d
export const CACHE_CONTROL_CONFIG = cacheHeader({
  maxAge: '10m',
  sMaxage: '2h',
  staleWhileRevalidate: '4h',
  staleIfError: '7d',
});

// for notice page (Frequent updates)
export const NOTICES_CACHE_CONTROL = cacheHeader({
  maxAge: '1m',
  sMaxage: '5m',
  staleWhileRevalidate: '1h',
});
