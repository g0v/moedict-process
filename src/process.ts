import * as fs from 'node:fs';
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

function codepointCompare(a: string, b: string): number {
  // JS string comparison is UTF-16 code-unit based; Python's default sort is
  // codepoint based. These differ for supplementary-plane chars (U+10000+)
  // relative to BMP chars above the surrogate range (e.g. U+FA3E vs U+2000D).
  let ai = 0;
  let bi = 0;
  while (ai < a.length && bi < b.length) {
    const ac = a.codePointAt(ai)!;
    const bc = b.codePointAt(bi)!;
    if (ac !== bc) return ac - bc;
    ai += ac > 0xffff ? 2 : 1;
    bi += bc > 0xffff ? 2 : 1;
  }
  return (a.length - ai) - (b.length - bi);
}

export function collectXlsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

/** Mimic parse.py's json_dumps: indent=1 space, sort_keys=True, tabs from leading spaces. */
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
