import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(here, '..', 'dict-revised.schema');
import { buildSqlite, insertEntry } from '../src/convert-to-sqlite';
import type { DictionaryEntry } from '../src/types';

describe('insertEntry', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts entry, heteronyms, definitions and links them by foreign key', () => {
    const entry: DictionaryEntry = {
      title: '花枝招展',
      heteronyms: [
        {
          bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ',
          pinyin: 'huā zhī zhāo zhǎn',
          definitions: [
            { def: '形容花木枝葉迎風搖擺。', type: '形', example: ['例一', '例二'], quote: ['典故一'], link: ['見A'], synonyms: 'A,B' },
            { def: '比喻女子打扮豔麗。' },
          ],
        },
      ],
    };

    insertEntry(db, entry);

    const rows = db.prepare('SELECT title, dict_id FROM entries').all() as Array<{ title: string; dict_id: number }>;
    expect(rows).toEqual([{ title: '花枝招展', dict_id: 1 }]);

    const heteronym = db.prepare('SELECT bopomofo, idx FROM heteronyms').all() as Array<{ bopomofo: string; idx: number }>;
    expect(heteronym).toEqual([{ bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ', idx: 0 }]);

    const definitions = db.prepare('SELECT def, example, quote, link FROM definitions ORDER BY id').all() as Array<{ def: string; example: string | null; quote: string | null; link: string | null }>;
    expect(definitions[0]).toMatchObject({ def: '形容花木枝葉迎風搖擺。', example: '例一,例二', quote: '典故一', link: '見A' });
    expect(definitions[1]).toMatchObject({ def: '比喻女子打扮豔麗。', example: null });
  });

  it('inserts translation rows when translation is present on the entry', () => {
    const entry = {
      title: '花枝招展',
      heteronyms: [],
      translation: {
        English: ['lovely scene', 'gorgeously dressed (woman)'],
        Deutsch: ['sich fein anziehen'],
      },
    };
    insertEntry(db, entry);
    const rows = db.prepare('SELECT lang, def FROM translations ORDER BY id').all() as Array<{ lang: string; def: string }>;
    expect(rows).toEqual([
      { lang: 'English', def: 'lovely scene' },
      { lang: 'English', def: 'gorgeously dressed (woman)' },
      { lang: 'Deutsch', def: 'sich fein anziehen' },
    ]);
  });
});

describe('buildSqlite', () => {
  it('reads JSON, writes sqlite, and reports correct entry count', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-test-'));
    const jsonPath = path.join(tmp, 'dict.json');
    const dbPath = path.join(tmp, 'dict.sqlite3');
    const schemaPath = SCHEMA_PATH;

    fs.writeFileSync(
      jsonPath,
      JSON.stringify([
        { title: '甲', heteronyms: [{ bopomofo: 'ㄐㄧㄚˇ', pinyin: 'jiǎ', definitions: [{ def: 'A' }] }] },
        { title: '乙', heteronyms: [{ bopomofo: 'ㄧˇ', pinyin: 'yǐ', definitions: [{ def: 'B' }] }] },
      ]),
    );

    const result = buildSqlite({ jsonPath, dbPath, schemaPath });
    expect(result.entryCount).toBe(2);

    const db = new Database(dbPath);
    try {
      const count = db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number } | undefined;
      expect(count?.n).toBe(2);
    } finally {
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
