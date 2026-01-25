import { useRef, useCallback, useEffect } from 'react';
// Import the worker using Vite&#39;s ?worker syntax.
import JsonProcessorWorker from '../workers/jsonProcessor.worker?worker';

/**
 * A dedicated custom hook for fetching, processing, and caching JSON data.
 * Uses a Web Worker to handle the entire process in the background:
 * fetch > XOR > XZ decompression > JSON parsing,
 * and stores the deserialized object in the cache.
 * * @returns A memoized `fetchAndCacheJson` function.
 */
export const useDataCacheJson = <T>() => {
  const dataCache = useRef<Map<string, Promise<T>>>(new Map());
  // ref to manage the created worker instances
  const workerRef = useRef<Worker | null>(null);

  // effect to clean up running workers when the component unmounts
  useEffect(() => {
    // This return function only executes in the browser when the component unmounts.
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const fetchAndCacheJson = useCallback((url: string, doXor: boolean = true): Promise<T> => {
    // 1. Check cache
    if (dataCache.current.has(url)) {
      return dataCache.current.get(url)!;
    }

    console.log(`[Cache MISS]: ${url}`);

    const promise = new Promise<T>((resolve, reject) => {
      const worker = new JsonProcessorWorker();
      //  return new Promise(() => {}); // A Promise that never resolves/rejects

      // 2. Receive message from worker
      worker.onmessage = (event: MessageEvent<{ status: string; data?: T; error?: string }>) => {
        const { status, data, error } = event.data;

        if (status === 'success' && data) {
          resolve(data as T);
        } else {
          reject(new Error(error || 'Worker failed to return data.'));
        }

        // 3. Terminate worker after task completion (memory cleanup)
        worker.terminate();
      };

      // Worker error handling
      worker.onerror = (e) => {
        dataCache.current.delete(url); // Remove from cache on failure
        reject(e);
        worker.terminate();
      };

      // 4. Post message to worker (request task)
      worker.postMessage({ url, doXor });
    }).catch((error) => {
      // Catch any errors in the Promise chain and clear the cache
      dataCache.current.delete(url);
      throw error; // Rethrow the error so it can be handled at the component level
    });

    // Store the Promise in the cache immediately to prevent duplicate requests
    dataCache.current.set(url, promise);
    return promise;
  }, []);

  return fetchAndCacheJson;
};
