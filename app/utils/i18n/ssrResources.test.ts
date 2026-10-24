// @vitest-environment jsdom
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import { buildI18nPayload, readI18nPayload, serializeI18nPayload } from './ssrResources';

async function makeInstance() {
  const i18n = createInstance();
  await i18n.init({
    resources: {
      en: { common: { a: 'A' }, ui: { b: 'B' }, auth: { c: 'C' } },
    },
  });
  return i18n;
}

describe('buildI18nPayload', () => {
  it('lists the used namespaces plus common, without duplicates or unknown names', async () => {
    const payload = buildI18nPayload(await makeInstance(), ['ui', 'common', 'ui', 'translation']);
    expect(payload.ns).toEqual(['common', 'ui']);
    expect(payload.all.sort()).toEqual(['auth', 'common', 'ui']);
  });
});

describe('serializeI18nPayload / readI18nPayload', () => {
  it('cannot be closed early by a script tag and round-trips', () => {
    const payload = { ns: ['common', '</script><script>alert(1)</script>'], all: ['common'] };
    const html = serializeI18nPayload(payload);
    expect(html.match(/<\/script/g)).toHaveLength(1);

    document.body.innerHTML = html;
    expect(readI18nPayload(document)).toEqual(payload);
    // The element is removed once read
    expect(document.getElementById('__i18n')).toBeNull();
  });

  it('returns null for a missing or malformed payload', () => {
    document.body.innerHTML = '';
    expect(readI18nPayload(document)).toBeNull();
    document.body.innerHTML = '<script id="__i18n" type="application/json">{oops</script>';
    expect(readI18nPayload(document)).toBeNull();
    document.body.innerHTML = '<script id="__i18n" type="application/json">{"ns":[1],"all":[]}</script>';
    expect(readI18nPayload(document)).toBeNull();
  });
});
