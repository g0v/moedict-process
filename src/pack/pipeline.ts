//@ safe-slice

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
  assertNoPua,
} from './autolink';
import type { AutolinkJob, AutolinkResult, AutolinkCandidate } from './autolink-worker';
import { PackWriter } from './io';
import { bucketIndex, isSkippedTitle } from './bucket';
import { cLocaleCompare, canonicalJson } from './serializer';
import { buildSpecialPacks, buildTwblgIndex, buildCategoryFiles } from './special';
import { writeGeneratedIndex } from './index';
import { writeXrefs } from './xref';

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
  const raw = options.concurrency ?? os.availableParallelism?.() ?? os.cpus().length;
  // Normalize to a finite integer >= 1 so splitChunks' `parts >= 1` / integer
  // precondition always holds at the runtime boundary (NaN/Infinity -> serial).
  const concurrency = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : 1));
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
    const content = canonicalJson({ [len]: re });
    assertNoPua(content, `lang=${lang} lenToRegex.${len}.json`);
    fs.writeFileSync(path.join(langOutputDir, `lenToRegex.${len}.json`), content);
  }
  {
    const content = canonicalJson({ lenToRegex });
    assertNoPua(content, `lang=${lang} lenToRegex.json`);
    fs.writeFileSync(path.join(langOutputDir, 'lenToRegex.json'), content);
  }
  {
    const content = canonicalJson({ abbrevToTitle });
    assertNoPua(content, `lang=${lang} precomputed.json`);
    fs.writeFileSync(path.join(langOutputDir, 'precomputed.json'), content);
  }

  // Legacy autolink computes dedupe and the bucket from the source title, then
  // strips an English parenthesized suffix for the serialized title, file name,
  // and pack key. Keep both identities explicitly through worker boundaries.
  const audioMap = loadAudioMap(lang, inputDir);
  const uniqueEntries: AutolinkCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of entriesForAutolink) {
    const sourceTitle = entry.t;
    if (sourceTitle.length === 0) continue;
    if (isSkippedTitle(sourceTitle)) continue;
    if (seen.has(sourceTitle)) continue;
    seen.add(sourceTitle);

    const { title, english } = stripEnglishSuffix(sourceTitle);
    if (english !== undefined) entry.english = english;
    injectAudioId(entry, title, audioMap);
    uniqueEntries.push({
      entry,
      bucket: bucketIndex(sourceTitle, lang),
      title,
    });
  }

  // CPU-bound LTM autolink: fan out entry chunks across workers (or serial for concurrency=1).
  const lines =
    concurrency === 1 || uniqueEntries.length < 64
      ? autolinkSerial(uniqueEntries, lenToRegex)
      : await autolinkParallel(uniqueEntries, lenToRegex, concurrency);

  // Deterministic ordering + pack writes stay single-threaded.
  lines.sort(cLocaleCompare);

  const writer = new PackWriter(outputDir);
  const acceptedTitles: string[] = [];
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
    assertNoPua(
      expandedPayload,
      `lang=${lang} title=${fileTitle || bucketTitle}`,
    );
    const acceptedTitle = writer.writeEntry(lang, bucket, bucketTitle, fileTitle, expandedPayload);
    if (acceptedTitle !== null) acceptedTitles.push(acceptedTitle);
  }
  writer.finalize();
  if (lang === 'a' || lang === 'h') {
    writeGeneratedIndex(lang, acceptedTitles, outputDir);
  }
  if (lang === 'a') {
    writeXrefs(inputDir, outputDir, new Set(acceptedTitles));
  }
  buildSpecialPacks(lang, outputDir);
  if (lang === 't') {
    const csvPath = path.join(inputDir, 'moedict-data-twblg/uni/詞目總檔.csv');
    if (fs.existsSync(csvPath)) {
      await buildTwblgIndex(csvPath, path.join(langOutputDir, 'index.json'));
    }
  }
}

function autolinkSerial(
  entries: AutolinkCandidate[],
  lenToRegex: Record<number, string>,
): string[] {
  const regexMap = buildLenToRegexMap(lenToRegex);
  const lines: string[] = [];
  for (const { entry, bucket, title } of entries) {
    lines.push(autolinkLine(bucket, title, entry, regexMap));
  }
  return lines;
}

async function autolinkParallel(
  entries: AutolinkCandidate[],
  lenToRegex: Record<number, string>,
  concurrency: number,
): Promise<string[]> {
  const workers = Math.min(concurrency, entries.length);
  const chunks = splitChunks(entries, workers);
  const jobs = chunks.map((chunk) => runAutolinkWorker({ entries: chunk, lenToRegex }));
  const results = await Promise.all(jobs);
  const lines: string[] = [];
  for (const result of results) {
    for (const line of result.lines) lines.push(line);
  }
  return lines;
}

function splitChunks<T>(items: T[], parts: number): T[][] {
  //@ verify
  //@ type T (==)
  //@ requires items.length >= 0
  //@ requires parts >= 1
  //@ requires parts === Math.floor(parts)
  //@ contract Contiguous non-overlapping slices covering `items` in order:
  //@        with size = ceil(|items|/parts), chunk k is
  //@        items[k*size .. min((k+1)*size, |items|)]. Flattening recovers items.
  //@ ensures (items.length === 0 ==> \result.length === 0)
  //@ ensures (items.length > 0 ==> (\result.length >= 1 && \result.length <= parts))
  if (items.length === 0) {
    return [];
  }
  // Integer ceil-div: ceil(L/n) == floor((L+n-1)/n) for n >= 1, L >= 0.
  // Semantically identical to Math.ceil(items.length / parts) under parts >= 1.
  const size = Math.floor((items.length + parts - 1) / parts);
  const chunks: T[][] = [];
  let k = 0;
  let start = 0;
  while (start < items.length) {
    //@ invariant 0 <= start && start <= items.length
    //@ invariant 0 <= k && k === chunks.length
    //@ invariant size >= 1
    //@ invariant start === Math.min(k * size, items.length)
    //@ invariant k <= parts
    //@ decreases items.length - start
    chunks.push(items.slice(start, start + size));
    k = k + 1;
    if (start + size >= items.length) {
      start = items.length;
    } else {
      start = start + size;
    }
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
    case 'a': {
      const translated = path.join(inputDir, 'dict-revised-translated.json');
      paths.push(
        fs.existsSync(translated)
          ? translated
          : path.join(inputDir, 'dict-revised.json'),
      );
      break;
    }
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

/**
 * Load and preprocess the Mandarin audio map (legacy autolink.ls lines 6-11).
 * Returns a title/title.bopomofo → audio_id lookup, or null if the audio file
 * is absent (non-Mandarin or missing data).
 */
function loadAudioMap(
  lang: Lang,
  inputDir: string,
): Record<string, string> | null {
  if (lang !== 'a') return null;
  const audioPath = path.join(inputDir, 'dict-concised.audio.json');
  if (!fs.existsSync(audioPath)) return null;
  const raw: Record<string, string> = JSON.parse(
    fs.readFileSync(audioPath, 'utf8'),
  );
  const map: Record<string, string> = {};
  for (const [rawKey, v] of Object.entries(raw)) {
    // `autolink.ls`: k.replace(/\.（.*?）/, '.').replace(/，/g, '').replace(/（.*）.*/, '')
    const key = rawKey
      .replace(/\.（.*?）/, '.')
      .replace(/，/g, '')
      .replace(/（.*）.*/, '');
    map[key] = v;
    // Legacy assigns unconditionally; later source entries override earlier ones.
    map[key.replace(/\..*/, '')] = v;
  }
  return map;
}

function stripEnglishSuffix(title: string): {
  title: string;
  english: string | undefined;
} {
  let index = title.indexOf('(');
  if (index < 0) index = title.indexOf('（');
  if (index < 0) return { title, english: undefined };
  return {
    title: title.slice(0, index),
    english: title.slice(index + 1, -1),
  };
}

function injectAudioId(
  entry: GrokEntry,
  title: string,
  audioMap: Record<string, string> | null,
): void {
  if (!audioMap) return;
  const heteronyms = entry.h as Array<Record<string, unknown>> | undefined;
  if (!heteronyms) return;
  for (let i = 0; i < heteronyms.length; i++) {
    const b = heteronyms[i]?.['b'];
    if (typeof b !== 'string' || b.length === 0) break;
    const normalizedBopomofo = b
      .replace(/ /g, '\u3000')
      .replace(/([ˇˊˋ])\u3000/g, '$1')
      .replace(/ /g, '\u3000')
      .replace(/^（.*）/, '')
      .replace(/（.*）.*/, '');
    const audioTitle = title.replace(/，/g, '');
    const audioId =
      i > 0
        ? audioMap[`${audioTitle}.${normalizedBopomofo}`]
        : audioMap[`${audioTitle}.${normalizedBopomofo}`] ??
          (title.length > 1 ? audioMap[title] : undefined);
    if (audioId) heteronyms[i]!['='] = audioId;
  }
}

export { splitChunks }
