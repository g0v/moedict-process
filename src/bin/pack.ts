#!/usr/bin/env bun
import * as os from 'node:os';
import { runPack, type PackOptions } from '~/pack/pipeline';

const langArg = process.argv[2] ?? 'all';
const inputDir = process.env.MOEDICT_PACK_INPUT ?? 'dict_data';
const outputDir = process.env.MOEDICT_PACK_OUTPUT ?? '.';
const variantsInputDir = process.env.MOEDICT_VARIANTS_INPUT;
const historicalScriptsInputDir = process.env.MOEDICT_HISTORICAL_SCRIPTS_INPUT;

// PACK_CONCURRENCY overrides; default = all CPUs. Set to 1 for serial autolink.
const concurrencyEnv = process.env.PACK_CONCURRENCY;
const defaultCpus = os.availableParallelism?.() ?? os.cpus().length;
const concurrency = concurrencyEnv
  ? Math.max(1, Number.parseInt(concurrencyEnv, 10) || 1)
  : defaultCpus;
if (!['a', 't', 'h', 'c', 'all'].includes(langArg)) {
  console.error('Usage: bun run pack [a|t|h|c|all]');
  console.error('Env: MOEDICT_PACK_INPUT, MOEDICT_PACK_OUTPUT, MOEDICT_VARIANTS_INPUT, MOEDICT_HISTORICAL_SCRIPTS_INPUT, PACK_CONCURRENCY');
  process.exit(1);
}

console.error(`pack ${langArg}: concurrency=${concurrency} (cpus=${defaultCpus})`);

await runPack({
  lang: langArg as PackOptions['lang'],
  inputDir,
  outputDir,
  variantsInputDir,
  historicalScriptsInputDir,
  concurrency,
});
