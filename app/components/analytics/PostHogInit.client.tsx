// app/components/analytics/PostHogInit.client.tsx
import posthog from 'posthog-js';
import { useEffect } from 'react';

export interface PostHogEnv {
  VITE_PUBLIC_POSTHOG_KEY?: string;
  VITE_PUBLIC_POSTHOG_DIRECT_HOST?: string;
  VITE_PUBLIC_POSTHOG_UI_HOST?: string;
  // This is the fallback reverse proxy host.
  VITE_PUBLIC_POSTHOG_HOST?: string;
}

const POSTHOG_HOST_SESSION_KEY = 'posthog-api-host-v2';
const DIRECT_PROBE_TIMEOUT_MS = 1_500;

type SelectedHost = 'direct' | 'proxy';

function readSelectedHost(): SelectedHost | null {
  try {
    const value = sessionStorage.getItem(POSTHOG_HOST_SESSION_KEY);
    return value === 'direct' || value === 'proxy' ? value : null;
  } catch {
    return null;
  }
}

function storeSelectedHost(value: SelectedHost) {
  try {
    sessionStorage.setItem(POSTHOG_HOST_SESSION_KEY, value);
  } catch {
    // Analytics still works when session storage is unavailable.
  }
}

async function fetchGeoIp(host: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${host}/api/geoip`, {
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });

  if (!response.ok) return null;

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null || !('data' in json)) return null;

  const data = json.data;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

async function probeDirectHost(directHost: string, signal: AbortSignal) {
  const response = await fetch(`${directHost}/flags/?v=2`, {
    method: 'HEAD',
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });

  if (!response.ok) throw new Error(`PostHog direct probe failed with status ${response.status}`);
}

async function selectApiHost(directHost: string, proxyHost: string): Promise<string> {
  const storedSelection = readSelectedHost();
  if (storedSelection) {
    return storedSelection === 'direct' ? directHost : proxyHost;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DIRECT_PROBE_TIMEOUT_MS);

  try {
    await probeDirectHost(directHost, controller.signal);
    storeSelectedHost('direct');
    return directHost;
  } catch {
    storeSelectedHost('proxy');
    return proxyHost;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// No component in this app reads PostHog's React context (usePostHog), so a plain
// posthog.init() side effect is used instead of wrapping the tree in <PostHogProvider>.
// That keeps this component isolated (no children to gate behind Suspense) and lets
// posthog-js stay entirely out of the SSR module graph via the .client.tsx boundary.
export function PostHogInit({ envData }: { envData: PostHogEnv | null }) {
  useEffect(() => {
    if (import.meta.env.MODE === 'development') return;
    const e = envData || (import.meta.env as PostHogEnv);
    if (!e.VITE_PUBLIC_POSTHOG_KEY || !e.VITE_PUBLIC_POSTHOG_DIRECT_HOST || !e.VITE_PUBLIC_POSTHOG_UI_HOST || !e.VITE_PUBLIC_POSTHOG_HOST) return;
    if (posthog.__loaded) return;

    const posthogKey = e.VITE_PUBLIC_POSTHOG_KEY;
    const directHost = e.VITE_PUBLIC_POSTHOG_DIRECT_HOST;
    const uiHost = e.VITE_PUBLIC_POSTHOG_UI_HOST;
    const proxyHost = e.VITE_PUBLIC_POSTHOG_HOST;
    let cancelled = false;

    void selectApiHost(directHost, proxyHost).then((apiHost) => {
      if (cancelled || posthog.__loaded) return;

      posthog.init(posthogKey, {
        api_host: apiHost,
        ui_host: uiHost,
        defaults: '2025-05-24',
        capture_exceptions: true,
        capture_performance: true,
        cookieless_mode: 'always',
        loaded: (ph) => {
          // GeoIP is a custom endpoint on the reverse proxy, independent of the
          // PostHog API host selected for analytics requests.
          void fetchGeoIp(proxyHost)
            .then((data) => {
              if (data) ph.register(data);
            })
            .catch(() => {
              // GeoIP enrichment is optional and must not affect analytics.
            });
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [envData]);

  return null;
}

export default PostHogInit;
