import { cdn as domain } from '~/data/livedataServer.json';

const isDev = import.meta.env.DEV;
const useCdn = !isDev || import.meta.env.VITE_USE_CDN === 'true';

// Pass `forceLocalInDev` for assets that must not be served from the CDN in `dev:cdn` testing
// (e.g. worker/wasm files with same-origin constraints). Has no effect in production.
export const cdn = (path: string, forceLocalInDev?: boolean) => (useCdn && !(isDev && forceLocalInDev) ? `https://${domain}/assets/${path.replace(/^\//, '')}` : path);
