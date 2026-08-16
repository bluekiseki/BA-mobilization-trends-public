// app/routes/locales.ts
import { data } from 'react-router';
import { cacheHeader } from '~/utils/cacheControl';
import { z } from 'zod';
import resources from '~/locales';
import type { Route } from './+types/locales';
import { vaildClient } from '~/utils/vaildClient';

export function loader({ request, params }: Route.LoaderArgs) {
  if (!vaildClient(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  if (params.ns == 'translation') {
    const headers = new Headers();

    // On production, we want to add cache headers to the response
    if (process.env.NODE_ENV === 'production') {
      headers.set(
        'Cache-Control',
        cacheHeader({
          maxAge: '10m',
          sMaxage: '1d',
          staleWhileRevalidate: '4h',
          staleIfError: '7d',
        }),
      );
    }
    return data({}, { headers });
  }

  const lng = z.enum(Object.keys(resources) as Array<keyof typeof resources>).safeParse(params.lng);
  if (lng.error) return data({ error: lng.error }, { status: 400 });
  const namespaces = resources[lng.data];
  const nsKeys = Object.keys(namespaces) as [string, ...string[]];

  const ns = z.enum(nsKeys).safeParse(params.ns);
  if (ns.error) return data({ error: ns.error }, { status: 400 });

  const headers = new Headers();

  // On production, we want to add cache headers to the response
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Cache-Control',
      cacheHeader({
        maxAge: '10m', // Short-term browser cache
        sMaxage: '2h', // CDN cache
        staleWhileRevalidate: '4h',
        staleIfError: '7d',
      }),
    );
  }

  const translation = (namespaces as Record<string, unknown>)[ns.data];
  return data(translation, { headers });
}
