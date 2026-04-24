import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectXlsxFiles, processXlsxFiles, serializeDictionaryJson } from '../src/process';

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
});

describe('collectXlsxFiles', () => {
  it('recursively lists .xlsx files in sorted order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-collect-'));
    try {
      fs.mkdirSync(path.join(tmp, 'sub'));
      for (const name of ['a.xlsx', 'b.xlsx', 'sub/c.xlsx', 'ignored.txt']) {
        fs.writeFileSync(path.join(tmp, name), '');
      }
      const files = collectXlsxFiles(tmp);
      expect(files.map((f) => path.relative(tmp, f))).toEqual(['a.xlsx', 'b.xlsx', path.join('sub', 'c.xlsx')]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns [] when directory does not exist', () => {
    expect(collectXlsxFiles('/nonexistent-path-xyz')).toEqual([]);
  });
});

describe('serializeDictionaryJson', () => {
  it('produces tab-indented JSON to match parse.py output', () => {
    const out = serializeDictionaryJson([{ title: '甲', heteronyms: [{ bopomofo: 'ㄐㄧㄚˇ' }] }]);
    expect(out).toContain('\n\t\t"title": "甲"');
    expect(out).toContain('\n\t\t\t{');
    expect(out).not.toMatch(/\n {2,}/); // no literal multi-space indents leaked through
  });
});
