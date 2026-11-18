import { gzipDecodeStream } from '../utils/xorProcess';

/**
 * Get the URL from the main thread and handle fetch, XOR, decompression, and JSON parsing.
 */
self.onmessage = async (event: MessageEvent<{ url: string; doXor: boolean }>) => {
  const { url, doXor } = event.data;
  // console.log('worker-start');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
    if (!response.body) throw new Error(`Response body is null for ${url}`);

    // 1. XOR (if needed) + 2. gzip decompression
    const decompressedStream = gzipDecodeStream(response.body, doXor);

    // 3. Wrap the stream in a Response object and parse using .json() method
    const finalResponse = new Response(decompressedStream);
    const jsonData = await finalResponse.json();

    // 4. Send the parsed JavaScript object to the main thread
    self.postMessage({ status: 'success', data: jsonData });
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: (error as Error).message,
    });
  }
};
