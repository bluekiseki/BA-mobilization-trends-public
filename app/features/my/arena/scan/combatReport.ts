// Tactical Challenge "Combat Report" parser.
// Layout comes from content, not fixed screen coordinates:
// - bar baselines = lowest left/right pair of equal flat dividers; header divider = the pair above it
// - columns = red/blue bars standing on the baseline (red striker, blue special; empty slots are not drawn)
// - icon box = (column spacing × k, offset f) chosen by the best mean embedding score
// - damage label = topmost dark pill in the column between the header divider and the baseline
// - nickname = text after the "Lv.NN" prefix (cut where the default recognizer's CTC frames for the level end), padded;
//   with extra recognizers (Korean on the ko locale) the most confident reading wins
// Header fields (avatar / nickname / result / attack-defense emblem) use a template relative to the baseline.
import { clipBox, close, components, crop, median, padReplicateX, runs, toHsv, type Box, type Pixels } from './image';
import { linePairs, type Segment } from './lines';

export const EMPTY_SID = 0;

// Header template in baseline units: [x0, y0, x1, y1], origin = baseline left end, 1 = baseline length.
const HEADER = {
  avatar: [0.369, -0.677, 0.547, -0.526],
  nick: [0.563, -0.673, 0.993, -0.615],
  result: [0.12, -0.653, 0.324, -0.537],
  emblem: [-0.01, -0.653, 0.092, -0.544],
} as const;
type HeaderKey = keyof typeof HEADER;
const LEVEL_PREFIX = /^\s*L\s*[vV]\.?\s*\d+/;
const NICK_PAD = 0.5; // side padding (× crop height): recognizers drop edge characters on tight crops
const NICK_CUT_MARGIN = 0.1; // (× crop height) past the level's last CTC frame, which can end inside that digit
const ICON_ASPECT = 0.82; // icon height / width
const ICON_SCALES = [0.66, 0.74, 0.82, 0.9];
const ICON_OFFSETS = [0.0, 0.05, 0.1, 0.15, 0.2];

export type SlotRole = 'striker' | 'special';

export interface OcrResult {
  text: string;
  // Mean max-probability of the emitted characters (0 when nothing was emitted).
  conf: number;
  // Per character: x in the crop where its CTC frames end.
  ends: number[];
}

export type Recognizer = (crop: Pixels, digitsOnly: boolean) => Promise<OcrResult>;

export interface ArenaModels {
  // Student id per reference row; similarity() returns one row of cosine scores per crop in this order.
  sids: number[];
  similarity: (crops: Pixels[]) => Promise<Float32Array[]>;
  recognize: Recognizer;
  // Extra nickname-only recognizers (Korean); the default recognizer always competes too.
  nicknameRecognizers: Recognizer[];
}

export interface ParsedSlot {
  sid: number;
  score: number;
  role: SlotRole;
  damage: number | null;
  candidates: { sid: number; score: number }[];
}

export interface ParsedSide {
  nickname: string;
  nicknameBox: Box;
  avatar: { sid: number; score: number };
  won: boolean;
  defending: boolean;
  slots: ParsedSlot[];
}

export interface ParsedReport {
  left: ParsedSide;
  right: ParsedSide;
  iconFit: [number, number];
}

export class ArenaParseError extends Error {}

interface Column {
  cx: number;
  role: SlotRole;
}

function hsvBand(img: Pixels, box: Box) {
  return toHsv(crop(img, box));
}

export function findColumns(img: Pixels, seg: Segment): Column[] {
  const [x0, y, x1] = seg;
  const L = x1 - x0;
  const band = hsvBand(img, clipBox(img.width, img.height, x0, Math.max(0, y - Math.max(4, Math.floor(L / 60))), x1, y - 1));
  const colored: boolean[] = [];
  for (let x = 0; x < band.width; x += 1) {
    let on = 0;
    for (let r = 0; r < band.height; r += 1) {
      const i = r * band.width + x;
      if (band.s[i] > 120 && band.v[i] > 100) on += 1;
    }
    colored.push(on / band.height > 0.5);
  }
  return runs(colored)
    .filter(([a, b]) => b - a >= Math.max(3, L * 0.012))
    .map(([a, b]) => {
      const hues: number[] = [];
      for (let r = 0; r < band.height; r += 1) for (let x = a; x < b; x += 1) hues.push(band.h[r * band.width + x]);
      const hue = median(hues);
      // Bar hue tells the slot type: red/orange = striker, blue = special.
      return { cx: x0 + (a + b) / 2, role: hue >= 90 && hue <= 130 ? 'special' : 'striker' };
    });
}

export function iconBox(img: Pixels, cx: number, y: number, spacing: number, k: number, f: number): Box {
  const w = k * spacing;
  return clipBox(img.width, img.height, cx - w / 2, y + f * w, cx + w / 2, y + f * w + w * ICON_ASPECT);
}

export function headerBox(img: Pixels, seg: Segment, key: HeaderKey): Box {
  const [x0, y, x1] = seg;
  const L = x1 - x0;
  const [a, b, c, d] = HEADER[key];
  return clipBox(img.width, img.height, x0 + a * L, y + b * L, x0 + c * L, y + d * L);
}

function hueRatio(img: Pixels, box: Box, lo: number, hi: number): number {
  const hsv = hsvBand(img, box);
  let on = 0;
  for (let i = 0; i < hsv.h.length; i += 1) if (hsv.h[i] > lo && hsv.h[i] < hi && hsv.s[i] > 120) on += 1;
  return hsv.h.length ? on / hsv.h.length : 0;
}

function rowMax(row: Float32Array): [number, number] {
  let best = 0;
  for (let i = 1; i < row.length; i += 1) if (row[i] > row[best]) best = i;
  return [best, row[best]];
}

function topK(row: Float32Array, sids: number[], k: number): { sid: number; score: number }[] {
  return Array.from(row.keys())
    .sort((a, b) => row[b] - row[a])
    .slice(0, k)
    .map((i) => ({ sid: sids[i], score: row[i] }));
}

async function readDamage(img: Pixels, models: ArenaModels, cx: number, half: number, top: number, y: number, L: number): Promise<number | null> {
  const box = clipBox(img.width, img.height, cx - half, top, cx + half, y - 1);
  const col = crop(img, box);
  const hsv = toHsv(col);
  const dark = new Uint8Array(col.width * col.height);
  for (let i = 0; i < dark.length; i += 1) dark[i] = hsv.v[i] < 110 && hsv.s[i] < 70 ? 1 : 0;
  const k = Math.max(3, Math.trunc(L * 0.016));
  const pills = components(close(dark, col.width, col.height, k, k), col.width, col.height).filter((c) => c.w > L * 0.02 && c.h > L * 0.02);
  if (!pills.length) return null;
  const pill = pills.reduce((best, c) => (c.y < best.y ? c : best));
  const { text } = await models.recognize(crop(col, { x0: pill.x, y0: pill.y, x1: pill.x + pill.w, y1: pill.y + pill.h }), true);
  return text ? Number(text) : null;
}

async function readNickname(box: Pixels, models: ArenaModels): Promise<string> {
  let region = box;
  const head = await models.recognize(box, false);
  const m = LEVEL_PREFIX.exec(head.text);
  if (m) {
    const cut = Math.trunc(head.ends[m[0].length - 1] + NICK_CUT_MARGIN * box.height);
    region = crop(box, { x0: Math.min(cut, box.width - 1), y0: 0, x1: box.width, y1: box.height });
  }
  const padded = padReplicateX(region, Math.trunc(region.height * NICK_PAD));
  // Sequential: one onnxruntime-web session must not run concurrently. Ties keep the earlier (default) reading.
  let best = await models.recognize(padded, false);
  for (const recognize of models.nicknameRecognizers) {
    const r = await recognize(padded, false);
    if (r.conf > best.conf) best = r;
  }
  // The cut can miss (prefix misread), so the prefix is stripped from the text as well.
  return best.text.replace(/^\s*L\s*[vV]\.?\s*\d+\s*/, '').trim();
}

export async function parseCombatReport(img: Pixels, models: ArenaModels): Promise<ParsedReport> {
  const pairs = linePairs(img);
  if (!pairs.length) throw new ArenaParseError('bar baseline not found');
  const base = pairs[pairs.length - 1];
  const head = pairs.length > 1 ? pairs[pairs.length - 2] : null;
  const cols = [findColumns(img, base[0]), findColumns(img, base[1])];
  const gaps = cols.filter((c) => c.length > 1).map((c) => median(c.slice(1).map((col, i) => col.cx - c[i].cx)));
  const spacing = gaps.length ? median(gaps) : (base[0][2] - base[0][0]) / 7;

  // Icon size/offset: candidate that maximizes the mean best-match score over every column.
  const anchors = cols.flatMap((c, s) => c.map((col) => ({ cx: col.cx, y: base[s][1] })));
  let fit: [number, number] = [ICON_SCALES[1], ICON_OFFSETS[3]];
  if (anchors.length) {
    let bestScore = -1;
    for (const k of ICON_SCALES)
      for (const f of ICON_OFFSETS) {
        const rows = await models.similarity(anchors.map((a) => crop(img, iconBox(img, a.cx, a.y, spacing, k, f))));
        const score = rows.reduce((sum, row) => sum + rowMax(row)[1], 0) / rows.length;
        if (score > bestScore) {
          bestScore = score;
          fit = [k, f];
        }
      }
  }
  const [k, f] = fit;

  // Sequential on purpose: one onnxruntime-web session must not run concurrently.
  const sides: { side: Omit<ParsedSide, 'won' | 'defending'>; yellow: number; blue: number }[] = [];
  for (const [s, seg] of base.entries()) {
    const [x0, y, x1] = seg;
    const L = x1 - x0;
    const top = head ? head[s][1] + 2 : Math.max(0, y - L);
    const rows = cols[s].length ? await models.similarity(cols[s].map((c) => crop(img, iconBox(img, c.cx, y, spacing, k, f)))) : [];
    const slots: ParsedSlot[] = [];
    for (let i = 0; i < cols[s].length; i += 1) {
      const candidates = topK(rows[i], models.sids, 3);
      if (candidates[0].sid === EMPTY_SID) continue;
      const damage = await readDamage(img, models, cols[s][i].cx, spacing * 0.45, top, y, L);
      slots.push({ sid: candidates[0].sid, score: candidates[0].score, role: cols[s][i].role, damage, candidates });
    }
    const nicknameBox = headerBox(img, seg, 'nick');
    const nickname = await readNickname(crop(img, nicknameBox), models);
    const [avatarRow] = await models.similarity([crop(img, headerBox(img, seg, 'avatar'))]);
    const [avatarIdx, avatarScore] = rowMax(avatarRow);
    sides.push({
      side: { nickname, nicknameBox, avatar: { sid: models.sids[avatarIdx], score: avatarScore }, slots },
      yellow: hueRatio(img, headerBox(img, seg, 'result'), 20, 35),
      blue: hueRatio(img, headerBox(img, seg, 'emblem'), 90, 115),
    });
  }
  // Ties resolve to the left side.
  const winner = sides[1].yellow > sides[0].yellow ? 1 : 0;
  const defender = sides[1].blue > sides[0].blue ? 1 : 0;
  const toSide = (s: number): ParsedSide => ({ ...sides[s].side, won: winner === s, defending: defender === s });
  return { left: toSide(0), right: toSide(1), iconFit: fit };
}
