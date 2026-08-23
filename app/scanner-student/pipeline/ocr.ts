import * as ort from 'onnxruntime-web';
import { imageDataToCanvas } from './image';
import { cdn } from '~/utils/cdn';

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let charactersPromise: Promise<string[]> | null = null;

// modelBytes is fetched by modelLoader.client.ts up front; passing bytes directly avoids a redundant fetch by onnxruntime-web.
export const initOCR = (providers: string[], modelBytes: Uint8Array): Promise<ort.InferenceSession> => {
  if (!sessionPromise) {
    // One thread works on ordinary static hosting without COOP/COEP headers.
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create(modelBytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
  }
  return sessionPromise;
};

const getSession = () => {
  if (!sessionPromise) throw new Error('OCR model not initialized — call initOCR() first');
  return sessionPromise;
};

const getCharacters = () => {
  if (!charactersPromise)
    charactersPromise = fetch(cdn('/student-scanner/models/ppocr_chars.txt'))
      .then((response) => response.text())
      .then((text) => ['blank', ...text.split(/\r?\n/), ' ']);
  return charactersPromise;
};

const resize = (image: ImageData, width: number, height = 48): ImageData => {
  const source = imageDataToCanvas(image);
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const context = target.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas context not available');
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
};

export const recognizeBatch = async (images: ImageData[]): Promise<string[]> => {
  if (!images.length) return [];
  const session = await getSession();
  const characters = await getCharacters();
  const ratios = images.map((image) => image.width / image.height);
  const maxRatio = Math.max(320 / 48, ...ratios);
  const targetWidth = Math.ceil(48 * maxRatio);
  const input = new Float32Array(images.length * 3 * 48 * targetWidth);
  images.forEach((image, batch) => {
    const resizedWidth = Math.min(targetWidth, Math.ceil((48 * image.width) / image.height));
    const resized = resize(image, resizedWidth);
    for (let y = 0; y < 48; y += 1)
      for (let x = 0; x < resizedWidth; x += 1) {
        const source = (y * resizedWidth + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const rgbChannel = 2 - channel;
          input[((batch * 3 + channel) * 48 + y) * targetWidth + x] = (resized.data[source + rgbChannel] / 255 - 0.5) / 0.5;
        }
      }
  });
  const outputMap = await session.run({ x: new ort.Tensor('float32', input, [images.length, 3, 48, targetWidth]) });
  const output = outputMap[session.outputNames[0]];
  const [, steps, classes] = output.dims.map(Number);
  const values = output.data as Float32Array;
  return images.map((_, batch) => {
    let previous = -1;
    let text = '';
    for (let step = 0; step < steps; step += 1) {
      const offset = (batch * steps + step) * classes;
      let best = 0;
      let score = values[offset];
      for (let index = 1; index < classes; index += 1)
        if (values[offset + index] > score) {
          best = index;
          score = values[offset + index];
        }
      if (best !== 0 && best !== previous) text += characters[best] ?? '';
      previous = best;
    }
    return text;
  });
};
