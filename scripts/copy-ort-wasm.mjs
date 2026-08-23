// Copies onnxruntime-web's WASM runtime files into public/scanner/ort so they ship as
// static assets in the Cloudflare Pages build (dev server serves them from node_modules
// directly via the `serve-ort-wasm` Vite middleware instead).
import fs from 'fs';
import path from 'path';

const srcDir = path.resolve(import.meta.dirname, '../node_modules/onnxruntime-web/dist');
const destDir = path.resolve(import.meta.dirname, '../public/scanner/ort');

const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  console.log(`Copied ${file}`);
}
