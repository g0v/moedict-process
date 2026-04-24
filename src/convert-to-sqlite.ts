import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import type { DictionaryEntry, Heteronym, Definition } from './types';

type DB = Database.Database;

export const DICT_ID = 1;

interface Translations {
  [lang: string]: readonly string[];
}

interface ExtendedEntry extends DictionaryEntry {
  translation?: Translations;
}

function insertRow(db: DB, table: string, row: Record<string, unknown>): number {
  const keys = Object.keys(row);
  if (keys.length === 0) throw new Error(`empty row for ${table}`);
  const columns = keys.join(',');
  const placeholders = keys.map(() => '?').join(',');
  const values = keys.map((key) => {
    const value = row[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value as string | number | bigint;
  });
  const stmt = db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`);
  const info = stmt.run(...values);
  return Number(info.lastInsertRowid);
}

function buildEntryRow(entry: ExtendedEntry): Record<string, unknown> {
  return {
    title: entry.title ?? null,
    radical: entry.radical ?? null,
    stroke_count: entry.stroke_count ?? null,
    non_radical_stroke_count: entry.non_radical_stroke_count ?? null,
    dict_id: DICT_ID,
  };
}

function buildHeteronymRow(heteronym: Heteronym, entryId: number, idx: number): Record<string, unknown> {
  return {
    entry_id: entryId,
    idx: String(idx),
    bopomofo: heteronym.bopomofo ?? null,
    pinyin: heteronym.pinyin ?? null,
  };
}

function buildDefinitionRow(definition: Definition, heteronymId: number, idx: number): Record<string, unknown> {
  return {
    heteronym_id: heteronymId,
    idx: String(idx),
    type: definition.type ?? null,
    def: definition.def ?? null,
    example: definition.example ? definition.example.join(',') : null,
    quote: definition.quote ? definition.quote.join(',') : null,
    link: definition.link ? definition.link.join(',') : null,
    synonyms: definition.synonyms ?? null,
    antonyms: definition.antonyms ?? null,
  };
}

/** Insert one entry and its children. Returns the entry rowid. */
export function insertEntry(db: DB, entry: ExtendedEntry): number {
  const entryId = insertRow(db, 'entries', buildEntryRow(entry));

  for (let i = 0; i < entry.heteronyms.length; i++) {
    const heteronym = entry.heteronyms[i]!;
    const heteronymId = insertRow(db, 'heteronyms', buildHeteronymRow(heteronym, entryId, i));

    const definitions = heteronym.definitions ?? [];
    for (let j = 0; j < definitions.length; j++) {
      insertRow(db, 'definitions', buildDefinitionRow(definitions[j]!, heteronymId, j));
    }
  }

  if (entry.translation) {
    let i = 0;
    for (const [lang, defs] of Object.entries(entry.translation)) {
      for (const d of defs) {
        insertRow(db, 'translations', { lang, def: d, idx: String(i), entry_id: entryId });
      }
      i++;
    }
  }

  return entryId;
}

export interface BuildSqliteOptions {
  jsonPath: string;
  dbPath: string;
  schemaPath: string;
}

export function buildSqlite({ jsonPath, dbPath, schemaPath }: BuildSqliteOptions): { entryCount: number } {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    const entries = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as ExtendedEntry[];
    const insertMany = db.transaction((items: ExtendedEntry[]) => {
      for (const entry of items) {
        insertEntry(db, entry);
      }
    });
    insertMany(entries);

    return { entryCount: entries.length };
  } finally {
    db.close();
  }
}
