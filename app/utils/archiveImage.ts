import { archive as archiveDomain } from '~/data/livedataServer.json';

const ARCHIVE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

/** Only http(s) and protocol-relative sources were archived. */
export function isArchivable(src: string): boolean {
  return /^(https?:)?\/\//i.test(src.trim());
}

/** Trim and complete protocol-relative URLs. http and https stay distinct; case and query are kept. */
export function normalizeImageUrl(src: string): string {
  const trimmed = src.trim();
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
}

function pathExtension(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return '';
  }
  const match = /\.([A-Za-z0-9]+)$/.exec(pathname);
  const ext = match?.[1].toLowerCase() ?? '';
  return ARCHIVE_EXTENSIONS.has(ext) ? `.${ext}` : '';
}

const cache = new Map<string, Promise<string>>();

/** Matches the image archive's key: sha256 of the normalized URL, first 16 bytes as hex. */
export function archiveImageUrl(src: string): Promise<string> {
  let found = cache.get(src);
  if (!found) {
    found = computeArchiveUrl(src);
    cache.set(src, found);
  }
  return found;
}

async function computeArchiveUrl(src: string): Promise<string> {
  const normalized = normalizeImageUrl(src);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const hex = Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `https://${archiveDomain}/img/${hex}${pathExtension(normalized)}`;
}
