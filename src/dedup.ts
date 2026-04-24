import { collapseWhitespace } from './normalize';
import type { Heteronym } from './types';

function phoneticIdentity(heteronym: Heteronym): string {
  return JSON.stringify({
    bopomofo: collapseWhitespace(heteronym.bopomofo ?? ''),
    pinyin: collapseWhitespace(heteronym.pinyin ?? ''),
  });
}

function hasIdentity(heteronym: Heteronym): boolean {
  return Boolean(
    collapseWhitespace(heteronym.bopomofo ?? '') ||
      collapseWhitespace(heteronym.pinyin ?? ''),
  );
}

/**
 * Deduplicate heteronyms that represent the same phonetic reading.
 *
 * Two heteronyms are considered the same reading when, after whitespace
 * normalization, their (bopomofo, pinyin) match. When duplicates are found,
 * the one with the richer JSON serialization is retained.
 *
 * This fixes a long-standing data bug (see 花枝招展 / moedict.tw) where the
 * source spreadsheet had the same reading encoded twice — once with ASCII
 * spaces and once with U+3000 ideographic spaces in the bopomofo column —
 * producing two nearly-identical heteronyms per entry.
 */
export function dedupeHeteronyms(heteronyms: readonly Heteronym[]): Heteronym[] {
  const firstIndexByKey = new Map<string, number>();
  const result: (Heteronym | null)[] = heteronyms.slice();

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
    const currentSize = JSON.stringify(heteronym).length;
    const existingSize = JSON.stringify(existing).length;
    if (currentSize > existingSize) {
      result[firstIdx] = heteronym;
    }
    result[i] = null;
  }

  return result.filter((heteronym): heteronym is Heteronym => heteronym !== null);
}
