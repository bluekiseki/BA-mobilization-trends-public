// <reference types="vite/client" />
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import vitePluginObfuscator from './plugin/vite-plugin-obfuscator.ts';
import { defineConfig } from 'vite';
// import tsconfigPaths from 'vite-tsconfig-paths';
import { domain } from './app/data/livedataServer.json' with { type: 'json' };
import { cloudflare } from '@cloudflare/vite-plugin';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
// import { visualizer } from 'rollup-plugin-visualizer';

const ENABLE_OBFUSCATION = true;

function removeWasmPlugin() {
  return {
    name: 'remove-wasm',
    generateBundle(options: any, bundle: any) {
      for (const fileName in bundle) {
        if (fileName.endsWith('.wasm')) {
          delete bundle[fileName]; // Remove .wasm from build output
        }
      }
    },
  };
}

// Dev only: serve the generated text feeds with the same headers as public/_headers in production.
// Vite's static server sends .txt as bare `text/plain`, which browsers decode as Latin-1.
function textFeedHeadersMiddleware() {
  const publicDir = path.resolve(import.meta.dirname, 'public');
  return {
    name: 'serve-text-feeds',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname !== '/llms.txt' && !pathname.startsWith('/txt/')) return next();
        const file = path.join(publicDir, pathname);
        if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(fs.readFileSync(file));
      });
    },
  };
}

// Dev only: a cross-origin isolated page (routes/planner/ItemScanner.tsx sends COOP/COEP) may only
// start same-origin dedicated workers whose script response also carries COEP (Chromium blocks
// them with ERR_BLOCKED_BY_RESPONSE otherwise). This covers the video scan worker and
// onnxruntime-web's pthread workers. COEP is ignored on worker scripts of non-isolated pages.
function workerCoepMiddleware() {
  return {
    name: 'worker-coep-header',
    configureServer(server: {
      middlewares: { use: (fn: (req: { headers: Record<string, string | string[] | undefined> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void };
    }) {
      server.middlewares.use((req, res, next) => {
        if (req.headers['sec-fetch-dest'] === 'worker') res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
        next();
      });
    },
  };
}

let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
  console.warn("Unable to get Git commit hash, replace with 'dev'.");
}

export default defineConfig(({ isSsrBuild, command }) => ({
  plugins: [
    command === 'serve' && textFeedHeadersMiddleware(),
    command === 'serve' && workerCoepMiddleware(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      ...(command === 'serve' ? { auxiliaryWorkers: [{ configPath: './wrangler.auth.jsonc' }] } : {}),
    }), // for cloudflare
    tailwindcss(),
    reactRouter(),
    // tsconfigPaths(),
    // visualizer({
    //   open: false,
    //   gzipSize: true,
    //   filename: isSsrBuild ? 'bundle-report-server.html' : 'bundle-report-client.html',
    // }),
    removeWasmPlugin(),

    !isSsrBuild &&
      ENABLE_OBFUSCATION &&
      vitePluginObfuscator({
        obfuscatorOptions: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          debugProtectionInterval: 0,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          log: false, // Window.close error when enabled
          numbersToExpressions: true,
          renameGlobals: false, // Infinite build loop if enabled
          selfDefending: false,
          simplify: true,
          splitStrings: false, // plotly.js error when enabled, 50% increases
          stringArray: false, // false -> This increases the build bundle by 28%
          stringArrayCallsTransform: false,
          stringArrayEncoding: [],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 1,
          stringArrayWrappersChainedCalls: true,
          stringArrayWrappersParametersMaxCount: 2,
          stringArrayWrappersType: 'function',
          stringArrayThreshold: 0.75,
          unicodeEscapeSequence: true,
        },
      }),
  ],
  build: {
    // target: "esnext",
    sourcemap: false,
    rollupOptions: isSsrBuild
      ? // For server (isSrBuild = true):
        {
          // input: './server/app.ts', // for Vercel
          input: './workers/app.ts', // for cloudflare worker
          // input: './server/lambda.ts', // for aws lambda
          external: ['@zxcvbn-ts/core', '@zxcvbn-ts/language-common', '@zxcvbn-ts/language-en'],
        }
      : // For client (isSrBuild = false):
        {
          output: {
            entryFileNames: `assets/[hash].js`,
            chunkFileNames: `assets/[hash].js`,
            assetFileNames: `assets/[hash].[ext]`,
            // entryFileNames: `assets/[name]-[hash].js`,
            // chunkFileNames: 'chunks/[name]-[hash].js',
            // assetFileNames: `assets/[name]-[hash].[ext]`,
          },
        },
  },
  define: {
    // 'global': 'window', // not work for web worker
    // __COMMIT_SHA__: JSON.stringify(process.env.CF_PAGES_COMMIT_SHA || 'dev-mode'),
    __COMMIT_SHA__: JSON.stringify(commitHash),
  },
  server: {
    allowedHosts: [domain],
  },
  resolve: {
    tsconfigPaths: true,
  },
  // The video scanner worker bundles onnxruntime-web with dynamic imports, which the default iife worker format can't code-split.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web', 'isbot'],
  },
}));
