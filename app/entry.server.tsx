//for vercel
/*
import { PassThrough } from "node:stream";

import type {
  EntryContext,
  RouterContextProvider,
} from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { getInstance } from "~/middleware/i18next";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  entryContext: EntryContext,
  routerContext: RouterContextProvider,
) {

  return new Promise(async (resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || entryContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    let { pipe, abort } = renderToPipeableStream(
      // <I18nextProvider i18n={i18nextInstance}>
      <I18nextProvider i18n={getInstance(routerContext)}>
        <ServerRouter context={entryContext} url={request.url} />
      </I18nextProvider>,
      {
        [readyOption]() {
          shellRendered = true;

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming errors from inside shell; skip initial shell rendering errors (logged elsewhere).
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
*/

// for cloudflare worker
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { ServerRouter } from 'react-router';
import { getInstance } from './middleware/i18next';
import { buildI18nPayload, serializeI18nPayload } from './utils/i18n/ssrResources';

export default async function handleRequest(request: Request, responseStatusCode: number, responseHeaders: Headers, routerContext: EntryContext, loadContext: RouterContextProvider) {
  let shellRendered = false;
  const userAgent = request.headers.get('user-agent');

  const instance = getInstance(loadContext);

  const rendered = await renderToReadableStream(
    <I18nextProvider i18n={instance}>
      <ServerRouter context={routerContext} url={request.url} />
    </I18nextProvider>,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming errors; initial shell-render errors are already logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  // Once every Suspense boundary has streamed, the namespaces this render used are known.
  // Appending them lets the client hydrate without fetching each namespace from the CDN in turn.
  const encoder = new TextEncoder();
  const body = rendered.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush(controller) {
        controller.enqueue(encoder.encode(serializeI18nPayload(buildI18nPayload(instance, instance.reportNamespaces?.getUsedNamespaces() ?? []))));
      },
    }),
  );

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await rendered.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
