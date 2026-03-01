import { cacheHeader } from 'pretty-cache-header';

// Browser: 5m, Cloudflare Edge: 2d (604800s -> 172800), SWR: 30d -> 1w
// export const CACHE_CONTROL_CONFIG =  "public, max-age=300, s-maxage=172800, stale-while-revalidate=604800"

export const CACHE_CONTROL_CONFIG = cacheHeader({
  maxAge: '10m',
  sMaxage: '2h',
  staleWhileRevalidate: '4h',
  staleIfError: '7d',
});
