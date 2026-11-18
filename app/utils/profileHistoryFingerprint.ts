export async function profileHistoryFingerprint(values: Array<{ key: string; value: unknown; schemaVersion: number }>): Promise<string> {
  const serialized = JSON.stringify([...values].sort((a, b) => a.key.localeCompare(b.key)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
