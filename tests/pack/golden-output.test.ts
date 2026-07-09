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
  // LEGACY_FIXTURE_ROOT without manifest: walk a/ and pack/ only.
  return walk(root)
    .filter((rel) => rel.startsWith('a/') || rel.startsWith('pack/'))
    .map((rel) => ({ path: rel }));
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
  // Cross-language correspondence side inputs are not yet wired. Exact paths
  // keep generated Mandarin, Taiwanese, and Hakka indexes comparable.
  if (rel === 'a/xref.json' || rel === 'h/xref.json' || rel === 't/xref.json') {
    return 'legacy xref metadata not produced by current pack pipeline';
  }
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
    // Golden harness focuses on Mandarin a/ + pack/ for now.
    if (!rel.startsWith('a/') && !rel.startsWith('pack/')) continue;

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
      const expectedIndex = JSON.parse(e) as string[];
      const actualIndex = JSON.parse(a) as string[];
      expect([...new Set(actualIndex)]).toEqual(actualIndex);
      expect([...expectedIndex].sort(compareUnicodeScalars)).toEqual(
        [...actualIndex].sort(compareUnicodeScalars),
      );
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
const goldenIt = hasPackInput ? it : it.skip;
describe('golden manifest skip policy', () => {
  it('skips only metadata outputs the core pipeline does not generate', () => {
    expect(shouldSkipManifestPath('a/index.json')).toBeNull();
    expect(shouldSkipManifestPath('a/xref.json')).not.toBeNull();
    expect(shouldSkipManifestPath('h/index.json')).toBeNull();
    expect(shouldSkipManifestPath('h/xref.json')).not.toBeNull();
    expect(shouldSkipManifestPath('t/index.json')).toBeNull();
    expect(shouldSkipManifestPath('t/xref.json')).not.toBeNull();
  });
});

describe('golden output', () => {
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
});
