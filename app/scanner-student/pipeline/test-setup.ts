// jsdom has no canvas backend, so it doesn't implement ImageData. This minimal
// polyfill is only what the ported pipeline tests need (width/height/data).
if (typeof globalThis.ImageData === 'undefined') {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace = 'srgb';
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  Object.assign(globalThis, { ImageData: TestImageData });
}
