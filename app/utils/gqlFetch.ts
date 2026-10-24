interface GqlBody<T> {
  data?: T;
  errors?: { message: string }[];
  error?: string;
}

export async function gqlFetch<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  });
  let json: GqlBody<T> | null = null;
  try {
    json = await res.json<GqlBody<T>>();
  } catch {
    // Non-JSON body (e.g. an upstream error page): handled below via the HTTP status.
  }
  if (json?.errors?.length) throw new Error(json.errors[0].message);
  // A non-2xx response without GraphQL errors (e.g. maintenance 503) must never be read as "no data":
  // callers such as pullAll would otherwise treat it as an empty server profile.
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  if (!json) throw new Error('Invalid GraphQL response');
  return json.data as T;
}
