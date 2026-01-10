// app/routes/locales.ts
import { data } from "react-router";
import { cacheHeader } from "pretty-cache-header";
import { z } from "zod";
import resources from "~/locales";
import type { Route } from "./+types/locales";
import { type Locale } from "~/utils/i18n/config";

export async function loader({ params }: Route.LoaderArgs) {
  if (params.ns == 'translation') {
    const headers = new Headers();

    // On production, we want to add cache headers to the response
    if (process.env.NODE_ENV === "production") {
      headers.set(
        "Cache-Control",
        cacheHeader({
          maxAge: "10m",
          sMaxage: "1d",
          staleWhileRevalidate: "7d",
          staleIfError: "7d",
        }),
      );
    }
    return data({}, { headers })
  }

  const lng = z
    .enum(Object.keys(resources) as Array<keyof typeof resources>)
    .safeParse((params.lng as Locale));

  if (lng.error) return data({ error: lng.error }, { status: 400 });

  const namespaces = resources[lng.data];

  const ns = z
    .enum(Object.keys(namespaces) as Array<keyof typeof namespaces>)
    .safeParse(params.ns);

  // console.log('Object.keys(namespaces)',resources)

  if (ns.error) return data({ error: ns.error }, { status: 400 });

  const headers = new Headers();

  // On production, we want to add cache headers to the response
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Cache-Control",
      cacheHeader({
        maxAge: "5m", // Cache in the browser for 5 minutes
        sMaxage: "1d", // Cache in the CDN for 1 day
        // Serve stale content while revalidating for 7 days
        staleWhileRevalidate: "7d",
        // Serve stale content if there's an error for 7 days
        staleIfError: "7d",
      }),
    );
  }

  return data(namespaces[ns.data], { headers });
}