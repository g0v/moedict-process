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
 * Compare two strings by Unicode codepoint (stable dictionary order).
 * JS's lexicographic comparison is UTF-16 code-unit based, which orders
 * BMP chars above the surrogate range (e.g. U+FA3E) AFTER supplementary-plane
 * chars (U+2000D) — wrong for stable dictionary order.
 */
export function codepointCompare(a: string, b: string): number {
  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    const ac = a.codePointAt(ai)!;
    const bc = b.codePointAt(bi)!;
    if (ac !== bc) return ac - bc;
    // Stryker disable next-line ConditionalExpression: `false` (always stride 1)
    // is observationally equivalent — surrogate pairs are walked one code-unit
    // at a time, but symmetric inputs reach the same comparison points.
    ai += ac > 0xffff ? 2 : 1;
    // Stryker disable next-line ConditionalExpression: see above.
    bi += bc > 0xffff ? 2 : 1;
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
