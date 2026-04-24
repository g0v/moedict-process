#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectXlsxFiles, processXlsxFiles, serializeDictionaryJson } from '../process';

async function main() {
  const sourceDir = process.env.MOEDICT_SOURCE_DIR ?? 'dict_revised';
  const outputPath = process.env.MOEDICT_OUTPUT ?? 'dict-revised.json';

  const files = collectXlsxFiles(sourceDir);
  if (files.length === 0) {
    console.error(`no .xlsx files found under ${path.resolve(sourceDir)}`);
    console.error('see README for how to download source data from g0v/moedict-data');
    process.exit(1);
  }

  console.error(`processing ${files.length} xlsx file(s) from ${sourceDir} ...`);
  const result = processXlsxFiles(files);
  console.error(`parsed ${result.rowsParsed} row(s) into ${result.entries.length} entries`);

  const json = serializeDictionaryJson(result.entries);
  fs.writeFileSync(outputPath, `${json}\n`, 'utf8');
  console.error(`wrote ${outputPath}`);
}

await main();
