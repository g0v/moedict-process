export interface HeteronymLike {
  id?: unknown;
  bopomofo?: unknown;
  pinyin?: unknown;
  trs?: unknown;
  audio_id?: unknown;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/gu, ' ').trim();
}

function phoneticIdentity(heteronym: HeteronymLike): string {
  return JSON.stringify({
    audio_id: normalize(heteronym.audio_id),
    bopomofo: normalize(heteronym.bopomofo),
    pinyin: normalize(heteronym.pinyin),
    trs: normalize(heteronym.trs),
    id: normalize(heteronym.id),
  });
}

function hasIdentity(heteronym: HeteronymLike): boolean {
  return Boolean(
    normalize(heteronym.audio_id) ||
      normalize(heteronym.bopomofo) ||
      normalize(heteronym.pinyin) ||
      normalize(heteronym.trs),
  );
}

/**
 * Deduplicate heteronyms that represent the same phonetic reading.
 *
 * Two heteronyms collide when their (audio_id, bopomofo, pinyin, trs, id)
 * tuples match after whitespace normalization. When duplicates are found,
 * the one with the richer JSON serialization is retained; on a tie, the
 * earlier entry wins.
 *
 * Resolves a long-standing data bug (see 花枝招展 / moedict.tw) where the
 * source spreadsheet encoded the same reading twice — once with ASCII
 * spaces and once with U+3000 ideographic spaces in the bopomofo column —
 * producing two nearly-identical heteronyms per entry.
 */
export function dedupeHeteronyms<T extends HeteronymLike>(heteronyms: readonly T[]): T[] {
  const firstIndexByKey = new Map<string, number>();
  const result: (T | null)[] = heteronyms.slice();

  // Stryker disable next-line EqualityOperator: i <= result.length runs one extra
  // iteration where result[i] is undefined; the !heteronym guard short-circuits
  // it to a no-op, so the off-by-one mutant is observationally equivalent.
  for (let i = 0; i < result.length; i++) {
    const heteronym = result[i];
    if (!heteronym || !hasIdentity(heteronym)) continue;

    const key = phoneticIdentity(heteronym);
    const firstIdx = firstIndexByKey.get(key);

    if (firstIdx === undefined) {
      firstIndexByKey.set(key, i);
      continue;
    }

    const existing = result[firstIdx]!;
    const contentSize = JSON.stringify(heteronym).length;
    const existingSize = JSON.stringify(existing).length;
    if (contentSize > existingSize) {
      result[firstIdx] = heteronym;
    }
    result[i] = null;
  }

  return result.filter((heteronym): heteronym is T => heteronym !== null);
}
