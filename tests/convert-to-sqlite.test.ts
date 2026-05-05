import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(here, '..', 'dict-revised.schema');
import { buildSqlite, insertEntry, insertRow } from '../src/convert-to-sqlite';
import type { DictionaryEntry } from '../src/types';

describe('insertRow', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (a TEXT, b INTEGER, c TEXT)');
  });

  afterEach(() => {
    db.close();
  });

  it('throws when given an empty row (defensive guard)', () => {
    // Tests `if (keys.length === 0) throw`: an `if (false)` mutant would let
    // the empty INSERT through, which better-sqlite3 would surface as a
    // confusing "near ')'" syntax error far from the actual cause.
    expect(() => insertRow(db, 't', {})).toThrow('empty row for t');
  });

  it('coerces undefined values to SQL NULL', () => {
    // Tests the `value === undefined` arm of the OR. A mutant that drops it
    // would pass undefined to better-sqlite3, which throws "TypeError:
    // SQLite3 can only bind numbers, strings, ...".
    insertRow(db, 't', { a: 'x', b: undefined, c: 'y' });
    const row = db.prepare('SELECT a, b, c FROM t').get() as { a: string; b: number | null; c: string };
    expect(row).toEqual({ a: 'x', b: null, c: 'y' });
  });

  it('coerces null values to SQL NULL', () => {
    // Tests the `value === null` arm of the OR.
    insertRow(db, 't', { a: 'x', b: null, c: 'y' });
    const row = db.prepare('SELECT a, b, c FROM t').get() as { a: string; b: number | null; c: string };
    expect(row).toEqual({ a: 'x', b: null, c: 'y' });
  });

  it('coerces boolean true → 1 and false → 0 (better-sqlite3 rejects raw booleans)', () => {
    // Tests `if (typeof value === 'boolean') return value ? 1 : 0`. Without
    // the guard, better-sqlite3 throws on raw boolean bindings.
    db.exec('CREATE TABLE bools (t INTEGER, f INTEGER)');
    insertRow(db, 'bools', { t: true, f: false });
    const row = db.prepare('SELECT t, f FROM bools').get() as { t: number; f: number };
    expect(row).toEqual({ t: 1, f: 0 });
  });
});

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
      radical: '艸',
      stroke_count: 12,
      non_radical_stroke_count: 8,
      heteronyms: [
        {
          bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ',
          pinyin: 'huā zhī zhāo zhǎn',
          definitions: [
            // multi-element quote and link kill `join(',')` → `join("")` mutants:
            // single-element arrays would join to the same string either way.
            { def: '形容花木枝葉迎風搖擺。', type: '形', example: ['例一', '例二'], quote: ['典故一', '典故二'], link: ['見A', '見B'], synonyms: 'A,B', antonyms: 'X,Y' },
            { def: '比喻女子打扮豔麗。' },
          ],
        },
      ],
    };

    insertEntry(db, entry);

    // Assert every `?? null` field round-trips its real value (not null) when
    // present — kills `radical && null`, `stroke_count && null`, etc. mutants.
    const rows = db.prepare('SELECT title, radical, stroke_count, non_radical_stroke_count, dict_id FROM entries').all() as Array<{ title: string; radical: string | null; stroke_count: number | null; non_radical_stroke_count: number | null; dict_id: number }>;
    expect(rows).toEqual([{ title: '花枝招展', radical: '艸', stroke_count: 12, non_radical_stroke_count: 8, dict_id: 1 }]);

    const heteronym = db.prepare('SELECT bopomofo, pinyin, idx FROM heteronyms').all() as Array<{ bopomofo: string; pinyin: string; idx: number }>;
    expect(heteronym).toEqual([{ bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ', pinyin: 'huā zhī zhāo zhǎn', idx: 0 }]);

    const definitions = db.prepare('SELECT def, type, example, quote, link, synonyms, antonyms FROM definitions ORDER BY id').all() as Array<{ def: string; type: string | null; example: string | null; quote: string | null; link: string | null; synonyms: string | null; antonyms: string | null }>;
    expect(definitions[0]).toEqual({ def: '形容花木枝葉迎風搖擺。', type: '形', example: '例一,例二', quote: '典故一,典故二', link: '見A,見B', synonyms: 'A,B', antonyms: 'X,Y' });
    expect(definitions[1]).toEqual({ def: '比喻女子打扮豔麗。', type: null, example: null, quote: null, link: null, synonyms: null, antonyms: null });
  });

  it('inserts translation rows with monotonically increasing language idx', () => {
    // Asserting the explicit idx kills the `i++` → `i--` mutant (under which
    // the second language would get idx=-1 instead of idx=1).
    const entry = {
      title: '花枝招展',
      heteronyms: [],
      translation: {
        English: ['lovely scene', 'gorgeously dressed (woman)'],
        Deutsch: ['sich fein anziehen'],
      },
    };
    insertEntry(db, entry);
    const rows = db.prepare('SELECT lang, def, idx FROM translations ORDER BY id').all() as Array<{ lang: string; def: string; idx: number }>;
    expect(rows).toEqual([
      { lang: 'English', def: 'lovely scene', idx: 0 },
      { lang: 'English', def: 'gorgeously dressed (woman)', idx: 0 },
      { lang: 'Deutsch', def: 'sich fein anziehen', idx: 1 },
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

  it('deletes a pre-existing dbPath before writing (otherwise CREATE TABLE conflicts)', () => {
    // Tests `if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)`: with an
    // `if (false)` mutant the existing schema would still be there and
    // `db.exec(schema)` would throw "table 'dicts' already exists".
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-prebuilt-'));
    try {
      const jsonPath = path.join(tmp, 'dict.json');
      const dbPath = path.join(tmp, 'dict.sqlite3');
      fs.writeFileSync(jsonPath, JSON.stringify([{ title: '甲', heteronyms: [] }]));

      // Pre-create the db with the schema applied so a missing unlink would surface.
      const stale = new Database(dbPath);
      stale.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
      stale.close();

      expect(() => buildSqlite({ jsonPath, dbPath, schemaPath: SCHEMA_PATH })).not.toThrow();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('closes the database connection on the way out (even on success)', () => {
    // Tests the `finally { db.close(); }` block: with an empty finally the
    // handle would leak. Spying on Database.prototype.close lets us verify
    // the cleanup ran.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-close-'));
    try {
      const jsonPath = path.join(tmp, 'dict.json');
      const dbPath = path.join(tmp, 'dict.sqlite3');
      fs.writeFileSync(jsonPath, JSON.stringify([{ title: '甲', heteronyms: [] }]));
      const closeSpy = vi.spyOn(Database.prototype, 'close');
      try {
        buildSqlite({ jsonPath, dbPath, schemaPath: SCHEMA_PATH });
        expect(closeSpy).toHaveBeenCalled();
      } finally {
        closeSpy.mockRestore();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
