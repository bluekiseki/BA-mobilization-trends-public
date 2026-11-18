// Column-oriented table. Decompression (gzip) and XOR are handled in hooks/cache.ts; this module only reads the decompressed bytes.
// Layout: [u32 LE header length][header JSON {rows, columns:[{name,dtype,offset,transform?}], meta?}][column data]. Offsets are relative to the start of the column data.

import { gzipDecodeStream } from './xorProcess';

const ARRAYS = { u1: Uint8Array, i1: Int8Array, u2: Uint16Array, i2: Int16Array, u4: Uint32Array, i4: Int32Array } as const;

export type ColumnDtype = keyof typeof ARRAYS;
export type TypedColumn = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array;

export interface ColumnTable {
  rows: number;
  columns: Record<string, TypedColumn>;
  /** Small values attached to the whole table (header meta), if any */
  meta?: Record<string, unknown>;
}

interface TableHeader {
  rows: number;
  meta?: Record<string, unknown>;
  columns: { name: string; dtype: ColumnDtype; offset: number; transform?: 'delta' }[];
}

export function parseTable(buffer: ArrayBuffer): ColumnTable {
  const headerLength = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as TableHeader;
  const dataStart = 4 + headerLength;
  const columns: Record<string, TypedColumn> = {};
  for (const { name, dtype, offset, transform } of header.columns) {
    const Ctor = ARRAYS[dtype];
    if (!Ctor) throw new Error(`unknown column dtype: ${dtype}`);
    const column = new Ctor(buffer, dataStart + offset, header.rows);
    if (transform === 'delta') {
      for (let i = 1; i < column.length; i++) column[i] += column[i - 1];
    }
    columns[name] = column;
  }
  return { rows: header.rows, columns, meta: header.meta };
}

/** Returns a column by name and throws if it is missing. */
export function column(table: ColumnTable, name: string): TypedColumn {
  const c = table.columns[name];
  if (!c) throw new Error(`missing column: ${name}`);
  return c;
}

/** Fetches and decodes a gzip+XOR table file. */
export async function fetchTable(url: string): Promise<ColumnTable> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return parseTable(await new Response(gzipDecodeStream(res.body)).arrayBuffer());
}
