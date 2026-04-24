#!/usr/bin/env bun
import { buildSqlite } from '../convert-to-sqlite';

async function main() {
  const jsonPath = process.env.MOEDICT_JSON ?? 'dict-revised.json';
  const dbPath = process.env.MOEDICT_DB ?? 'dict-revised.sqlite3';
  const schemaPath = process.env.MOEDICT_SCHEMA ?? 'dict-revised.schema';

  const { entryCount } = buildSqlite({ jsonPath, dbPath, schemaPath });
  console.error(`wrote ${entryCount} entries to ${dbPath}`);
}

await main();
