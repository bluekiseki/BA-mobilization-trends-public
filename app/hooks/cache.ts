import { useRef, useCallback } from 'react';
import { gzipDecodeStream } from '../utils/xorProcess';

export type fetchCacheProcessor<T> = (url: string, processor: (res: Response) => Promise<T>, doXor?: boolean) => Promise<T>;

/**
 * A custom hook to fetch and cache data to avoid redundant network requests and decompression.
 * The cache is stored in a ref to persist across re-renders without causing them.
 * @returns A memoized function `fetchAndProcessWithCache` to handle data fetching.
 */
export const useDataCache = <T>() => {
  const dataCache = useRef<Map<string, Promise<T>>>(new Map());

  const fetchAndProcessWithCache = useCallback(async (url: string, processor: (res: Response) => Promise<T>, doXor: boolean = true): Promise<T> => {
    const cached = dataCache.current.get(url);
    if (cached !== undefined) {
      return cached;
    }
    const promise = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
        if (!response.body) throw new Error(`Response body is null for ${url}`);

        // const startTime = performance.now();
        const decompressedStream = new Response(gzipDecodeStream(response.body, doXor));

        const data = await processor(decompressedStream);

        return data;
      } catch (e) {
        dataCache.current.delete(url);
        throw e;
      }
    })();

    dataCache.current.set(url, promise);
    return promise;
  }, []);

  return fetchAndProcessWithCache;
};
