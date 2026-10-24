import { describe, expect, it } from 'vitest';
import { domain, localUrl, productionUrl } from '~/data/livedataServer.json';
import { checkBrowserMutation, checkBrowserRead, getAllowedOrigins } from './requestGuard';

const prod = { ENVIRONMENT: 'production' };
const dev = { ENVIRONMENT: 'development' };

function req(headers: Record<string, string>): Request {
  return new Request(`${productionUrl}/api/graphql`, { method: 'POST', headers });
}

describe('getAllowedOrigins', () => {
  it('never trusts localhost in production', () => {
    expect(getAllowedOrigins(prod)).toEqual([productionUrl]);
    expect(getAllowedOrigins(dev)).toEqual([localUrl]);
  });
});

describe('checkBrowserMutation', () => {
  const json = { 'Content-Type': 'application/json' };

  it('accepts a same-origin JSON request', () => {
    expect(checkBrowserMutation(req({ ...json, Origin: productionUrl, 'Sec-Fetch-Site': 'same-origin' }), prod)).toBeNull();
  });

  it('rejects a missing Origin', () => {
    expect(checkBrowserMutation(req(json), prod)?.status).toBe(403);
  });

  it('rejects other origins, subdomains and other localhost ports', () => {
    for (const origin of ['https://evil.test', `https://cdn.${domain}`, 'http://localhost:59753', localUrl]) {
      expect(checkBrowserMutation(req({ ...json, Origin: origin }), prod)?.status).toBe(403);
    }
    expect(checkBrowserMutation(req({ ...json, Origin: 'http://localhost:59753' }), dev)?.status).toBe(403);
  });

  it('rejects cross-site Sec-Fetch-Site even with an allowed Origin', () => {
    expect(checkBrowserMutation(req({ ...json, Origin: productionUrl, 'Sec-Fetch-Site': 'same-site' }), prod)?.status).toBe(403);
  });

  it('rejects simple-request content types', () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      expect(checkBrowserMutation(req({ 'Content-Type': type, Origin: productionUrl }), prod)?.status).toBe(415);
    }
  });
});

describe('checkBrowserRead', () => {
  const get = (headers: Record<string, string>) => new Request(`${productionUrl}/x`, { headers });

  it('accepts a same-origin GET that has no Origin header', () => {
    expect(checkBrowserRead(get({ 'Sec-Fetch-Site': 'same-origin' }), prod)).toBeNull();
    expect(checkBrowserRead(get({}), prod)).toBeNull();
  });

  it('rejects a foreign Origin or a cross-site fetch', () => {
    expect(checkBrowserRead(get({ Origin: 'https://evil.test' }), prod)?.status).toBe(403);
    expect(checkBrowserRead(get({ 'Sec-Fetch-Site': 'cross-site' }), prod)?.status).toBe(403);
  });
});
