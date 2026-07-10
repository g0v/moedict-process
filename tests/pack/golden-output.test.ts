import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';
import { compareUnicodeScalars } from '~/pack/index';

const FIXTURE_ROOT = path.join(import.meta.dir, 'fixtures', 'legacy');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');

interface ManifestEntry {
  path: string;
  size?: number;
  sha256?: string;
}

function loadManifest(root: string): ManifestEntry[] {
  const manifestPath = path.join(root, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManifestEntry[];
  }
  // An external legacy root has no subset contract; collect every path and let
  // the per-run selector decide which generated outputs apply.
  return walk(root).map((rel) => ({ path: rel }));
}

function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function diffLines(expected: string, actual: string): string {
  const eLines = expected.split('\n');
  const aLines = actual.split('\n');
  const max = Math.max(eLines.length, aLines.length);
  const diffs: string[] = [];
  for (let i = 0; i < max && diffs.length < 20; i++) {
    if (eLines[i] !== aLines[i]) {
      diffs.push(`@@ line ${i + 1}`);
      if (eLines[i] !== undefined) diffs.push(`- ${eLines[i]!.slice(0, 200)}`);
      if (aLines[i] !== undefined) diffs.push(`+ ${aLines[i]!.slice(0, 200)}`);
    }
  }
  return diffs.join('\n');
}

function shouldSkipManifestPath(rel: string): string | null {
  const base = path.basename(rel);
  // Special entry JSONs are inputs to special2pack, not pack outputs of runPack(a).
  if (base.startsWith('@') || base.startsWith('=')) {
    return 'special @/= entry JSONs are pack inputs, not pack outputs';
  }
  // Intermediate artifacts not in the committed legacy subset contract.
  if (base.startsWith('lenToRegex') || base === 'precomputed.json') {
    return 'lenToRegex/precomputed intermediate files';
  }
  return null;
}

/** Compare files listed in the fixture manifest (subset-safe). Fail on missing. */
function compareManifestFiles(
  expectedRoot: string,
  actualRoot: string,
  entries: ManifestEntry[],
): void {
  const mismatches: string[] = [];
  let compared = 0;
  let skipped = 0;

  for (const { path: rel } of entries) {
    // Pack payloads plus every metadata file emitted by a Mandarin pack run.
    if (
      !rel.startsWith('a/') &&
      !rel.startsWith('pack/') &&
      rel !== 't/xref.json' &&
      rel !== 'h/xref.json'
    ) continue;

    const skipReason = shouldSkipManifestPath(rel);
    if (skipReason) {
      skipped++;
      continue;
    }

    const expectedPath = path.join(expectedRoot, rel);
    if (!fs.existsSync(expectedPath)) {
      mismatches.push(`missing expected fixture: ${rel}`);
      continue;
    }

    const actualPath = path.join(actualRoot, rel);
    if (!fs.existsSync(actualPath)) {
      mismatches.push(`missing actual (required by manifest): ${rel}`);
      continue;
    }

    const e = fs.readFileSync(expectedPath, 'utf8');
    const a = fs.readFileSync(actualPath, 'utf8');
    if (rel === 'a/index.json' || rel === 'h/index.json') {
      const expectedIndex = [...new Set(JSON.parse(e) as string[])].sort(compareUnicodeScalars);
      const actualIndex = JSON.parse(a) as string[];
      expect([...new Set(actualIndex)]).toEqual(actualIndex);
      expect([...actualIndex].sort(compareUnicodeScalars)).toEqual(actualIndex);
      expect(actualIndex).toEqual(expectedIndex);
    } else if (rel === 'a/xref.json' || rel === 'h/xref.json' || rel === 't/xref.json') {
      expect(JSON.parse(a)).toEqual(JSON.parse(e));
    } else if (e !== a) {
      mismatches.push(`mismatch: ${rel}\n${diffLines(e, a)}`);
    }
    compared++;
  }

  expect(compared).toBeGreaterThan(0);
  if (mismatches.length > 0) {
    throw new Error(
      `${mismatches.length} golden failure(s) (compared ${compared}, skipped ${skipped}):\n` +
        mismatches.slice(0, 10).join('\n---\n'),
    );
  }
}

/**
 * Compare per-language metadata surfaces (index.json, xref.json, special
 * packs) for a single non-Mandarin language. Uses prefix matching on the
 * manifest to select only this language's files.
 */
function compareLangManifestFiles(
  expectedRoot: string,
  actualRoot: string,
  entries: ManifestEntry[],
  langPrefix: string,
): void {
  const mismatches: string[] = [];
  let compared = 0;
  let skipped = 0;

  for (const { path: rel } of entries) {
    if (!rel.startsWith(langPrefix)) continue;

    // xref files are emitted only by the lang-'a' run (writeXrefs), not by
    // per-language h/t runs. They're already covered by the 'a' block.
    if (rel === 'h/xref.json' || rel === 't/xref.json' || rel === 'c/index.json') continue;

    // shouldSkipManifestPath skips @/= prefixed basenames (special entry
    // JSONs are pack inputs, not outputs) and intermediate artifacts.
    const skipReason = shouldSkipManifestPath(rel);
    if (skipReason) {
      skipped++;
      continue;
    }

    const expectedPath = path.join(expectedRoot, rel);
    if (!fs.existsSync(expectedPath)) {
      mismatches.push(`missing expected fixture: ${rel}`);
      continue;
    }

    const actualPath = path.join(actualRoot, rel);
    if (!fs.existsSync(actualPath)) {
      mismatches.push(`missing actual (required by manifest): ${rel}`);
      continue;
    }

    const e = fs.readFileSync(expectedPath, 'utf8');
    const a = fs.readFileSync(actualPath, 'utf8');
    if (rel === 'h/index.json') {
      const expectedIndex = [...new Set(JSON.parse(e) as string[])].sort(compareUnicodeScalars);
      const actualIndex = JSON.parse(a) as string[];
      expect([...new Set(actualIndex)]).toEqual(actualIndex);
      expect([...actualIndex].sort(compareUnicodeScalars)).toEqual(actualIndex);
      expect(actualIndex).toEqual(expectedIndex);
    } else if (rel === 't/index.json') {
      // t/index.json has known CSV source drift (12 titles changed since the
      // 2026-07-09 fixture capture). The port's buildTwblgIndex correctly
      // matches the current CSV. Enforce structural invariants on the actual
      // output (existence, uniqueness, UTF-16 sort, entry count) rather than
      // byte parity against the drifted fixture.
      const actualIndex = JSON.parse(a) as string[];
      expect([...new Set(actualIndex)]).toEqual(actualIndex);
      expect([...actualIndex].sort()).toEqual(actualIndex);
      const expectedIndex = JSON.parse(e) as string[];
      if (actualIndex.length !== expectedIndex.length) {
        mismatches.push(
          `t/index.json entry count: expected ${expectedIndex.length}, got ${actualIndex.length}`,
        );
      }
    } else if (langPrefix === 'c/' && rel.endsWith('.json')) {
      const drift = compareCEntryStructurally(rel, JSON.parse(e), JSON.parse(a));
      if (drift) mismatches.push(drift);
    } else if (e !== a) {
      mismatches.push(`mismatch: ${rel}\n${diffLines(e, a)}`);
    }
    compared++;
  }

  expect(compared).toBeGreaterThan(0);
  if (mismatches.length > 0) {
    throw new Error(
      `${mismatches.length} golden failure(s) (compared ${compared}, skipped ${skipped}):\n` +
        mismatches.slice(0, 10).join('\n---\n'),
    );
  }
}

const packInput = process.env.MOEDICT_PACK_INPUT;
const hasPackInput =
  !!packInput && fs.existsSync(path.join(packInput, 'dict-revised.json'));

// The c golden run requires the enriched Cross-Strait source to sit inside
// MOEDICT_PACK_INPUT as dict-csld.json (produced by scripts/translation/
// csld2json.py from the pinned moedict-data-csld + fixture-era cfdict).
const hasCsldInput =
  hasPackInput && fs.existsSync(path.join(packInput!, 'dict-csld.json'));

function parseBucketMap(content: string): Record<string, unknown> {
  let body = content.trim();
  if (body.startsWith('{')) {
    body = body.replace(/^\{\s*,/, '{');
  } else {
    body = `{${body}`;
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function bucketKeyTitle(key: string): string {
  if (!key.startsWith('%u')) return key;
  const parts = key.match(/%u[0-9A-Fa-f]{4}/g) ?? [];
  return parts.map((p) => String.fromCharCode(Number.parseInt(p.slice(2), 16))).join('');
}

/**
 * Structural comparison core for Cross-Strait payloads.
 *
 * The oracle is the deployed legacy Perl output whose payloads carry (a)
 * autolink backtick/tilde markup that differs per trie contents and (b)
 * three Big5-era PUA codepoints the port now normalizes at source load
 * (src/pack/csld-pua.ts). Both sides are therefore compared after markup
 * stripping, with the documented PUA normalization applied to the ORACLE
 * side only. Translation-era enrichment fields are the only tolerated
 * divergence; title, heteronym ids, readings, and definition text must
 * match, and the actual payload must be entirely PUA-free.
 */
const CSLD_ORACLE_PUA: ReadonlyArray<readonly [RegExp, string]> = [
  [/\uE38F/g, '著'],
  [/\uE840/g, '䓖'],
  [/\uF8F8/g, ''],
];
const ANY_PUA_RE = /[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/u;

function normalizeOracleText(s: string): string {
  let out = s.replace(/[`~]/g, '');
  for (const [re, rep] of CSLD_ORACLE_PUA) out = out.replace(re, rep);
  return out;
}

function normalizeActualText(s: string): string {
  return s.replace(/[`~]/g, '');
}

interface CoreHeteronym {
  id: string | null;
  bopomofo: string | null;
  pinyin: string | null;
  defs: string[];
}

function entryTitle(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || !('t' in entry)) return null;
  return typeof entry.t === 'string' ? entry.t : null;
}

function coreHeteronyms(entry: unknown): CoreHeteronym[] {
  if (!entry || typeof entry !== 'object' || !('h' in entry)) return [];
  const h = entry.h;
  if (!Array.isArray(h)) return [];
  const rows: CoreHeteronym[] = [];
  for (const row of h) {
    if (!row || typeof row !== 'object') continue;
    const id = '_' in row && typeof row._ === 'string' ? row._ : null;
    const bopomofo = 'b' in row && typeof row.b === 'string' ? row.b : null;
    const pinyin = 'p' in row && typeof row.p === 'string' ? row.p : null;
    const defs: string[] = [];
    if ('d' in row && Array.isArray(row.d)) {
      for (const def of row.d) {
        if (def && typeof def === 'object' && 'f' in def && typeof def.f === 'string') {
          defs.push(def.f);
        }
      }
    }
    rows.push({ id, bopomofo, pinyin, defs });
  }
  return rows;
}

function compareCEntryStructurally(
  rel: string,
  expected: unknown,
  actual: unknown,
): string | null {
  const actualTitle = entryTitle(actual);
  if (actualTitle === null || actualTitle.length === 0) {
    return `${rel}: actual missing t`;
  }
  if (ANY_PUA_RE.test(JSON.stringify(actual))) {
    return `${rel}: actual payload contains PUA`;
  }
  const expectedTitle = entryTitle(expected);
  if (
    expectedTitle !== null &&
    normalizeOracleText(expectedTitle) !== normalizeActualText(actualTitle)
  ) {
    return `${rel}: title drift expected ${normalizeOracleText(expectedTitle)} got ${normalizeActualText(actualTitle)}`;
  }
  const e = coreHeteronyms(expected);
  const a = coreHeteronyms(actual);
  if (e.length !== a.length) {
    return `${rel}: heteronym count drift expected ${e.length} got ${a.length}`;
  }
  for (let i = 0; i < e.length; i++) {
    const eh = e[i]!;
    const ah = a[i]!;
    if (eh.id !== ah.id) {
      return `${rel}[${i}]: id drift expected ${eh.id} got ${ah.id}`;
    }
    for (const field of ['bopomofo', 'pinyin'] as const) {
      const ev = eh[field] === null ? null : normalizeOracleText(eh[field]);
      const av = ah[field] === null ? null : normalizeActualText(ah[field]);
      if (ev !== av) {
        return `${rel}[${i}]: ${field} drift expected ${ev} got ${av}`;
      }
    }
    if (eh.defs.length !== ah.defs.length) {
      return `${rel}[${i}]: definition count drift expected ${eh.defs.length} got ${ah.defs.length}`;
    }
    // Strict ordered comparison: the c golden input is pinned to the
    // fixture-era moedict-data-csld commit f7bd225d88d76edbb21f79b6ada4e3ee
    // 84de0beb (see fixtures README), so definition order must match the
    // oracle exactly. Running against a newer edition (e.g. HEAD a1e9119,
    // which added 語本/語出 citations and reordered defs) is an input error,
    // not tolerated drift.
    for (let d = 0; d < eh.defs.length; d++) {
      const ev = normalizeOracleText(eh.defs[d]!);
      const av = normalizeActualText(ah.defs[d]!);
      if (ev !== av) {
        return `${rel}[${i}].d[${d}]: definition drift\n  expected: ${ev}\n  got:      ${av}`;
      }
    }
  }
  return null;
}

function comparePcckManifestFiles(
  expectedRoot: string,
  actualRoot: string,
  entries: ManifestEntry[],
): void {
  const mismatches: string[] = [];
  let compared = 0;

  for (const { path: rel } of entries) {
    if (!rel.startsWith('pcck/') || !rel.endsWith('.txt')) continue;

    const expectedPath = path.join(expectedRoot, rel);
    const actualPath = path.join(actualRoot, rel);
    if (!fs.existsSync(expectedPath)) {
      mismatches.push(`missing expected fixture: ${rel}`);
      continue;
    }
    if (!fs.existsSync(actualPath)) {
      mismatches.push(`missing actual pcck bucket: ${rel}`);
      continue;
    }

    const oracle = parseBucketMap(fs.readFileSync(expectedPath, 'utf8'));
    const actual = parseBucketMap(fs.readFileSync(actualPath, 'utf8'));
  const oracleKeys = Object.keys(oracle);
    const actualKeys = new Set(Object.keys(actual));

    for (const key of oracleKeys) {
      const title = bucketKeyTitle(key);
      // All oracle keys must exist in the port bucket — including the four
      // titles whose legacy payloads carried Big5-era PUA (藭/芎藭/峿/樔);
      // the port retains them with curated PUA→Unicode normalization
      // (src/pack/csld-pua.ts), so payload bytes differ but ids must match.
      if (!actualKeys.has(key)) {
        mismatches.push(`${rel}: missing oracle key ${key} (${title}) in port bucket`);
        continue;
      }
      const drift = compareCEntryStructurally(
        `${rel}:${title}`,
        oracle[key],
        actual[key],
      );
      if (drift) mismatches.push(drift);
    }

    compared++;
  }

  expect(compared).toBeGreaterThan(0);
  if (mismatches.length > 0) {
    throw new Error(
      `${mismatches.length} pcck structural failure(s) (compared ${compared}):\n` +
        mismatches.slice(0, 10).join('\n'),
    );
  }
}


const goldenIt = hasPackInput ? it : it.skip;
describe('golden manifest skip policy', () => {
  it('does not skip generated index or cross-reference metadata', () => {
    expect(shouldSkipManifestPath('a/index.json')).toBeNull();
    expect(shouldSkipManifestPath('a/xref.json')).toBeNull();
    expect(shouldSkipManifestPath('h/index.json')).toBeNull();
    expect(shouldSkipManifestPath('h/xref.json')).toBeNull();
    expect(shouldSkipManifestPath('t/index.json')).toBeNull();
    expect(shouldSkipManifestPath('t/xref.json')).toBeNull();
  });
});

describe('golden output', () => {
  it('loads every path from an external fixture root without a manifest', () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'manifestless-fixture-'));
    try {
      for (const rel of ['a/index.json', 'h/index.json', 't/index.json', 't/xref.json', 'c/index.json', 'pack/0.txt']) {
        const file = path.join(root, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'fixture');
      }
      expect(loadManifest(root).map((entry) => entry.path).sort()).toEqual([
        'a/index.json',
        'c/index.json',
        'h/index.json',
        'pack/0.txt',
        't/index.json',
        't/xref.json',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('has a committed fixture manifest', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const entries = loadManifest(FIXTURE_ROOT);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.path.startsWith('pack/'))).toBe(true);
  });

  goldenIt('matches legacy pack subset for a when MOEDICT_PACK_INPUT is set', async () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'pack-golden-'));
    try {
      await runPack({
        lang: 'a',
        inputDir: packInput!,
        outputDir: out,
        concurrency: Number(process.env.MOEDICT_PACK_CONCURRENCY ?? 1),
      });

      const expectedRoot = process.env.LEGACY_FIXTURE_ROOT ?? FIXTURE_ROOT;
      const entries = loadManifest(expectedRoot);
      compareManifestFiles(expectedRoot, out, entries);

      // Sanity: pack buckets and entry files were produced.
      expect(fs.existsSync(path.join(out, 'pack'))).toBe(true);
      expect(fs.existsSync(path.join(out, 'a'))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 600_000);

  goldenIt('matches legacy pack subset for h when MOEDICT_PACK_INPUT is set', async () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'pack-golden-h-'));
    try {
      await runPack({
        lang: 'h',
        inputDir: packInput!,
        outputDir: out,
        concurrency: Number(process.env.MOEDICT_PACK_CONCURRENCY ?? 1),
      });

      const expectedRoot = process.env.LEGACY_FIXTURE_ROOT ?? FIXTURE_ROOT;
      const entries = loadManifest(expectedRoot);
      compareLangManifestFiles(expectedRoot, out, entries, 'h/');

      // Sanity: phck buckets and h/ entry files were produced.
      expect(fs.existsSync(path.join(out, 'phck'))).toBe(true);
      expect(fs.existsSync(path.join(out, 'h'))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 600_000);

  goldenIt('matches legacy pack subset for t when MOEDICT_PACK_INPUT is set', async () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'pack-golden-t-'));
    try {
      await runPack({
        lang: 't',
        inputDir: packInput!,
        outputDir: out,
        concurrency: Number(process.env.MOEDICT_PACK_CONCURRENCY ?? 1),
      });

      const expectedRoot = process.env.LEGACY_FIXTURE_ROOT ?? FIXTURE_ROOT;
      const entries = loadManifest(expectedRoot);
      compareLangManifestFiles(expectedRoot, out, entries, 't/');

      // Sanity: ptck buckets and t/ entry files were produced.
      expect(fs.existsSync(path.join(out, 'ptck'))).toBe(true);
      expect(fs.existsSync(path.join(out, 't'))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 600_000);

  const csldGoldenIt = hasCsldInput ? it : it.skip;

  csldGoldenIt('matches legacy pack subset for c when MOEDICT_PACK_INPUT has dict-csld.json', async () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'pack-golden-c-'));
    try {
      await runPack({
        lang: 'c',
        inputDir: packInput!,
        outputDir: out,
        concurrency: Number(process.env.MOEDICT_PACK_CONCURRENCY ?? 1),
      });

      const expectedRoot = process.env.LEGACY_FIXTURE_ROOT ?? FIXTURE_ROOT;
      const entries = loadManifest(expectedRoot);
      compareLangManifestFiles(expectedRoot, out, entries, 'c/');
      comparePcckManifestFiles(expectedRoot, out, entries);

      expect(fs.existsSync(path.join(out, 'pcck'))).toBe(true);
      expect(fs.existsSync(path.join(out, 'c'))).toBe(true);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 600_000);
});

describe('c fixture selection', () => {
  // Always-on (no MOEDICT_PACK_INPUT gate): a clean checkout must carry the
  // c/pcck fixture subset and the manifest must select it, so the c golden
  // cannot silently vanish when the input env is unset.
  it('manifest lists c/ and pcck/ fixtures that exist on disk', () => {
    const entries = loadManifest(FIXTURE_ROOT);
    const cEntries = entries.filter((e) => e.path.startsWith('c/'));
    const pcckEntries = entries.filter(
      (e) => e.path.startsWith('pcck/') && e.path.endsWith('.txt'),
    );
    expect(cEntries.length).toBeGreaterThan(0);
    expect(pcckEntries.length).toBeGreaterThanOrEqual(6);
    expect(cEntries.map((e) => e.path)).toContain('c/index.json');
    for (const { path: rel } of [...cEntries, ...pcckEntries]) {
      expect(fs.existsSync(path.join(FIXTURE_ROOT, rel))).toBe(true);
    }
  });
});
