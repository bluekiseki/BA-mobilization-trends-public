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

export function validateUsernameRaw(username: string): string | null {
  if (!USERNAME_REGEX.test(username)) {
    return 'Username must be 3–20 characters (letters, numbers, _ or -)';
  }
  const lower = username.toLowerCase();
  if (RESERVED.some((r) => lower === r || lower.startsWith(r))) {
    return 'This username is reserved';
  }
  if (BLOCKED.some((w) => lower.includes(w))) {
    return 'This username is not allowed';
  }
  return null;
}
