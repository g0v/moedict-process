import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { iterateSheetRows } from './excel';
import { mergeRowIntoEntries, parseHeteronym, postProcess } from './parse';
import type { DictionaryEntry } from './types';

export interface ProcessResult {
  entries: DictionaryEntry[];
  filesSeen: number;
  rowsParsed: number;
}

export function processXlsxFiles(paths: readonly string[]): ProcessResult {
  const map = new Map<string, DictionaryEntry>();
  let rowsParsed = 0;

  for (const filePath of paths) {
    for (const row of iterateSheetRows(filePath)) {
      try {
        const { basic, heteronym } = parseHeteronym(row);
        if (!basic.title) continue;
        mergeRowIntoEntries(map, basic, heteronym);
        rowsParsed++;
      } catch (err) {
        console.warn(`parse fail on ${filePath}:`, err);
      }
    }
  }

  postProcess(map);

  const entries = Array.from(map.values()).sort((a, b) => codepointCompare(a.title, b.title));
  return { entries, filesSeen: paths.length, rowsParsed };
}

/**
 * Pure recursive spec of codepoint-wise comparison — the verification carrier. The shipping
 * loop `codepointCompare` refines to it via `ensures \result === codepointCompareSpec(a,b)` and
 * the loop invariant `codepointCompareSpec(a,b) === codepointCompareSpec(a.slice(ai), b.slice(bi))`
 * (prefix-stability after equal prefixes). Antisymmetry is the companion ensures lemma
 * `codepointCompareSpec_ensures` (functional induction, generated and verified from the pure spec).
 * Since `codepointCompare` is a Dafny method, loop antisymmetry is not an attached postcondition —
 * callers compose the method's refinement ensures with the spec's antisymmetry lemma. Proof-only.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- proof carrier: referenced only in //@ LemmaScript annotations (ensures/invariant), never called at runtime
function codepointCompareSpec(a: string, b: string): number {
  //@ pure
  //@ verify
  //@ requires a.length >= 0
  //@ requires b.length >= 0
  //@ decreases a.length + b.length
  //@ ensures \result === -codepointCompareSpec(b, a)
  if (a.length === 0 || b.length === 0) {
    return a.length - b.length;
  }
  const aHigh = a.charCodeAt(0);
  const aPair = a.length >= 2 && 0xD800 <= aHigh && aHigh <= 0xDBFF && 0xDC00 <= a.charCodeAt(1) && a.charCodeAt(1) <= 0xDFFF;
  const ac = aPair ? 0x10000 + (aHigh - 0xD800) * 0x400 + (a.charCodeAt(1) - 0xDC00) : aHigh;
  const aStride = aPair ? 2 : 1;
  const bHigh = b.charCodeAt(0);
  const bPair = b.length >= 2 && 0xD800 <= bHigh && bHigh <= 0xDBFF && 0xDC00 <= b.charCodeAt(1) && b.charCodeAt(1) <= 0xDFFF;
  const bc = bPair ? 0x10000 + (bHigh - 0xD800) * 0x400 + (b.charCodeAt(1) - 0xDC00) : bHigh;
  const bStride = bPair ? 2 : 1;
  if (ac !== bc) return ac - bc;
  return codepointCompareSpec(a.slice(aStride), b.slice(bStride));
}

/**
 * Compare two strings by Unicode codepoint (stable dictionary order).
 * JS's lexicographic comparison is UTF-16 code-unit based, which orders
 * BMP chars above the surrogate range (e.g. U+FA3E) AFTER supplementary-plane
 * chars (U+2000D) — wrong for stable dictionary order.
 */
export function codepointCompare(a: string, b: string): number {
  //@ verify
  //@ requires a.length >= 0
  //@ requires b.length >= 0
  //@ ensures a === b ==> \result === 0
  //@ ensures (\result === 0) ==> a === b
  //@ ensures \result === codepointCompareSpec(a, b)
  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    //@ invariant ai === bi
    //@ invariant 0 <= ai && ai <= a.length
    //@ invariant 0 <= bi && bi <= b.length
    //@ invariant forall(k, (0 <= k && k < ai) ==> a.charCodeAt(k) === b.charCodeAt(k))
    //@ invariant codepointCompareSpec(a, b) === codepointCompareSpec(a.slice(ai), b.slice(bi))
    const aHigh = a.charCodeAt(ai);
    let ac = aHigh;
    let aStride = 1;
    if (0xD800 <= aHigh && aHigh <= 0xDBFF && ai + 1 < a.length) {
      const aLow = a.charCodeAt(ai + 1);
      if (0xDC00 <= aLow && aLow <= 0xDFFF) {
        ac = 0x10000 + (aHigh - 0xD800) * 0x400 + (aLow - 0xDC00);
        aStride = 2;
      }
    }
    const bHigh = b.charCodeAt(bi);
    let bc = bHigh;
    let bStride = 1;
    if (0xD800 <= bHigh && bHigh <= 0xDBFF && bi + 1 < b.length) {
      const bLow = b.charCodeAt(bi + 1);
      if (0xDC00 <= bLow && bLow <= 0xDFFF) {
        bc = 0x10000 + (bHigh - 0xD800) * 0x400 + (bLow - 0xDC00);
        bStride = 2;
      }
    }
    if (ac !== bc) return ac - bc;
    ai += aStride;
    bi += bStride;
  }
  return (a.length - ai) - (b.length - bi);
}

/** Deterministic path order for collected .xlsx files. */
export function sortXlsxPaths(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function collectXlsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const glob = new Bun.Glob('**/*');
  for (const rel of glob.scanSync({ cwd: dir, onlyFiles: true })) {
    if (rel.toLowerCase().endsWith('.xlsx')) {
      results.push(path.join(dir, rel));
    }
  }
  return sortXlsxPaths(results);
}

/** indent=1 space, sorted object keys, leading spaces converted to tabs. */
export function serializeDictionaryJson(entries: readonly DictionaryEntry[]): string {
  const raw = JSON.stringify(entries, sortedReplacer, 1);
  return raw.replace(/\n( +)/g, (_match, spaces: string) => `\n${'\t'.repeat(spaces.length)}`);
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
