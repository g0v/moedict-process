import * as XLSX from 'xlsx';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSqlite } from '../src/convert-to-sqlite';
import { processXlsxFiles, serializeDictionaryJson } from '../src/process';

XLSX.set_fs(fs);

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(here, '..', 'dict-revised.schema');

function modernRow(fields: {
  title: string;
  term_type?: number;
  radical?: string;
  stroke_count?: number;
  non_radical_stroke_count?: number;
  bopomofo?: string;
  pinyin?: string;
  synonyms?: string;
  antonyms?: string;
  definitions?: string;
  notes?: string;
}): unknown[] {
  const row = new Array(18).fill('');
  row[0] = fields.title;
  row[2] = fields.term_type ?? 2;
  row[4] = fields.radical ?? '';
  row[5] = fields.stroke_count ?? '';
  row[6] = fields.non_radical_stroke_count ?? '';
  row[8] = fields.bopomofo ?? '';
  row[11] = fields.pinyin ?? '';
  row[13] = fields.synonyms ?? '';
  row[14] = fields.antonyms ?? '';
  row[15] = fields.definitions ?? '';
  row[16] = fields.notes ?? '';
  return row;
}

function writeXlsx(filePath: string, rows: unknown[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filePath);
}

describe('end-to-end: xlsx → json → sqlite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-e2e-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('converts a realistic duplicate-heteronym fixture through the full pipeline and writes a queryable sqlite db', () => {
    const xlsxPath = path.join(tmpDir, 'fixture.xlsx');
    writeXlsx(xlsxPath, [
      new Array(18).fill('header'),
      modernRow({
        title: '花枝招展',
        bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ',
        pinyin: 'huā zhī zhāo zhǎn',
        definitions: '形容花木枝葉迎風搖擺，婀娜多姿的樣子。',
      }),
      modernRow({
        title: '花枝招展',
        bopomofo: 'ㄏㄨㄚ　ㄓ　ㄓㄠ　ㄓㄢˇ',
        pinyin: 'huā zhī zhāo zhǎn',
        definitions: '形容花木枝葉迎風搖擺，婀娜多姿的樣子。比喻女子打扮豔麗。',
      }),
      modernRow({
        title: '耀',
        term_type: 1,
        radical: '羽',
        stroke_count: 20,
        non_radical_stroke_count: 14,
        bopomofo: 'ㄧㄠˋ',
        pinyin: 'yào',
        definitions: '[名]光輝、光彩。',
      }),
    ]);

    const { entries, rowsParsed } = processXlsxFiles([xlsxPath]);
    expect(rowsParsed).toBe(3);

    const hua = entries.find((e) => e.title === '花枝招展')!;
    expect(hua.heteronyms).toHaveLength(1);
    const huaDef = hua.heteronyms[0]!.definitions!;
    expect(huaDef).toHaveLength(1);

    const yao = entries.find((e) => e.title === '耀')!;
    expect(yao.radical).toBe('羽');
    expect(yao.stroke_count).toBe(20);
    expect(yao.heteronyms[0]!.definitions![0]!.type).toBe('名');

    const jsonPath = path.join(tmpDir, 'dict.json');
    const dbPath = path.join(tmpDir, 'dict.sqlite3');
    fs.writeFileSync(jsonPath, serializeDictionaryJson(entries));

    buildSqlite({ jsonPath, dbPath, schemaPath: SCHEMA_PATH });

    const db = new Database(dbPath);
    try {
      const titles = db.prepare('SELECT title FROM entries ORDER BY title').all() as Array<{ title: string }>;
      expect(titles.map((row) => row.title).sort()).toEqual(['耀', '花枝招展'].sort());
      const huaHeteronyms = db.prepare('SELECT bopomofo FROM heteronyms h JOIN entries e ON h.entry_id=e.id WHERE e.title=?').all('花枝招展') as Array<{ bopomofo: string }>;
      expect(huaHeteronyms).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
