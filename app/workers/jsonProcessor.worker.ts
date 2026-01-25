import * as xz from 'xz-decompress';
import { processStream } from '../utils/xorProcess';

const { XzReadableStream } = xz;

/**
 * Get the URL from the main thread and handle fetch, XOR, decompression, and JSON parsing.
 */
self.onmessage = async (event: MessageEvent<{ url: string; doXor: boolean }>) => {
  const { url, doXor } = event.data;
  console.log('worker-start');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
    if (!response.body) throw new Error(`Response body is null for ${url}`);

    let streamToDecompress: ReadableStream<Uint8Array> = response.body;

    // 1. Process XOR stream (if needed)
    if (doXor) {
      streamToDecompress = processStream(response.body);
    }

    // 2. XZ decompression
    const decompressedStream = new XzReadableStream(streamToDecompress);

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
