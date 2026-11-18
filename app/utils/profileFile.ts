export function downloadProfileFile(payload: { data: Record<string, unknown>; profile?: { id: string; name: string; server: string } }, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ ...payload, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
