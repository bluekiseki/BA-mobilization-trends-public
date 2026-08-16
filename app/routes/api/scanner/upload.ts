import { env } from 'cloudflare:workers';
import type { ActionFunctionArgs } from 'react-router';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type ScannerSource = 'item' | 'student';

function isScannerSource(value: string | null): value is ScannerSource {
  return value === 'item' || value === 'student';
}

function isAllowedContentType(source: ScannerSource, contentType: string): boolean {
  return source === 'item' ? contentType.startsWith('image/') : contentType.startsWith('video/');
}

function safeModelVersion(value: string | null): string {
  if (!value) return 'unknown';
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 48);
  return sanitized || 'unknown';
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (origin !== requestUrl.origin || (fetchSite && fetchSite !== 'same-origin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const source = request.headers.get('X-Scanner-Source');
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const declaredSize = Number(request.headers.get('X-Scanner-File-Size'));
  const contentLength = Number(request.headers.get('Content-Length'));
  if (!isScannerSource(source) || !isAllowedContentType(source, contentType)) {
    return Response.json({ error: 'Unsupported scanner source or file type' }, { status: 415 });
  }

  const maxBytes = source === 'item' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isSafeInteger(declaredSize) || !Number.isSafeInteger(contentLength) || declaredSize <= 0 || declaredSize !== contentLength || declaredSize > maxBytes) {
    return Response.json({ error: 'Invalid or oversized file' }, { status: 413 });
  }

  if (!request.body) {
    return Response.json({ error: 'Missing file body' }, { status: 400 });
  }

  const now = new Date();
  const datePath = now.toISOString().slice(0, 10);
  const modelVersion = safeModelVersion(request.headers.get('X-Scanner-Model-Version'));
  const extension =
    source === 'item'
      ? contentType
          .split('/')[1]
          ?.replace(/[^a-z0-9]/g, '')
          .slice(0, 8) || 'image'
      : contentType
          .split('/')[1]
          ?.replace(/[^a-z0-9]/g, '')
          .slice(0, 8) || 'video';
  const key = `scanner-contributions/${source}/${modelVersion}/${datePath}/${crypto.randomUUID()}.${extension}`;

  await env.SCANNER_CONTRIBUTIONS.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: {
      scannerSource: source,
      modelVersion,
      collectedAt: now.toISOString(),
    },
  });

  return Response.json({ stored: true }, { status: 201 });
}
