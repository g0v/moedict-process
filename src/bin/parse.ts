#!/usr/bin/env bun
import * as path from 'node:path';
import { collectXlsxFiles, processXlsxFiles, serializeDictionaryJson } from '../process';

function writeXz(jsonPath: string): boolean {
  if (!Bun.which('xz')) {
    console.error('xz not found on PATH; skipping .json.xz');
    return false;
  }
  const result = Bun.spawnSync(['xz', '-z', '-f', '-k', jsonPath], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (!result.success) {
    throw new Error(`xz failed with exit code ${result.exitCode ?? 'unknown'}`);
  }
  return true;
}

async function main() {
  const sourceDir = Bun.env.MOEDICT_SOURCE_DIR ?? 'dict_revised';
  const outputPath = Bun.env.MOEDICT_OUTPUT ?? 'dict-revised.json';
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
  await Bun.write(outputPath, `${json}\n`);
  console.error(`wrote ${outputPath}`);
  if (writeXz(outputPath)) {
    console.error(`wrote ${xzOutputPath}`);
  }
}

await main();
