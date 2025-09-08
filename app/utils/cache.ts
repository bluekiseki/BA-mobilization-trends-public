import { useRef, useCallback } from 'react';
import { XzReadableStream } from 'xz-decompress';

export type fetchCacheProcessor<T> = (url: string, processor: (res: Response) => Promise<T>) => Promise<T>

/**
 * A custom hook to fetch and cache data to avoid redundant network requests and decompression.
 * The cache is stored in a ref to persist across re-renders without causing them.
 * @returns A memoized function `fetchAndProcessWithCache` to handle data fetching.
 */
export const useDataCache = <T>() => {
  const dataCache = useRef<Map<string, Promise<T>>>(new Map());

  const fetchAndProcessWithCache = useCallback(
    async (url: string, processor: (res: Response) => Promise<T>): Promise<T> => {
      if (dataCache.current.has(url)) {
        // console.log(`[Cache] HIT: ${url}`);
        return dataCache.current.get(url)!;
      }

      // console.log(`[Cache] MISS: ${url}`);

      const promise = (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
          if (!response.body) throw new Error(`Response body is null for ${url}`);

          // Decompress and process
          const decompressedStream = new Response(new XzReadableStream(response.body));
          return await processor(decompressedStream);
        } catch (e) {
          dataCache.current.delete(url);
          throw e;
        }
      })();

      dataCache.current.set(url, promise);
      return promise;
    },
    []
  );

  return fetchAndProcessWithCache;
};