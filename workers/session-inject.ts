async function fetchSessionPayload(request: Request, env: Env): Promise<string | null> {
  const resp = await env.AUTH_WORKER.fetch(new Request(new URL('/__internal/session', request.url), { headers: request.headers }));
  if (resp.status !== 200) return null;
  return await resp.text();
}

// Inject session data into <head> of cached HTML (using HTMLRewriter)
// Since the root loader does not read the session, the cache key remains identical regardless of the user
export async function injectSessionData(response: Response, request: Request, env: Env): Promise<Response> {
  try {
    const payload = await fetchSessionPayload(request, env);
    if (!payload) return response;

    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.append(`<script id="__ba_session__" type="application/json">${payload}</script>`, { html: true });
        },
      })
      .transform(response);
  } catch {
    return response;
  }
}
