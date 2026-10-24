// @vitest-environment jsdom
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBirthdayPortraits, updateBirthdayDates } from './birthdayStyles.js';
import birthdayScript from './birthdayStyles.js?raw';

// Mirrors the inline bootstrap in BirthdayWidget: the raw source must run without module imports.
function runInline(call: string) {
  runInThisContext(`(()=>{${birthdayScript.replace(/^export /gm, '')}\n${call}})();`);
}

function setup() {
  document.head.innerHTML = '<style id="birthday-dates"></style><style id="birthday-portraits"></style>';
}

function rules(id: string) {
  const element = document.getElementById(id) as HTMLStyleElement;
  return Array.from(element.sheet?.cssRules ?? [])
    .map((rule) => rule.cssText)
    .join('\n');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

describe('cached birthday markup', () => {
  it('uses the local date across year boundaries without changing HTML', () => {
    setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    const html = document.head.innerHTML;
    updateBirthdayDates();
    expect(rules('birthday-dates')).toContain('[data-birthday="12/30"] { display: flex; order: 0; }');
    expect(rules('birthday-dates')).toContain('[data-birthday="1/6"] { display: flex; order: 7; }');
    expect(rules('birthday-dates')).toContain('[data-birthday="12/31"] [data-day-label="0"]');
    expect(document.head.innerHTML).toBe(html);
    vi.setSystemTime(new Date(2027, 0, 1));
    updateBirthdayDates();
    expect(rules('birthday-dates')).not.toContain('[data-birthday="12/30"]');
    expect(rules('birthday-dates')).toContain('[data-birthday="1/1"] [data-day-label="0"]');
  });

  it('includes leap day and can execute independently before React loads', () => {
    setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2028, 1, 28));
    runInline('updateBirthdayDates();');
    expect(rules('birthday-dates')).toContain('[data-birthday="2/29"] [data-day-label="1"]');
  });

  it('starts portraits before hydration and avoids a second request', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ '10000': 'AAAA', '10001': 'invalid"url' }) });
    vi.stubGlobal('fetch', fetchMock);
    const html = document.head.innerHTML;
    runInline("loadBirthdayPortraits('/portraits.json');");
    loadBirthdayPortraits('/portraits.json');
    await vi.waitFor(() => expect(rules('birthday-portraits')).toContain('data:image/webp;base64,AAAA'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rules('birthday-portraits')).not.toContain('10001');
    expect(document.head.innerHTML).toBe(html);
  });

  it('allows retry after portrait failure', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    loadBirthdayPortraits('/portraits.json');
    await vi.waitFor(() => expect(rules('birthday-portraits')).toBe(''));
    loadBirthdayPortraits('/portraits.json');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
