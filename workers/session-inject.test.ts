import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectSessionData } from './session-inject';

const request = new Request('https://example.com/ko/planner/event/854', {
  headers: { Cookie: 'better-auth.session_token=test' },
});

function htmlResponse(): Response {
  return new Response('<html><head></head><body>Page</body></html>', {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'max-age=600, s-maxage=7200',
      ETag: '"shared-page"',
      'Last-Modified': 'Mon, 28 Sep 2026 04:07:10 GMT',
    },
  });
}

function authEnv(response: Response | Error): Env {
  return {
    AUTH_WORKER: {
      fetch: vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
    },
  } as unknown as Env;
}

describe('injectSessionData', () => {
  const appendedScripts: string[] = [];

  beforeEach(() => {
    appendedScripts.length = 0;
    vi.stubGlobal(
      'HTMLRewriter',
      class {
        private elementHandler: ((element: { append: (html: string) => void }) => void) | undefined;

        on(_selector: string, handlers: { element: (element: { append: (html: string) => void }) => void }): this {
          this.elementHandler = handlers.element;
          return this;
        }

        transform(response: Response): Response {
          this.elementHandler?.({ append: (html) => appendedScripts.push(html) });
          return response;
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps personalized HTML out of the browser cache', async () => {
    const result = await injectSessionData(htmlResponse(), request, authEnv(new Response('{"user":{"id":"user-1"},"profiles":[]}')));

    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.has('ETag')).toBe(false);
    expect(result.headers.has('Last-Modified')).toBe(false);
    expect(appendedScripts).toEqual(['<script id="__ba_session__" type="application/json">{"user":{"id":"user-1"},"profiles":[]}</script>']);
  });

  it.each([new Response(null, { status: 204 }), new Error('Auth worker unavailable')])('does not cache HTML when session lookup has no payload', async (authResponse) => {
    const result = await injectSessionData(htmlResponse(), request, authEnv(authResponse));

    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.has('ETag')).toBe(false);
    expect(result.headers.has('Last-Modified')).toBe(false);
    expect(appendedScripts).toEqual([]);
  });
});
