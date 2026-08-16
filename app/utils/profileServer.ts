export const PROFILE_SERVERS = ['jp', 'kr', 'tw', 'asia', 'global', 'na'] as const;

export type ProfileServer = (typeof PROFILE_SERVERS)[number];
export type GraphQLProfileServer = Uppercase<ProfileServer>;

export function isProfileServer(value: string): value is ProfileServer {
  return PROFILE_SERVERS.some((server) => server === value);
}

export function getSupportedProfileLocale(locale: string | undefined): string | undefined {
  const normalizedLocale = locale?.replace('_', '-').toLowerCase();
  if (normalizedLocale === 'en' || normalizedLocale?.startsWith('en-')) return 'en';
  if (normalizedLocale === 'ko' || normalizedLocale?.startsWith('ko-')) return 'ko';
  if (normalizedLocale === 'ja' || normalizedLocale?.startsWith('ja-')) return 'ja';
  if (normalizedLocale === 'zh' || normalizedLocale?.startsWith('zh-')) return 'zh-Hant';
  return undefined;
}

export function getDefaultProfileServer(locale: string): ProfileServer {
  const supportedLocale = getSupportedProfileLocale(locale);
  if (supportedLocale === 'ko') return 'kr';
  if (supportedLocale === 'ja') return 'jp';
  if (supportedLocale === 'zh-Hant') return 'tw';
  return 'na';
}

export function toGraphQLProfileServer(server: string): GraphQLProfileServer {
  if (!isProfileServer(server)) throw new Error(`Unsupported profile server: ${server}`);
  return server.toUpperCase() as GraphQLProfileServer;
}

export function getProfileServerLabel(server: ProfileServer): string {
  return server === 'global' ? 'GL' : server.toUpperCase();
}
