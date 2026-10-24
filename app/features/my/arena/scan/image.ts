// Minimal image primitives for the Tactical Challenge combat report parser.
// Formulas follow OpenCV's 8-bit implementations so results match the reference implementation.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export type Mask = Uint8Array; // 0/1 per pixel, row-major

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Component {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

// Truncating clip: coordinates are truncated, then clamped to the bounds.
export function clipBox(width: number, height: number, x0: number, y0: number, x1: number, y1: number): Box {
  return { x0: Math.max(0, Math.trunc(x0)), y0: Math.max(0, Math.trunc(y0)), x1: Math.min(width, Math.trunc(x1)), y1: Math.min(height, Math.trunc(y1)) };
}

export function crop(img: Pixels, box: Box): Pixels {
  const w = Math.max(0, box.x1 - box.x0);
  const h = Math.max(0, box.y1 - box.y0);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const start = ((box.y0 + y) * img.width + box.x0) * 4;
    data.set(img.data.subarray(start, start + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

// cv2.copyMakeBorder(..., 0, 0, pad, pad, cv2.BORDER_REPLICATE): extends the edge columns sideways.
export function padReplicateX(img: Pixels, pad: number): Pixels {
  const w = img.width + pad * 2;
  const data = new Uint8ClampedArray(w * img.height * 4);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.max(0, x - pad));
      const src = (y * img.width + sx) * 4;
      data.set(img.data.subarray(src, src + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: img.height, data };
}

// cv2.COLOR_RGB2GRAY fixed-point coefficients.
export function toGray(img: Pixels): Int16Array {
  const out = new Int16Array(img.width * img.height);
  const d = img.data;
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) out[i] = (d[p] * 4899 + d[p + 1] * 9617 + d[p + 2] * 1868 + 8192) >> 14;
  return out;
}

const HSV_SHIFT = 12;
const SDIV = new Int32Array(256);
const HDIV = new Int32Array(256);
for (let i = 1; i < 256; i += 1) {
  SDIV[i] = Math.round((255 << HSV_SHIFT) / i);
  HDIV[i] = Math.round((180 << HSV_SHIFT) / (6 * i));
}

export interface Hsv {
  width: number;
  height: number;
  h: Uint8Array; // 0..179
  s: Uint8Array;
  v: Uint8Array;
}

// cv2.COLOR_RGB2HSV for 8-bit images (H in 0..179).
export function toHsv(img: Pixels): Hsv {
  const n = img.width * img.height;
  const h = new Uint8Array(n);
  const s = new Uint8Array(n);
  const v = new Uint8Array(n);
  const d = img.data;
  const round = 1 << (HSV_SHIFT - 1);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    const max = Math.max(r, g, b);
    const diff = max - Math.min(r, g, b);
    let hue: number;
    if (max === r) hue = g - b;
    else if (max === g) hue = b - r + 2 * diff;
    else hue = r - g + 4 * diff;
    hue = (hue * HDIV[diff] + round) >> HSV_SHIFT;
    if (hue < 0) hue += 180;
    h[i] = hue;
    s[i] = (diff * SDIV[max] + round) >> HSV_SHIFT;
    v[i] = max;
  }
  return { width: img.width, height: img.height, h, s, v };
}

// Bilinear resize with OpenCV INTER_LINEAR sampling (half-pixel centers, edge clamp). Returns RGBA.
export function resizeBilinear(img: Pixels, width: number, height: number): Pixels {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  const xs = new Int32Array(width);
  const xw = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    let f = (x + 0.5) * sx - 0.5;
    let i = Math.floor(f);
    f -= i;
    if (i < 0) {
      i = 0;
      f = 0;
    }
    if (i >= img.width - 1) {
      i = img.width - 1;
      f = 0;
    }
    xs[x] = i;
    xw[x] = f;
  }
  for (let y = 0; y < height; y += 1) {
    let fy = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(fy);
    fy -= y0;
    if (y0 < 0) {
      y0 = 0;
      fy = 0;
    }
    if (y0 >= img.height - 1) {
      y0 = img.height - 1;
      fy = 0;
    }
    const y1 = Math.min(y0 + 1, img.height - 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = xs[x];
      const x1 = Math.min(x0 + 1, img.width - 1);
      const fx = xw[x];
      const p00 = (y0 * img.width + x0) * 4;
      const p01 = (y0 * img.width + x1) * 4;
      const p10 = (y1 * img.width + x0) * 4;
      const p11 = (y1 * img.width + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = img.data[p00 + c] * (1 - fx) + img.data[p01 + c] * fx;
        const bottom = img.data[p10 + c] * (1 - fx) + img.data[p11 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width, height, data: out };
}

// Rectangular erode/dilate with OpenCV anchor (k >> 1) and border semantics (border never wins).
function morph1d(src: Mask, width: number, height: number, k: number, horizontal: boolean, dilate: boolean): Mask {
  if (k <= 1) return src.slice();
  const out = new Uint8Array(src.length);
  const anchor = k >> 1;
  const len = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const prefix = new Int32Array(len + 1);
  for (let l = 0; l < lines; l += 1) {
    for (let i = 0; i < len; i += 1) prefix[i + 1] = prefix[i] + src[horizontal ? l * width + i : i * width + l];
    for (let i = 0; i < len; i += 1) {
      const a = Math.max(0, i - anchor);
      const b = Math.min(len, i - anchor + k);
      const ones = prefix[b] - prefix[a];
      out[horizontal ? l * width + i : i * width + l] = dilate ? (ones > 0 ? 1 : 0) : ones === b - a ? 1 : 0;
    }
  }
  return out;
}

function morph(src: Mask, width: number, height: number, kw: number, kh: number, dilate: boolean): Mask {
  return morph1d(morph1d(src, width, height, kw, true, dilate), width, height, kh, false, dilate);
}

export function close(src: Mask, width: number, height: number, kw: number, kh: number): Mask {
  return morph(morph(src, width, height, kw, kh, true), width, height, kw, kh, false);
}

export function open(src: Mask, width: number, height: number, kw: number, kh: number): Mask {
  return morph(morph(src, width, height, kw, kh, false), width, height, kw, kh, true);
}

// 8-connected components in raster order of first pixel (same order as cv2.connectedComponentsWithStats).
export function components(mask: Mask, width: number, height: number): Component[] {
  const labels = new Int32Array(mask.length).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = out.length;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      const px = p % width;
      const py = (p - px) / width;
      area += 1;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = py + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = px + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (mask[q] && labels[q] === -1) {
            labels[q] = id;
            stack.push(q);
          }
        }
      }
    }
    out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }
  return out;
}

// Contiguous true runs → [start, endExclusive].
export function runs(values: ArrayLike<boolean>): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= values.length; i += 1) {
    const on = i < values.length && values[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

// numpy.median semantics (mean of the two middle values for even length).
export function median(values: ArrayLike<number>): number {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

// Rounds ties to even.
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
