import { describe, expect, it } from 'vitest';
import { createInternalSessionRequest } from './internalSessionRequest';

describe('createInternalSessionRequest', () => {
  it('forwards a locale from a localized route', () => {
    const request = createInternalSessionRequest(new Request('https://example.com/ko/settings'));
    expect(request.url).toBe('https://example.com/__internal/session?locale=ko');
  });

  it('does not mistake a route segment for a locale', () => {
    const request = createInternalSessionRequest(new Request('https://example.com/settings'));
    expect(request.url).toBe('https://example.com/__internal/session');
  });

  it('prefers and normalizes an explicit locale', () => {
    const request = createInternalSessionRequest(new Request('https://example.com/settings'), 'zh-TW');
    expect(request.url).toBe('https://example.com/__internal/session?locale=zh-Hant');
  });
});
