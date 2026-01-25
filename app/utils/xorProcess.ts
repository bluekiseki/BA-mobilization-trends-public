const MAGIC_NUMBER = [36, 238, 163, 129, 131, 217]; // ^0xd9 XORed
export const KEY_SIZE = 16;
const KEY_SIZE_1 = 15;

export function processStream(sourceStream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
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
            const newChunk = new Uint8Array(MAGIC_NUMBER.length + xoredData.length);
            newChunk.set(
              MAGIC_NUMBER.map((v) => v ^ 0xd9),
              0,
            );
            newChunk.set(xoredData, MAGIC_NUMBER.length);

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
      reader.cancel();
    },
  });
}
