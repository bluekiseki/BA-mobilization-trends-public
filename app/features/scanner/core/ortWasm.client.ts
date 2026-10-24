import type { Env } from 'onnxruntime-web';
import { cdn } from '~/utils/cdn';

// Blob workers inherit the document's COEP. Keep the URL alive for ORT's runtime,
// including lazily started pthreads, instead of loading a CDN worker directly.
// Returns null when the worker script cannot be fetched; the caller must then run single-threaded.
export async function threadedWasmPaths(): Promise<Env.WasmPrefixOrFilePaths | null> {
  const prefix = cdn('/scanner/ort/');
  try {
    const response = await fetch(`${prefix}ort-wasm-simd-threaded.jsep.mjs`);
    if (!response.ok) return null;
    const mjs = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: 'text/javascript' }));
    return { mjs, wasm: `${prefix}ort-wasm-simd-threaded.jsep.wasm` };
  } catch {
    return null;
  }
}
