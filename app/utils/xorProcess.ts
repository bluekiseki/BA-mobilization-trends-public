const MAGIC_NUMBER = [36, 238, 163, 129, 131, 217]; // ^0xd9 XORed
export const KEY_SIZE = 16;
const KEY_SIZE_1 = 15;

/** When `xzMagic` is true (default), the 6 xz magic bytes are prepended (legacy xz files). Use false for gzip files. */
export function processStream(sourceStream: ReadableStream<Uint8Array>, xzMagic = true): ReadableStream<Uint8Array> {
  let key: Uint8Array | null = null;
  let size: number = 0;
  const reader = sourceStream.getReader();

  return new ReadableStream({
    async start(controller) {
      // Helper function to perform XOR operation
      const xorWithKey = (chunk: Uint8Array): Uint8Array => {
        if (!key) {
          throw new Error('Key is not available for XOR operation.');
        }
        const xoredChunk = new Uint8Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          xoredChunk[i] = chunk[i] ^ key[(i + size) & KEY_SIZE_1];
        }
        size += chunk.length;
        return xoredChunk;
      };

      try {
        let isFirstChunk = true;

        // Loop to read from the source stream
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            return;
          }

          if (isFirstChunk) {
            // First 16 bytes are the key. The rest are XORed.
            if (value.length < KEY_SIZE) {
              controller.error(new Error('First chunk is too small to contain the 16-byte key.'));
              return;
            }

            // Store the key
            key = value.slice(0, KEY_SIZE);
            const remainingData = value.slice(KEY_SIZE);

            // XOR the remaining data with the key
            const xoredData = xorWithKey(remainingData);

            // Create a new chunk with the magic number and the processed data
            const magicLength = xzMagic ? MAGIC_NUMBER.length : 0;
            const newChunk = new Uint8Array(magicLength + xoredData.length);
            if (xzMagic) {
              newChunk.set(
                MAGIC_NUMBER.map((v) => v ^ 0xd9),
                0,
              );
            }
            newChunk.set(xoredData, magicLength);

            // Enqueue the new, processed chunk
            controller.enqueue(newChunk);
            isFirstChunk = false;
          } else {
            // All subsequent chunks are simply XORed with the key
            const xoredData = xorWithKey(value);

            controller.enqueue(xoredData);
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

/** Decodes a `[16-byte XOR key][XOR-ed gzip]` response body into a byte stream. With doXor false the body is plain gzip. */
export function gzipDecodeStream(body: ReadableStream<Uint8Array>, doXor = true): ReadableStream<Uint8Array> {
  const source = doXor ? processStream(body, false) : body;
  return source.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
}

/** Fetches a gzip+XOR JSON file and returns the parsed object. */
export async function fetchGzipJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return new Response(gzipDecodeStream(res.body)).json<T>();
}
