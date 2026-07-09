import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Lang, GrokEntry } from './types';
import { buildPrefixTrie, buildLenToRegex } from './prefix';
import {
  grokJson,
  expandPuaTokens,
  buildLenToRegexMap,
  autolinkLine,
  IDS2UNI,
} from './autolink';
import type { AutolinkJob, AutolinkResult } from './autolink-worker';
import { PackWriter } from './io';
import { bucketIndex, isSkippedTitle } from './bucket';
import { cLocaleCompare, canonicalJson } from './serializer';
import { buildSpecialPacks, buildTwblgIndex, buildCategoryFiles } from './special';

export interface PackOptions {
  lang: Lang | 'all';
  inputDir: string;
  outputDir: string;
  /** Worker count for autolink. Default: os.availableParallelism(). Set 1 to force serial. */
  concurrency?: number;
}

const WORKER_URL = new URL('./autolink-worker.ts', import.meta.url);

export async function runPack(options: PackOptions): Promise<void> {
  const langs: Lang[] = options.lang === 'all' ? ['a', 't', 'h', 'c'] : [options.lang];
  const concurrency = Math.max(1, options.concurrency ?? os.availableParallelism?.() ?? os.cpus().length);
  fs.mkdirSync(options.outputDir, { recursive: true });

  for (const lang of langs) {
    await packLang(lang, options.inputDir, options.outputDir, concurrency);
  }

  const dictCatPath = path.join(options.inputDir, 'moedict-data/dict-cat.json');
  if (fs.existsSync(dictCatPath)) {
    buildCategoryFiles(
      JSON.parse(fs.readFileSync(dictCatPath, 'utf8')) as { name: string; entries: string[] }[],
      options.outputDir,
    );
  }
}

async function packLang(
  lang: Lang,
  inputDir: string,
  outputDir: string,
  concurrency: number,
): Promise<void> {
  const entriesForPrefix = loadGrokEntries(lang, inputDir, IDS2UNI);
  const entriesForAutolink = loadGrokEntries(lang, inputDir, IDS2UNI);

  const trie = buildPrefixTrie(entriesForPrefix);
  const { lenToRegex, abbrevToTitle } = buildLenToRegex(trie, lang);

  const langOutputDir = path.join(outputDir, lang);
  fs.mkdirSync(langOutputDir, { recursive: true });

  for (const [len, re] of Object.entries(lenToRegex)) {
    fs.writeFileSync(
      path.join(langOutputDir, `lenToRegex.${len}.json`),
      canonicalJson({ [len]: re }),
    );
  }
  fs.writeFileSync(path.join(langOutputDir, 'lenToRegex.json'), canonicalJson({ lenToRegex }));
  fs.writeFileSync(
    path.join(langOutputDir, 'precomputed.json'),
    canonicalJson({ abbrevToTitle }),
  );

  // Deduplicate titles once on the main thread so workers don't need global seen state.
  const uniqueEntries: GrokEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entriesForAutolink) {
    const title = entry.t;
    if (isSkippedTitle(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    uniqueEntries.push(entry);
  }

  // CPU-bound LTM autolink: fan out entry chunks across workers (or serial for concurrency=1).
  const lines =
    concurrency === 1 || uniqueEntries.length < 64
      ? autolinkSerial(lang, uniqueEntries, lenToRegex)
      : await autolinkParallel(lang, uniqueEntries, lenToRegex, concurrency);

  // Deterministic ordering + pack writes stay single-threaded.
  lines.sort(cLocaleCompare);

  const writer = new PackWriter(outputDir);
  for (const line of lines) {
    const match = line.match(/^(\d+) (\S+) (.+)$/);
    if (!match) throw new Error(`malformed autolink line: ${line.slice(0, 80)}`);
    const [, bucketStr, bucketTitle, payload] = match;
    if (bucketStr === undefined || bucketTitle === undefined || payload === undefined) {
      throw new Error(`malformed autolink line: ${line.slice(0, 80)}`);
    }
    const bucket = Number(bucketStr);
    const expandedPayload = expandPuaTokens(payload);
    const titleMatch = expandedPayload.match(/"t":"([^"]+)"/);
    const fileTitle = (titleMatch?.[1] ?? '').replace(/[`~]/g, '');
    writer.writeEntry(lang, bucket, bucketTitle, fileTitle, expandedPayload);
  }
  writer.finalize();

  buildSpecialPacks(lang, outputDir);
  if (lang === 't') {
    const csvPath = path.join(inputDir, 'moedict-data-twblg/uni/詞目總檔.csv');
    if (fs.existsSync(csvPath)) {
      await buildTwblgIndex(csvPath, path.join(langOutputDir, 'index.json'));
    }
  }
}

function autolinkSerial(
  lang: Lang,
  entries: GrokEntry[],
  lenToRegex: Record<number, string>,
): string[] {
  const regexMap = buildLenToRegexMap(lenToRegex);
  const lines: string[] = [];
  for (const entry of entries) {
    const title = entry.t;
    const bucket = bucketIndex(title, lang);
    lines.push(autolinkLine(bucket, title, entry, regexMap));
  }
  return lines;
}

async function autolinkParallel(
  lang: Lang,
  entries: GrokEntry[],
  lenToRegex: Record<number, string>,
  concurrency: number,
): Promise<string[]> {
  const workers = Math.min(concurrency, entries.length);
  const chunks = splitChunks(entries, workers);
  const jobs = chunks.map((chunk) => runAutolinkWorker({ lang, entries: chunk, lenToRegex }));
  const results = await Promise.all(jobs);
  const lines: string[] = [];
  for (const result of results) {
    for (const line of result.lines) lines.push(line);
  }
  return lines;
}

function splitChunks<T>(items: T[], parts: number): T[][] {
  const n = Math.max(1, parts);
  const size = Math.ceil(items.length / n);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function runAutolinkWorker(job: AutolinkJob): Promise<AutolinkResult> {
  const { promise, resolve, reject } = Promise.withResolvers<AutolinkResult>();
  const worker = new Worker(WORKER_URL);

  worker.onmessage = (event: MessageEvent<AutolinkResult>) => {
    worker.terminate();
    resolve(event.data);
  };
  worker.onerror = (err: ErrorEvent) => {
    worker.terminate();
    reject(err.error instanceof Error ? err.error : new Error(err.message));
  };
  worker.postMessage(job);
  return promise;
}

function loadGrokEntries(
  lang: Lang,
  inputDir: string,
  puaMap: Record<string, string>,
): GrokEntry[] {
  const paths: string[] = [];
  switch (lang) {
    case 'a':
      paths.push(path.join(inputDir, 'dict-revised.json'));
      break;
    case 't':
      paths.push(path.join(inputDir, 'dict-twblg.json'));
      paths.push(path.join(inputDir, 'dict-twblg-ext.json'));
      break;
    case 'h':
      paths.push(path.join(inputDir, 'dict-hakka.json'));
      break;
    case 'c':
      paths.push(path.join(inputDir, 'dict-csld.json'));
      break;
  }

  const all: GrokEntry[] = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Required source file not found: ${p}`);
    }
    const raw = fs.readFileSync(p, 'utf8');
    const grokked = grokJson(raw, puaMap);
    for (const entry of grokked) all.push(entry);
  }
  return all;
}
