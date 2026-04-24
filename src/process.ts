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

  const entries = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  return { entries, filesSeen: paths.length, rowsParsed };
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

/** Mimic parse.py's json_dumps: indent=1 space, then convert each run of leading spaces to tabs. */
export function serializeDictionaryJson(entries: readonly DictionaryEntry[]): string {
  const raw = JSON.stringify(entries, null, 1);
  return raw.replace(/\n( +)/g, (_match, spaces: string) => `\n${'\t'.repeat(spaces.length)}`);
}
