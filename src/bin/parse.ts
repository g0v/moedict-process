#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectXlsxFiles, processXlsxFiles, serializeDictionaryJson } from '../process';

function writeXz(jsonPath: string) {
  const result = spawnSync('xz', ['-z', '-f', '-k', jsonPath], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`xz failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  const sourceDir = process.env.MOEDICT_SOURCE_DIR ?? 'dict_revised';
  const outputPath = process.env.MOEDICT_OUTPUT ?? 'dict-revised.json';
  const xzOutputPath = `${outputPath}.xz`;

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
  writeXz(outputPath);
  console.error(`wrote ${xzOutputPath}`);
}

await main();
