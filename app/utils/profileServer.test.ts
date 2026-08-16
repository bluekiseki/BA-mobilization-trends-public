import { describe, expect, it } from 'vitest';
import { getDefaultProfileServer, getProfileServerLabel, getSupportedProfileLocale, PROFILE_SERVERS, toGraphQLProfileServer } from './profileServer';

describe('profile server helpers', () => {
  it.each([
    ['ko', 'kr'],
    ['ko-KR', 'kr'],
    ['ja', 'jp'],
    ['ja-JP', 'jp'],
    ['zh-Hant', 'tw'],
    ['zh_TW', 'tw'],
    ['en', 'na'],
    ['en-US', 'na'],
    ['unknown', 'na'],
  ])('maps locale %s to %s', (locale, expectedServer) => {
    expect(getDefaultProfileServer(locale)).toBe(expectedServer);
  });

  it('only recognizes supported locale values', () => {
    expect(getSupportedProfileLocale('settings')).toBeUndefined();
    expect(getSupportedProfileLocale('zh-TW')).toBe('zh-Hant');
  });

  it('converts every stored server to a GraphQL enum value', () => {
    expect(PROFILE_SERVERS.map(toGraphQLProfileServer)).toEqual(['JP', 'KR', 'TW', 'ASIA', 'GLOBAL', 'NA']);
  });

  it('uses the short GL display label', () => {
    expect(getProfileServerLabel('global')).toBe('GL');
    expect(getProfileServerLabel('na')).toBe('NA');
  });

  it('rejects unsupported stored server values', () => {
    expect(() => toGraphQLProfileServer('both')).toThrow('Unsupported profile server: both');
  });
});
