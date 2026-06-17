export async function gqlFetch<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  });
  const json: { data?: T; errors?: { message: string }[] } = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}
