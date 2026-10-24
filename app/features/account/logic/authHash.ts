const RESERVED = ['admin', 'administrator', 'moderator', 'staff', 'yuzutrends', 'bluearchive', 'nexon', 'yostar', 'system', 'support', 'root', 'superuser'];

export function filterUsernameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function filterPrintableAscii(raw: string): string {
  // Strip anything outside printable ASCII (keyboard-typeable chars only)
  return raw.replace(/[^\x20-\x7E]/g, '');
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

const BLOCKED = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'ass',
  'dick',
  'cock',
  'pussy',
  'sibal',
  'ssibal',
  'shibal',
  'sshibal',
  'gaeseki',
  'byunta',
  'byun',
  'jotna',
  'jotnara',
  'boji',
  'geshipa',
  'gaesipa',
  'nyeon',
  'kichiku',
];

export type UsernameErrorCode = 'tooShort' | 'tooLong' | 'invalidChars' | 'unavailable';

export function validateUsernameRaw(username: string): UsernameErrorCode | null {
  if (username.length < 3) return 'tooShort';
  if (username.length > 20) return 'tooLong';
  if (!USERNAME_REGEX.test(username)) return 'invalidChars';
  const lower = username.toLowerCase();
  if (RESERVED.some((r) => lower === r || lower.startsWith(r))) return 'unavailable';
  if (BLOCKED.some((w) => lower.includes(w))) return 'unavailable';
  return null;
}
