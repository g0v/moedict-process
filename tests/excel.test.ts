import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { iterateSheetRows } from '../src/excel';

XLSX.set_fs(fs);

function writeTestWorkbook(filePath: string, rows: unknown[][]): void {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filePath);
}

describe('iterateSheetRows', () => {
  let tmpDir: string;
  let xlsxPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-excel-'));
    xlsxPath = path.join(tmpDir, 'test.xlsx');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips the header row and yields subsequent rows as SourceCell[]', () => {
    writeTestWorkbook(xlsxPath, [
      ['title', 'term_type', 'bopomofo'],
      ['花枝招展', 2, 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ'],
      ['耀', 1, 'ㄧㄠˋ'],
    ]);
    const rows = Array.from(iterateSheetRows(xlsxPath));
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toMatchObject({ value: '花枝招展' });
    expect(rows[0]![1]).toMatchObject({ value: 2, ctype: 1 });
  });

  it('represents absent cells with ctype=0 to match xlrd semantics', () => {
    const worksheet = XLSX.utils.aoa_to_sheet([['col1', 'col2'], ['甲']]);
    // Widen the declared range so B2 is iterable but not present as a cell.
    worksheet['!ref'] = 'A1:B2';
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, xlsxPath);

    const rows = Array.from(iterateSheetRows(xlsxPath));
    expect(rows).toHaveLength(1);
    expect(rows[0]![1]!.ctype).toBe(0);
  });

  it('returns an empty iterator if the workbook has no sheets with a !ref', () => {
    const empty = path.join(tmpDir, 'empty.xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
    XLSX.writeFile(workbook, empty);
    expect(Array.from(iterateSheetRows(empty))).toEqual([]);
  });
});
