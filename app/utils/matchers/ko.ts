import { disassemble, getChoseong } from 'es-hangul';

export default function match(target: string, query: string): boolean {
  if (!target || !query) return false;

  const t = target.trim();
  const q = query.trim();

  // 1. [Basic] Match full characters (Fastest)
  // e.g., '라면' -> '라면'
  if (t.toLowerCase().includes(q.toLowerCase())) {
    return true;
  }

  // 2. Choseong (initial consonant) search, e.g. '라면' -> 'ㄹㅁ'.
  const isChoseongQuery = /[ㄱ-ㅎ]/.test(q) && !/[가-힣]/.test(q);
  if (isChoseongQuery) {
    const tChoseong = getChoseong(t); // '라면' -> 'ㄹㅁ'
    // Whether to remove whitespace before comparison depends on the design (simple inclusion is used here)
    if (tChoseong.includes(q)) {
      return true;
    }
  }

  // 3. [Decomposition] Match incremental typing (Key feature!)
  // e.g., '라면' -> '람' (ㄹ+ㅏ+ㅁ), '라면' -> '라ㅁ' (ㄹ+ㅏ+ㅁ)
  try {
    const tJamo = disassemble(t); // '라면' -> 'ㄹㅏㅁㅕㄴ' (Returns decomposed string)
    const qJamo = disassemble(q); // '람' -> 'ㄹㅏㅁ', '라ㅁ' -> 'ㄹㅏㅁ'

    return tJamo.includes(qJamo);
  } catch (e) {
    console.error(e);
    // Ignore cases where disassembly fails (e.g., due to special characters)
    return false;
  }
}
