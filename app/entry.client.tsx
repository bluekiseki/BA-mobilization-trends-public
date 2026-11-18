import i18next from 'i18next';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { HydratedRouter } from 'react-router/dom';
import Fetch from 'i18next-fetch-backend';
import I18nextBrowserLanguageDetector from 'i18next-browser-languagedetector';
import { cdn } from '~/utils/cdn';
import { I18N_PAYLOAD_ID, readI18nPayload } from '~/utils/i18n/ssrResources';

// The entry module script is async, so it can run before the server appends the
// namespace list at the end of the stream. Waiting for parsing involves no network.
function documentParsed(): Promise<void> {
  if (document.getElementById(I18N_PAYLOAD_ID) || document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}

function whenIdle(callback: () => void) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(callback);
  else setTimeout(callback, 1000);
}

async function main() {
  await documentParsed();
  const payload = readI18nPayload(document);

  await i18next
    .use(initReactI18next)
    .use(Fetch)
    .use(I18nextBrowserLanguageDetector)
    .init({
      fallbackLng: 'en',
      // Detect the language from the HTML tag.
      // since the middleware already detected the language server-side
      load: 'currentOnly',
      // Load every namespace the server render used up front, in parallel
      ns: payload?.ns ?? ['common'],
      defaultNS: 'common',
      // Each namespace is fetched for the locale and the en fallback; the default of 10 would split a page's set into batches
      maxParallelReads: 32,
      detection: { order: ['htmlTag'], caches: [] },
      // React already escapes rendered strings; must match the server config to avoid hydration mismatches
      interpolation: { escapeValue: false },
      // An empty string is a deliberate translation (e.g. a unit that one language leaves out); since i18next 27 it would otherwise fall back to the key
      returnEmptyString: true,
      // Refresh cached translations with each deployment so newly added keys are available.
      // In dev the commit hash does not change when uncommitted locale files change, so use a fresh value to bypass stale browser caches.
      backend: { loadPath: cdn(`/locales/{{lng}}/{{ns}}.json?v=${import.meta.env.DEV ? Date.now() : __COMMIT_SHA__}`) },
    });

  startTransition(() => {
    hydrateRoot(
      document,
      <I18nextProvider i18n={i18next}>
        <StrictMode>
          <HydratedRouter />
        </StrictMode>
      </I18nextProvider>,
    );
  });

  // Prefetch the remaining namespaces so later client navigations don't suspend on them
  if (payload) whenIdle(() => void i18next.loadNamespaces(payload.all));
}

main().catch((error: unknown) => console.error(error));
