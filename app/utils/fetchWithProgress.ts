export interface DownloadProgress {
  loaded: number;
  // null when the response has no Content-Length header
  total: number | null;
}

// Concatenates received chunks into a single contiguous Uint8Array.
function concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Streaming fetch that reports bytes as they arrive, so large model downloads can drive a
// real progress bar instead of a frozen one. Falls back to a single buffered read when the
// response has no readable body (e.g. some test/polyfill environments).
export async function fetchWithProgress(url: string, onProgress: (progress: DownloadProgress) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);

  const header = response.headers.get('content-length');
  const total = header ? Number(header) : null;

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress({ loaded: bytes.length, total: bytes.length });
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }
  return concatChunks(chunks, loaded);
}

// Same streaming download, JSON-decoded at the end.
export async function fetchJsonWithProgress<T>(url: string, onProgress: (progress: DownloadProgress) => void): Promise<T> {
  const bytes = await fetchWithProgress(url, onProgress);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
