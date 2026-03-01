// <reference types="vite/client" />
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import vitePluginObfuscator from './plugin/vite-plugin-obfuscator';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { domain, vercelDomain } from './app/data/livedataServer.json';
import { cloudflare } from '@cloudflare/vite-plugin';
import { execSync } from 'child_process';
// import { visualizer } from 'rollup-plugin-visualizer';

let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
  console.warn("Unable to get Git commit hash, replace with 'dev'.");
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }), // for cloudflare
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    // visualizer({
    //   open: true, // When the build is completed, the report automatically appears in the browser.
    //   filename: 'bundle-report.html',
    // }),
    !isSsrBuild &&
      vitePluginObfuscator({
        obfuscatorOptions: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          debugProtectionInterval: 0,
          disableConsoleOutput: false,
          identifierNamesGenerator: 'hexadecimal',
          log: true, // Window.close error when enabled
          numbersToExpressions: true,
          renameGlobals: false,
          selfDefending: true,
          simplify: true,
          splitStrings: false, // plotly.js error when enabled
          stringArray: false, // false -> This increases the build code by 28%
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
          unicodeEscapeSequence: false,
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
          input: './worker/app.ts', // for cloudflare worker
          // input: './server/lambda.ts', // for aws lambda
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
    allowedHosts: [domain, vercelDomain],
  },
}));
