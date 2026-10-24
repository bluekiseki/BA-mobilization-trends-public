import type { i18n as I18n } from 'i18next';

// Namespaces used during SSR, handed to the client so it can fetch them all in parallel
// before hydrating. Without this, each component suspends on its own namespace in turn,
// turning the CDN fetches into a serial waterfall.
export const I18N_PAYLOAD_ID = '__i18n';

export interface I18nPayload {
  // Namespaces the server render used
  ns: string[];
  // Every namespace the server knows about, so the client can prefetch the rest when idle
  all: string[];
}

// `usedNamespaces` comes from react-i18next's reportNamespaces, which records every useTranslation() call during render.
// Names with no server resources (e.g. i18next's implicit 'translation' default) are dropped.
export function buildI18nPayload(i18n: I18n, usedNamespaces: readonly string[]): I18nPayload {
  const all = Object.keys(i18n.store.data.en ?? {});
  const ns = [...new Set(['common', ...usedNamespaces])].filter((n) => all.includes(n));
  return { ns, all };
}

// `<` is escaped so a value containing "</script>" cannot close the tag early.
export function serializeI18nPayload(payload: I18nPayload): string {
  return `<script id="${I18N_PAYLOAD_ID}" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>`;
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

export function readI18nPayload(doc: Document): I18nPayload | null {
  const el = doc.getElementById(I18N_PAYLOAD_ID);
  if (!el?.textContent) return null;
  try {
    const parsed: unknown = JSON.parse(el.textContent);
    if (!parsed || typeof parsed !== 'object') return null;
    const { ns, all } = parsed as Partial<I18nPayload>;
    if (!isStringArray(ns) || !isStringArray(all)) return null;
    return { ns, all };
  } catch {
    return null;
  } finally {
    el.remove();
  }
}
