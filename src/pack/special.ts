import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GrokEntry, Lang } from './types';
import { assertNoPua, HAKKA_LITERAL_PUA } from './autolink';

const PACK_DIR: Record<Lang, string> = {
  a: 'pack',
  t: 'ptck',
  h: 'phck',
  c: 'pcck',
};

function escapeSpecialKey(filename: string): string {
  const escaped = filename.replace(/=/g, '%3D');
  return escaped.replace(/[^\x00-\xff]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return `%u${code.toString(16).toUpperCase().padStart(4, '0')}`;
  });
}

function stripPayloadWhitespace(payload: string): string {
  return payload.replace(/\s*\n\s*/g, '');
}

function listSpecialJsonFiles(langDir: string, prefix: string): string[] {
  if (!fs.existsSync(langDir)) return [];
  return fs
    .readdirSync(langDir)
    .filter((name) => {
      if (!name.startsWith(prefix) || !name.endsWith('.json')) return false;
      if (prefix === '=' && name === '=.json') return false;
      return true;
    })
    .sort()
    .map((name) => path.join(langDir, name));
}

function writeSpecialPack(
  lang: Lang,
  outputDir: string,
  special: '=' | '@',
  files: string[],
): void {
  if (files.length === 0) return;
  const packDir = path.join(outputDir, PACK_DIR[lang]);
  fs.mkdirSync(packDir, { recursive: true });
  const outPath = path.join(packDir, `${special}.txt`);
  let body = '{';
  let printed = 0;
  for (const file of files) {
    const base = path.basename(file, '.json');
    if (special === '=' && base === '=') continue;
    const payload = stripPayloadWhitespace(fs.readFileSync(file, 'utf8'));
    assertNoPua(payload, `special ${lang}/${base}.json`, lang === 'h' ? HAKKA_LITERAL_PUA : undefined);
    const escaped = escapeSpecialKey(base);
    if (printed === 0) {
      body += `"${escaped}":${payload}`;
    } else {
      body += `,\n"${escaped}":${payload}`;
    }
    printed++;
  }
  if (printed === 0) return;
  body += '\n}\n';
  assertNoPua(body, `special pack ${lang}/${special}.txt`, lang === 'h' ? HAKKA_LITERAL_PUA : undefined);
  fs.writeFileSync(outPath, body);
}

export function buildSpecialPacks(lang: Lang, outputDir: string): void {
  const langDir = path.join(outputDir, lang);
  for (const special of ['=', '@'] as const) {
    if (special === '@' && lang !== 'a' && lang !== 'c') continue;
    const files = listSpecialJsonFiles(langDir, special);
    writeSpecialPack(lang, outputDir, special, files);
  }
}

export function buildCategoryFiles(
  dictCat: { name: string; entries: string[] }[],
  outputDir: string,
): void {
  for (const { name, entries } of dictCat) {
    const content = JSON.stringify(entries);
    assertNoPua(content, `category =${name}`);
    fs.writeFileSync(path.join(outputDir, `=${name}`), content);
  }
}

const TWBLG_ATTRS: Record<string, true> = {
  '1': true,
  '2': true,
  '5': true,
  '25': true,
};
const IDS_PATTERN = /[⿰⿸]/;
const TWBLG_READING_LABELS: Record<string, string> = {
  '1': '文',
  '2': '白',
  '3': '俗',
  '4': '替',
};

export async function buildTwblgIndex(csvPath: string, outputPath: string): Promise<void> {
  const raw = await Bun.file(csvPath).text();
  const entries: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const row = parseCsvLine(line);
    if (row.length < 3) continue;
    const attr = row[1]!.trim();
    const title = row[2]!.trim();
    if (!TWBLG_ATTRS[attr]) continue;
    if (IDS_PATTERN.test(title)) continue;
    entries.push(title);
  }
  const unique = [...new Set(entries)].sort();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const content = JSON.stringify(unique, null, 1) + '\n';
  assertNoPua(content, `twblg index ${outputPath}`);
  fs.writeFileSync(outputPath, content);
}

/**
 * Restore source attr=2 readings for titles that already have a dictionary
 * entry. The legacy JSON generator selects attrs 1/25, so otherwise valid
 * alternate readings such as 蛇 siâ disappear with their empty definition
 * lists. Attr=2-only titles remain excluded: this function enriches entries
 * rather than creating definition-less headwords without stroke metadata.
 *
 * 主編碼 is deliberately not copied. Packed Taiwanese `_` identifiers are
 * treated by clients as audio filenames, which attr=2 source rows do not
 * guarantee.
 */
export function appendTwblgEmptyReadings(
  entries: GrokEntry[],
  csvPath: string,
): void {
  const entriesByTitle = new Map<string, GrokEntry>();
  for (const entry of entries) {
    const title = entry.t.normalize('NFD');
    if (!entriesByTitle.has(title)) entriesByTitle.set(title, entry);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const row = parseCsvLine(line);
    if (row.length < 5 || row[1]?.trim() !== '2') continue;

    const title = row[2]!.trim().normalize('NFD');
    const trs = row[3]!.trim().normalize('NFD');
    if (!title || !trs) continue;

    const entry = entriesByTitle.get(title);
    if (!entry) continue;
    const heteronyms = Array.isArray(entry.h)
      ? (entry.h as Array<Record<string, unknown>>)
      : [];
    if (!Array.isArray(entry.h)) entry.h = heteronyms;

    const reading = TWBLG_READING_LABELS[row[4]!.trim()];
    const duplicate = heteronyms.some(
      (heteronym) =>
        typeof heteronym['T'] === 'string' &&
        heteronym['T'].normalize('NFD') === trs &&
        (heteronym['reading'] ?? '') === (reading ?? ''),
    );
    if (duplicate) continue;

    const heteronym: Record<string, unknown> = { T: trs, d: [] };
    if (reading) heteronym['reading'] = reading;
    heteronyms.push(heteronym);
  }
}

/** Minimal RFC-style CSV row parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  //@ verify
  //@ requires line.length >= 0
  //@ ensures \result.length >= 1
  //@ ensures \result.length <= line.length + 1
  //@ contract Splits on commas outside double-quoted regions; a doubled `"` inside a quoted field decodes to one `"`.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    //@ invariant 0 <= i && i <= line.length
    //@ invariant out.length <= i
    //@ invariant out.length >= 0
    let stride = 1;
    const ch = line.charCodeAt(i);
    if (inQuotes) {
      if (ch === 34) {
        if (i + 1 < line.length && line.charCodeAt(i + 1) === 34) {
          cur += '"';
          stride = 2;
        } else {
          inQuotes = false;
        }
      } else {
        cur += line.slice(i, i + 1);
      }
    } else if (ch === 34) {
      inQuotes = true;
    } else if (ch === 44) {
      out.push(cur);
      cur = '';
    } else {
      cur += line.slice(i, i + 1);
    }
    i = i + stride;
  }
  out.push(cur);
  return out;
}