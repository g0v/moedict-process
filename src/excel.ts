import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import type { SourceCell } from './types';

XLSX.set_fs(fs);

type CellType = 'b' | 'e' | 'n' | 's' | 'd' | 'z';

function cellTypeToCtype(cellType: CellType | undefined): number {
  return cellType === undefined || cellType === 'z' ? 0 : 1;
}

/** Iterate rows of the first sheet of an xlsx file, skipping the header row. */
export function* iterateSheetRows(filePath: string): Generator<SourceCell[]> {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return;
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet || !sheet['!ref']) return;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row: SourceCell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      row.push({
        value: cell?.v ?? '',
        ctype: cellTypeToCtype(cell?.t as CellType | undefined),
      });
    }
    yield row;
  }
}
