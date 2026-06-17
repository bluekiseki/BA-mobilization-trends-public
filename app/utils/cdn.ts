import { cdn as domain } from '~/data/livedataServer.json';

const useCdn = !import.meta.env.DEV || import.meta.env.VITE_USE_CDN === 'true';

export const cdn = (path: string) => (useCdn ? `https://${domain}/assets/${path.replace(/^\//, '')}` : path);
