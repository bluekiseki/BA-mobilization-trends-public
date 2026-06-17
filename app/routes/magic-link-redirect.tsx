import { redirect } from 'react-router';
import type { Route } from './+types/magic-link-redirect';
import { localeLink } from '~/utils/localeLink';
import { env } from 'cloudflare:workers';

interface SessionResponse {
  user: { id: string };
  profiles: unknown[];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const cacheHeaders = { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' };
  try {
    const sessionResp = await env.AUTH_WORKER.fetch(new Request(new URL('/__internal/session', request.url), { headers: request.headers }));
    if (sessionResp.status !== 200) return redirect(localeLink(params.locale, '/login'), { headers: cacheHeaders });

    const session: SessionResponse = await sessionResp.json();
    if (!session?.user?.id) return redirect(localeLink(params.locale, '/login'), { headers: cacheHeaders });

    const passkey = await env.ba_user.prepare('SELECT id FROM passkey WHERE userId = ? LIMIT 1').bind(session.user.id).first<{ id: string }>();

    return redirect(localeLink(params.locale, passkey ? '/settings' : '/signup-passkey'), { headers: cacheHeaders });
  } catch {
    return redirect(localeLink(params.locale, '/login'), { headers: cacheHeaders });
  }
}

export default function MagicLinkRedirect() {
  return null;
}
