import { cdn as domain } from '~/data/livedataServer.json';

export const cdn = (path: string) => (import.meta.env.DEV ? path : `https://${domain}/assets/${path.replace(/^\//, '')}`);

// for test
// export const cdn = (path: string) =>  `https://${domain}/assets/${path.replace(/^\//, '')}`;
