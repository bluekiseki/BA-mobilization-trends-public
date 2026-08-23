import { diffLines, diffChars, type Change } from 'diff';
import { imageLineToken, parseImageLine } from './notices';

// Fall back to crawled_at when api_modify_date can't distinguish a change. tablePrefix should include trailing dot.
export function effectiveModifyDateSql(tablePrefix = ''): string {
  return `CASE WHEN ${tablePrefix}api_modify_date IS NULL OR ${tablePrefix}api_modify_date = ${tablePrefix}api_create_date THEN ${tablePrefix}crawled_at ELSE ${tablePrefix}api_modify_date END`;
}

// Reduces notice body HTML down to plain text for diffing. Runs in the Workers
// runtime (no DOM available), so this is a plain regex strip rather than DOMPurify.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (_, src: string) => `\n${imageLineToken(src)}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface DiffLineRow {
  type: 'add' | 'remove' | 'context';
  oldLine: number | null;
  newLine: number | null;
  text: string;
  parts?: Change[]; // char-level diff against the paired line, for inline highlighting
}
export type DiffRow = DiffLineRow | { type: 'skip'; count: number };

// GitHub/wiki-style line diff: each row keeps its old/new line number, so a change
// reads as "which line" rather than a blob of highlighted words.
export function buildLineDiff(oldText: string, newText: string): DiffLineRow[] {
  let oldLine = 1;
  let newLine = 1;
  const rows: DiffLineRow[] = [];
  for (const part of diffLines(oldText, newText)) {
    const lines = part.value.split('\n');
    if (lines.at(-1) === '') lines.pop();
    for (const text of lines) {
      if (part.added) rows.push({ type: 'add', oldLine: null, newLine: newLine++, text });
      else if (part.removed) rows.push({ type: 'remove', oldLine: oldLine++, newLine: null, text });
      else rows.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, text });
    }
  }
  return rows;
}

// Pair remove/add lines and attach char-level diffs for word-level highlighting; skip image lines.
export function pairLineDiff(rows: DiffLineRow[]): DiffLineRow[] {
  const out = [...rows];
  let i = 0;
  while (i < out.length) {
    if (out[i].type !== 'remove') {
      i++;
      continue;
    }
    let removeEnd = i;
    while (removeEnd + 1 < out.length && out[removeEnd + 1].type === 'remove') removeEnd++;
    let addEnd = removeEnd;
    while (addEnd + 1 < out.length && out[addEnd + 1].type === 'add') addEnd++;

    const pairCount = Math.min(removeEnd - i + 1, addEnd - removeEnd);
    for (let k = 0; k < pairCount; k++) {
      const removeRow = out[i + k];
      const addRow = out[removeEnd + 1 + k];
      if (parseImageLine(removeRow.text) || parseImageLine(addRow.text)) continue;
      const parts = diffChars(removeRow.text, addRow.text);
      out[i + k] = { ...removeRow, parts };
      out[removeEnd + 1 + k] = { ...addRow, parts };
    }
    i = addEnd + 1;
  }
  return out;
}

// Collapses runs of untouched context lines down to a "N unchanged lines" marker,
// keeping a few lines of context around each change (like a unified diff).
export function collapseContextLines(rows: DiffLineRow[], context = 2): DiffRow[] {
  const keep = new Set<number>();
  rows.forEach((row, i) => {
    if (row.type === 'context') return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep.add(j);
  });

  const out: DiffRow[] = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    if (!keep.has(i)) {
      skipped++;
      return;
    }
    if (skipped > 0) out.push({ type: 'skip', count: skipped });
    skipped = 0;
    out.push(row);
  });
  if (skipped > 0) out.push({ type: 'skip', count: skipped });
  return out;
}
