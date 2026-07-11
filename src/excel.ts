import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { SourceCell } from './types';

export type CellType = 'b' | 'e' | 'n' | 's' | 'd' | 'z';

/** Map an XLSX cell type to empty (0) / non-empty (1) classification. */
export function cellTypeToCtype(cellType: CellType | undefined): number {
  //@ verify
  //@ ensures \result === 0 || \result === 1
  //@ ensures (cellType === undefined || cellType === 'z') ==> \result === 0
  //@ ensures (cellType !== undefined && cellType !== 'z') ==> \result === 1
  return cellType === undefined || cellType === 'z' ? 0 : 1;
}

/** Select a definition-bearing source column: 0=primary, 1=legacy editorial notes. */
export function definitionSourceColumn(rowLength: number, source: number): number {
  //@ verify
  //@ requires rowLength >= 0
  //@ requires source === 0 || source === 1
  //@ ensures (rowLength >= 18 && source === 0) ==> \result === 15
  //@ ensures (rowLength >= 18 && source === 1) ==> \result === -1
  //@ ensures (rowLength < 18 && source === 0) ==> \result === 10
  //@ ensures (rowLength < 18 && source === 1) ==> \result === 11
  //@ ensures rowLength >= 18 ==> \result !== 16
  if (source === 0) return rowLength >= 18 ? 15 : 10;
  return rowLength >= 18 ? -1 : 11;
}

/** Iterate rows of the first sheet of an xlsx file, skipping the header row. */
export function* iterateSheetRows(filePath: string): Generator<SourceCell[]> {
  const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer' });
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
