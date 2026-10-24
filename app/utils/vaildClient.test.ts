import { describe, expect, it } from 'vitest';
import { domain } from '~/data/livedataServer.json';
import { vaildClient } from './vaildClient';

function req(headers: Record<string, string>): Request {
  return new Request(`https://${domain}/api/notices`, { headers });
}

describe('vaildClient', () => {
  it('accepts a same-origin referer', () => {
    expect(vaildClient(req({ Referer: `https://${domain}/ko/notices`, 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
  });

  it('rejects referers that only share the allowed string as a prefix', () => {
    expect(vaildClient(req({ Referer: `https://${domain}.security-probe.invalid/` }))).toBe(false);
    expect(vaildClient(req({ Referer: `https://${domain}@security-probe.invalid/` }))).toBe(false);
  });

  it('rejects a missing or malformed referer', () => {
    expect(vaildClient(req({}))).toBe(false);
    expect(vaildClient(req({ Referer: 'not a url' }))).toBe(false);
  });
});
