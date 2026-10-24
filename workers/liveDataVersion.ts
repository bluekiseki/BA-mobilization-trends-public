// Cheap R2 metadata-only lookup used to key the edge cache for /live: returns null
// (safe fallback to the plain path-based cache key) if the binding is missing or the lookup fails.
export async function getLiveDataVersion(env: Env): Promise<string | null> {
  try {
    const [lastdata, timeline] = await Promise.all([env.MY_BUCKET.head('lastdata.json'), env.MY_BUCKET.head('timeline.json')]);
    if (!lastdata || !timeline) return null;
    return `${lastdata.etag}:${timeline.etag}`;
  } catch {
    return null;
  }
}
