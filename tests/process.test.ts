import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as parseModule from '../src/parse';
import {
  codepointCompare,
  collectXlsxFiles,
  processXlsxFiles,
  serializeDictionaryJson,
  sortXlsxPaths,
} from '../src/process';

XLSX.set_fs(fs);

function headerRow(): unknown[] {
  // 18 columns, modern layout: matches pickColumnMap(18) → MODERN_COLUMNS
  return new Array(18).fill('');
}

function row(overrides: Record<number, unknown> = {}): unknown[] {
  const arr = headerRow();
  for (const [idx, value] of Object.entries(overrides)) {
    arr[Number(idx)] = value;
  }
  return arr;
}

function writeXlsx(filePath: string, rows: unknown[][]): void {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filePath);
}

describe('processXlsxFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-process-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('combines rows from multiple xlsx files, merges by title, and dedupes', () => {
    const a = path.join(tmpDir, 'a.xlsx');
    const b = path.join(tmpDir, 'b.xlsx');
    writeXlsx(a, [
      headerRow(),
      row({ 0: '花枝招展', 2: 2, 8: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ', 11: 'huā zhī zhāo zhǎn', 15: '形容花木枝葉迎風搖擺。' }),
    ]);
    writeXlsx(b, [
      headerRow(),
      row({ 0: '花枝招展', 2: 2, 8: 'ㄏㄨㄚ　ㄓ　ㄓㄠ　ㄓㄢˇ', 11: 'huā zhī zhāo zhǎn', 15: '形容花木枝葉迎風搖擺。比喻女子打扮豔麗。' }),
      row({ 0: '耀', 2: 1, 4: '羽', 5: 20, 6: 14, 8: 'ㄧㄠˋ', 11: 'yào', 15: '光輝、光彩。' }),
    ]);

    const { entries, filesSeen, rowsParsed } = processXlsxFiles([a, b]);
    expect(filesSeen).toBe(2);
    expect(rowsParsed).toBe(3);
    expect(entries.map((e) => e.title)).toEqual(['耀', '花枝招展']);
    const hua = entries.find((e) => e.title === '花枝招展')!;
    expect(hua.heteronyms).toHaveLength(1);
    expect(hua.heteronyms[0]!.definitions).toHaveLength(1);
  });

  it('ignores rows without a title', () => {
    const a = path.join(tmpDir, 'a.xlsx');
    writeXlsx(a, [headerRow(), row({ 0: '', 15: 'x' }), row({ 0: '有名字' })]);
    const { entries, rowsParsed } = processXlsxFiles([a]);
    expect(rowsParsed).toBe(1);
    expect(entries.map((e) => e.title)).toEqual(['有名字']);
  });

  it('logs a warning and continues when parseHeteronym throws on a row', () => {
    // Tests the catch-and-warn block: if either the catch body or the
    // file-path interpolation in the warn message is removed, errors
    // would be swallowed silently or lose actionable context.
    const spy = spyOn(parseModule, 'parseHeteronym').mockImplementation(() => {
      throw new Error('boom');
    });
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const a = path.join(tmpDir, 'broken.xlsx');
      writeXlsx(a, [headerRow(), row({ 0: 'whatever' })]);
      const { rowsParsed } = processXlsxFiles([a]);
      expect(rowsParsed).toBe(0);
      expect(warn).toHaveBeenCalled();
      const message = warn.mock.calls[0]![0] as string;
      expect(message).toContain(a);
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('sortXlsxPaths', () => {
  it('sorts an intentionally unsorted path list with localeCompare', () => {
    // Pure unit test: feed reverse order so sort must do real work, independent of FS readdir order.
    const unsorted = [
      path.join('sub', 'e.xlsx'),
      path.join('sub', 'd.xlsx'),
      'c.xlsx',
      'b.xlsx',
      'a.xlsx',
    ];
    expect(sortXlsxPaths(unsorted)).toEqual([
      'a.xlsx',
      'b.xlsx',
      'c.xlsx',
      path.join('sub', 'd.xlsx'),
      path.join('sub', 'e.xlsx'),
    ]);
  });
});

describe('collectXlsxFiles', () => {
  it('collects nested .xlsx paths, excludes non-xlsx, and returns localeCompare order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-collect-'));
    try {
      fs.mkdirSync(path.join(tmp, 'sub'));
      // 'ignored.txt' — must be filtered out (kills the .xlsx-suffix
      // mutants: `true`, `endsWith("")`, and `isFile() || endsWith('.xlsx')`).
      for (const name of ['a.xlsx', 'b.xlsx', 'c.xlsx', 'ignored.txt', 'sub/d.xlsx', 'sub/e.xlsx']) {
        fs.writeFileSync(path.join(tmp, name), '');
      }
      const files = collectXlsxFiles(tmp);
      expect(files.map((f) => path.relative(tmp, f))).toEqual([
        'a.xlsx',
        'b.xlsx',
        'c.xlsx',
        path.join('sub', 'd.xlsx'),
        path.join('sub', 'e.xlsx'),
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns [] when directory does not exist', () => {
    expect(collectXlsxFiles('/nonexistent-path-xyz')).toEqual([]);
  });
});

describe('codepointCompare', () => {
  it('returns 0 for byte-equal strings', () => {
    // Kills `+=` → `-=` mutants on stride: under those, ai/bi go negative
    // and codePointAt(-1) returns undefined, leading to NaN comparisons.
    expect(codepointCompare('abc', 'abc')).toBe(0);
  });

  it('returns negative when the shorter string is a prefix of the longer', () => {
    // Kills loop-condition mutants: with `||` instead of `&&`, the loop would
    // continue past the shorter string and read undefined codepoints, returning NaN.
    expect(codepointCompare('A', 'AB')).toBeLessThan(0);
  });

  it('returns positive when the longer string starts with the shorter', () => {
    expect(codepointCompare('AB', 'A')).toBeGreaterThan(0);
  });

  it('returns the first-codepoint difference for shared-prefix strings of equal length', () => {
    // Kills `if (true) return ac - bc` mutant: under it, the function returns
    // 0 from the first equal codepoint instead of advancing to the difference.
    expect(codepointCompare('AB', 'AC')).toBeLessThan(0);
    // Same case kills `true`/`<=` ConditionalExpression mutants on stride —
    // both of those advance by 2 past the first 'A', skipping the differing
    // second char.
  });

  it('treats supplementary-plane codepoints as a single unit (2-unit stride)', () => {
    // Real moedict title 𨉣腰 (U+28263 + U+8170): the supp-plane prefix must
    // be walked as one logical char. Mutant `<` (`cp < 0xffff ? 2 : 1`) would
    // stride 1 for U+28263, then read the lone low surrogate on the next iter.
    expect(codepointCompare('𨉣A', '𨉣B')).toBeLessThan(0);
    expect(codepointCompare('𡙇', '𨉣')).toBeLessThan(0); // 0x21647 < 0x28263
  });

  it('treats U+FFFF as a BMP codepoint (stride 1, not 2) — both ai and bi sides', () => {
    // Kills `>=` mutant on either stride line: under it, the U+FFFF prefix
    // strides 2 (overshooting), and the asymmetric tail computation gives a
    // wrong sign. Test both directions to cover both ai (line 52) and bi (line 53).
    expect(codepointCompare('￿A', '￿B')).toBeLessThan(0);
    expect(codepointCompare('￿B', '￿A')).toBeGreaterThan(0);
  });

  it('orders codepoint-sort baseline: BMP-compat before supplementary-plane', () => {
    // Historical codepoint order: U+6168 (慨) < U+FA3E (compat) < U+2000D (supp).
    // JS UTF-16 lex would mis-order the latter two.
    const sorted = ['慨', '\u{FA3E}', '\u{2000D}'].sort(codepointCompare);
    expect(sorted.map((c) => c.codePointAt(0))).toEqual([0x6168, 0xfa3e, 0x2000d]);
  });
});

describe('serializeDictionaryJson', () => {
  it('produces tab-indented JSON (historical dictionary dump format)', () => {
    const out = serializeDictionaryJson([{ title: '甲', heteronyms: [{ bopomofo: 'ㄐㄧㄚˇ' }] }]);
    expect(out).toContain('\n\t\t"title": "甲"');
    expect(out).toContain('\n\t\t\t{');
    expect(out).not.toMatch(/\n {2,}/); // no literal multi-space indents leaked through
  });

  it('sorts object keys alphabetically (historical sorted-key dump order)', () => {
    const out = serializeDictionaryJson([{ title: '乙', heteronyms: [{ pinyin: 'yǐ', bopomofo: 'ㄧˇ' }] }]);
    // "heteronyms" must appear before "title", and "bopomofo" before "pinyin"
    expect(out.indexOf('heteronyms')).toBeLessThan(out.indexOf('title'));
    expect(out.indexOf('bopomofo')).toBeLessThan(out.indexOf('pinyin'));
  });
});

describe('processXlsxFiles — codepoint-based title sort (parity)', () => {
  it('sorts by Unicode codepoint so BMP compat chars (U+FA3E) come before supplementary-plane chars (U+2000D)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-sort-'));
    const file = path.join(tmp, 'a.xlsx');
    const header = new Array(18).fill('');
    function titleRow(title: string) {
      const r = header.slice();
      r[0] = title;
      r[2] = 1;
      r[4] = 'x';
      r[5] = 1;
      r[6] = 0;
      r[8] = 'ㄎㄞˇ';
      r[11] = 'kǎi';
      r[15] = 'def';
      return r;
    }
    const sheet = XLSX.utils.aoa_to_sheet([header, titleRow('\u{FA3E}'), titleRow('\u{2000D}'), titleRow('慨')]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    XLSX.writeFile(wb, file);

    try {
      const { entries } = processXlsxFiles([file]);
      expect(entries.map((e) => e.title.codePointAt(0))).toEqual([0x6168, 0xfa3e, 0x2000d]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
