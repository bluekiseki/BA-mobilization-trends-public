// <reference types="vite/client" />
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import vitePluginObfuscator from './plugin/vite-plugin-obfuscator';
import { cloudflareDevProxy } from '@react-router/dev/vite/cloudflare';
import { defineConfig } from 'vite';
// import tsconfigPaths from 'vite-tsconfig-paths';
import { domain } from './app/data/livedataServer.json';
import { cloudflare } from '@cloudflare/vite-plugin';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
// import { visualizer } from 'rollup-plugin-visualizer';

const ENABLE_OBFUSCATION = true;
const ortDistDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');

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

function ortMiddleware() {
  return {
    name: 'serve-ort-wasm',
    configureServer(server: any) {
      server.middlewares.use('/scanner/ort', (req: any, res: any, next: any) => {
        const file = path.join(ortDistDir, req.url.split('?')[0]);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file);
          res.setHeader('Content-Type', ext === '.wasm' ? 'application/wasm' : 'text/javascript');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          fs.createReadStream(file).pipe(res);
        } else {
          next();
        }
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
    command === 'serve' && ortMiddleware(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      ...(command === 'serve' ? { auxiliaryWorkers: [{ configPath: './wrangler.auth.jsonc' }] } : {}),
    }), // for cloudflare
    cloudflareDevProxy({
      configPath: 'wrangler.jsonc', // (If the filename is wrangler.json, please use that)
    }),
    tailwindcss(),
    reactRouter(),
    // tsconfigPaths(),
    // visualizer({
    //   open: true, // When the build is completed, the report automatically appears in the browser.
    //   filename: 'bundle-report.html',
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
  ssr: {
    noExternal: ['posthog-js', '@posthog/react'],
  },
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
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
}));
