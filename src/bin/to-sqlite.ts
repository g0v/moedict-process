#!/usr/bin/env bun
import { buildSqlite } from '../convert-to-sqlite';

async function main() {
  const jsonPath = Bun.env.MOEDICT_JSON ?? 'dict-revised.json';
  const dbPath = Bun.env.MOEDICT_DB ?? 'dict-revised.sqlite3';
  const schemaPath = Bun.env.MOEDICT_SCHEMA ?? 'dict-revised.schema';

  const { entryCount } = buildSqlite({ jsonPath, dbPath, schemaPath });
  console.error(`wrote ${entryCount} entries to ${dbPath}`);
}

await main();
