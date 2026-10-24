import type { LibAVDecodedFrame, LibAVPlaneLayout } from './libavProtocol';

// Pack padded planes explicitly: libav.js video_packed assumes one byte per sample, including for 10-bit output.
export const packLibAVPlanes = (frame: LibAVDecodedFrame): { data: ArrayBuffer; layout: LibAVPlaneLayout[] } => {
  const width = frame.width ?? 0;
  const height = frame.height ?? 0;
  const sampleBytes = frame.format === 62 ? 2 : 1;
  const chromaX = frame.format === 5 || frame.format === 14 ? 1 : 2;
  const chromaY = frame.format === 0 || frame.format === 12 || frame.format === 62 ? 2 : 1;
  if (![0, 4, 5, 12, 13, 14, 62].includes(frame.format) || !width || !height || !frame.layout) throw new Error(`Unsupported decoded pixel format ${frame.format}`);
  const planes = [{ width, height }, ...Array.from({ length: 2 }, () => ({ width: Math.ceil(width / chromaX), height: Math.ceil(height / chromaY) }))];
  const data = new Uint8Array(planes.reduce((sum, plane) => sum + plane.width * plane.height * sampleBytes, 0));
  const layout: LibAVPlaneLayout[] = [];
  let offset = 0;
  planes.forEach((plane, index) => {
    const original = frame.layout?.[index];
    if (!original) throw new Error('Decoded frame has incomplete planes');
    const stride = plane.width * sampleBytes;
    layout.push({ offset, stride });
    for (let y = 0; y < plane.height; y++) {
      const start = original.offset + y * original.stride;
      if (start + stride > frame.data.byteLength) throw new Error('Decoded plane exceeds its buffer');
      data.set(frame.data.subarray(start, start + stride), offset);
      offset += stride;
    }
  });
  return { data: data.buffer, layout };
};
