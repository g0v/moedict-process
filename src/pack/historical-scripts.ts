import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalJson, cLocaleCompare } from './serializer';
import { codepoint, cpFromChar } from './variants';
import { assertNoPua, isPuaCodePoint } from './autolink';

/** Canonical stroke script-type order (matches the upstream API's own `key` ordering). */
const STROKE_SCRIPT_ORDER = ['楷書', '篆書', '隸書', '行書', '草書', '金文', '甲骨文'];
/** Canonical source-citation script order (oldest→newest, matching the site's own
 * "漢字源流彙編" description: 甲骨文、金文、戰國文字、小篆(篆文)、隸書、楷書). */
const SOURCE_SCRIPT_ORDER = ['甲骨文', '金文', '戰國文字', '篆文', '隸書', '楷書'];

export type MirrorRole = 'stroke-webp' | 'stroke-jpg' | 'source-png' | 'citation-inline-png';
export interface MirrorManifestRow { url: string; localPath: string; status: 'ok' | 'failed'; }
export interface HistoricalRecordStroke { key: string; gif?: string; jpg?: string; }
export interface HistoricalRecordSourceForm { image?: string; citation?: string; }
export interface HistoricalRecordSource { key: string; forms: HistoricalRecordSourceForm[]; }
export interface HistoricalRecord {
  character: string;
  found: boolean;
  strokes: HistoricalRecordStroke[];
  sources: HistoricalRecordSource[];
}
export interface StrokeEntry { key: string; webp?: string; jpg?: string; }
export interface SourceForm { image: string; citation: string; }
export interface SourceEntry { key: string; forms: SourceForm[]; }
export interface HistoricalScriptsEntry { strokes: StrokeEntry[]; sources: SourceEntry[]; }
export type HistoricalScriptsOutput = Record<string, HistoricalScriptsEntry>;
/** A URL-keyed record of confirmed-permanent upstream acquisition gaps (e.g. a
 * genuine HTTP 404 or a corrupted source file, reverified — not a transient
 * fetch failure that should instead be fixed by rerunning acquisition). Each
 * entry requires an explicit reason and source, matching the review
 * discipline `variants.ts`'s `DuplicateResolution` already establishes for
 * exceptions: an exception must be reviewed and justified, never silent.
 */
export type KnownGaps = Record<string, { reason: string; source: string }>;
/** A reviewed, human-curated replacement for one exact raw citation string
 * that contains an uncurated PUA codepoint (keyed by the citation text
 * exactly as scraped, before any local-path rewriting). Mirrors
 * `csld-pua.ts`'s per-codepoint normalization and `variants.ts`'s
 * `DuplicateResolution`: an exception must be reviewed and justified, and
 * the compiler never invents a resolution itself.
 */
export type CitationOverrides = Record<string, string>;

/**
 * Parse NDJSON tolerantly: a malformed or truncated trailing line (from an
 * interrupted scrape/acquisition run) is skipped rather than failing the
 * whole parse, matching those pipelines' own resume semantics.
 */
function parseNdjsonTolerant<T>(text: string, isValid: (value: unknown) => value is T): T[] {
  const rows: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isValid(parsed)) rows.push(parsed);
  }
  return rows;
}

export function parseMirrorManifest(manifestText: string): MirrorManifestRow[] {
  return parseNdjsonTolerant<MirrorManifestRow>(
    manifestText,
    (v): v is MirrorManifestRow =>
      !!v && typeof v === 'object' && 'url' in v && 'localPath' in v && 'status' in v,
  );
}

function parseHistoricalRecords(recordsText: string): HistoricalRecord[] {
  return parseNdjsonTolerant<HistoricalRecord>(
    recordsText,
    (v): v is HistoricalRecord =>
      !!v && typeof v === 'object' && 'character' in v && 'found' in v && 'strokes' in v && 'sources' in v,
  );
}

/**
 * Resolve one upstream asset URL to its mirrored local path.
 * - Successfully mirrored: returns the local path.
 * - A confirmed, reviewed, permanent gap (`knownGaps`): returns `undefined`
 *   so the caller can omit just that one field/form/entry.
 * - Anything else — including a `knownGaps` entry for a URL that was never
 *   even attempted (no manifest row at all): a hard compile error. The whole
 *   point of the mirror is that the emitted sidecar never depends on a live
 *   fetch to the upstream host, and an unreviewed gap could just as easily
 *   be a pipeline bug (the job was never enumerated) as a real upstream
 *   absence. `knownGaps` therefore only downgrades a *manifest-attested*
 *   `status: "failed"` row — proof acquisition genuinely tried and failed —
 *   never a bare URL string someone wrote into the allowlist file; a typo'd
 *   or stale `knownGaps` entry with no matching failed row still throws.
 */
function resolveLocalPath(url: string, character: string, assetKind: string, urlToLocalPath: ReadonlyMap<string, string>, allRowsByUrl: ReadonlyMap<string, MirrorManifestRow>, knownGaps: KnownGaps, usedGaps: Set<string>): string | undefined {
  const localPath = urlToLocalPath.get(url);
  if (localPath !== undefined) return localPath;
  const knownRow = allRowsByUrl.get(url);
  if (url in knownGaps && knownRow?.status === 'failed') {
    usedGaps.add(url);
    return undefined;
  }
  const reason = knownRow ? `mirror status=${knownRow.status}` : 'not present in mirror manifest at all';
  throw new Error(`Historical-scripts ${assetKind} for ${character} references an unmirrored asset (${reason}): ${url}`);
}

const CITATION_IMG_RE = /<img\b[^>]*>/g;
const SRC_ATTR_RE = /src=["']([^"']+)["']/;

/**
 * Rewrite every upstream citation-inline `<img src="…">` URL in a source
 * form's citation HTML to its mirrored local path via a single targeted
 * extraction pass per citation (not a scan of the whole URL→path map, which
 * is O(rows × manifest size) at this corpus's ~47k-row scale). A citation
 * image that is a known gap has its `<img>` tag dropped entirely rather than
 * left pointing at a path that was never mirrored.
 *
 * Separately, upstream citation prose occasionally embeds a literal PUA
 * character directly in the text (observed once in the full 3,000-character
 * corpus: 鼓's citation "集成6500(鼓\uf4bd作父辛觶)" uses a vendor-specific
 * PUA codepoint for a bronze-inscription glyph with no standard Unicode
 * assignment) — distinct from the `<img>`-wrapped case above and outside
 * what a URL rewrite can fix. Per this project's PUA policy (see
 * docs/pack-format-contract.md "Variant PUA policy"), no uncurated codepoint
 * is ever silently stripped or rendered as `□`: an uncurated PUA codepoint
 * in citation text is a hard compile error. A human who has identified the
 * correct real-Unicode (or otherwise curated) reading may supply an exact
 * `citationOverrides[rawCitation] = correctedText` entry, mirroring
 * `csld-pua.ts`'s reviewed per-codepoint normalization and
 * `variants.ts`'s `DuplicateResolution` review discipline — never an
 * automatic transformation invented by the compiler itself.
 */
function rewriteCitation(citation: string, character: string, urlToLocalPath: ReadonlyMap<string, string>, allRowsByUrl: ReadonlyMap<string, MirrorManifestRow>, knownGaps: KnownGaps, usedGaps: Set<string>, citationOverrides: CitationOverrides, usedOverrides: Set<string>): string {
  const original = citation;
  const withLocalImages = citation.replace(CITATION_IMG_RE, (fullTag: string) => {
    const srcMatch = fullTag.match(SRC_ATTR_RE);
    if (!srcMatch) return fullTag;
    const url = srcMatch[1]!;
    const resolved = resolveLocalPath(url, character, 'citation-inline image', urlToLocalPath, allRowsByUrl, knownGaps, usedGaps);
    return resolved !== undefined ? fullTag.replace(url, resolved) : '';
  });
  const hasPua = [...withLocalImages].some((ch) => isPuaCodePoint(ch.codePointAt(0)!));
  if (!hasPua) return withLocalImages;
  const override = citationOverrides[original];
  if (override !== undefined) {
    usedOverrides.add(original);
    return override;
  }
  throw new Error(`Historical-scripts citation for ${character} contains an uncurated PUA codepoint; add a reviewed citationOverrides entry: ${JSON.stringify(original)}`);
}

function scriptOrderCompare(order: readonly string[], a: string, b: string): number {
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return ai !== bi ? ai - bi : cLocaleCompare(a, b);
}

/**
 * Compile the sidecar from the two pinned, no-network inputs:
 * `historical-records.ndjson` is the relationship graph of record ↔ script
 * type ↔ form exactly as scraped from the upstream API (authoritative for
 * *what points at what*, including one media asset legitimately shared by
 * two different characters' citations — e.g. 戌 and 酉 both cite the same
 * 說文古文 form image). `mirror-manifest.ndjson` is purely a URL-deduplicated
 * fetch ledger (authoritative for *where a given URL landed locally*, never
 * for the relationship graph itself — a shared URL has only one manifest
 * row, so grouping by manifest rows instead of by records would silently
 * drop every reference after the first). `knownGaps` is a small, explicitly
 * reviewed allowlist of confirmed-permanent upstream absences (dead links,
 * corrupted source files) — everything else missing is still a hard error.
 */
export function compileHistoricalScripts(recordsText: string, manifestText: string, knownGaps: KnownGaps = {}, citationOverrides: CitationOverrides = {}): HistoricalScriptsOutput {
  for (const [url, gap] of Object.entries(knownGaps)) {
    if (!gap.reason || !gap.source) throw new Error(`Historical-scripts known-gaps entry missing reason/source: ${url}`);
  }
  const allRows = parseMirrorManifest(manifestText);
  // Manifests are append-only across resumable acquisition passes, so a URL can
  // have more than one row (e.g. an earlier "ok" whose local file was later lost
  // or corrupted, retried on a subsequent run and this time recorded "failed").
  // Collapse to the latest row per URL first — Map construction keeps the last
  // occurrence of a duplicate key — THEN filter by status, so a stale earlier
  // "ok" can never outrank its own URL's newest, possibly-failed, outcome.
  const allRowsByUrl = new Map(allRows.map((r) => [r.url, r]));
  const urlToLocalPath = new Map([...allRowsByUrl.values()].filter((r) => r.status === 'ok').map((r) => [r.url, r.localPath]));

  const usedGaps = new Set<string>();
  const usedOverrides = new Set<string>();
  const output: HistoricalScriptsOutput = {};
  for (const record of parseHistoricalRecords(recordsText)) {
    if (!record.found) continue;
    const cp = cpFromChar(record.character);
    if (cp === undefined) throw new Error(`Historical-scripts record character is not a single Unicode scalar: ${JSON.stringify(record.character)}`);
    const cpKey = codepoint(cp);

    const strokes: StrokeEntry[] = record.strokes
      .map((s) => {
        const webp = s.gif ? resolveLocalPath(s.gif, record.character, 'stroke gif', urlToLocalPath, allRowsByUrl, knownGaps, usedGaps) : undefined;
        const jpg = s.jpg ? resolveLocalPath(s.jpg, record.character, 'stroke jpg', urlToLocalPath, allRowsByUrl, knownGaps, usedGaps) : undefined;
        return { key: s.key, ...(webp !== undefined ? { webp } : {}), ...(jpg !== undefined ? { jpg } : {}) };
      })
      .filter((s) => s.webp !== undefined || s.jpg !== undefined)
      .sort((a, b) => scriptOrderCompare(STROKE_SCRIPT_ORDER, a.key, b.key));

    const sources: SourceEntry[] = record.sources
      .map((src) => ({
        key: src.key,
        forms: src.forms
          .filter((f): f is HistoricalRecordSourceForm & { image: string } => !!f.image)
          .flatMap((f): SourceForm[] => {
            const image = resolveLocalPath(f.image, record.character, 'source image', urlToLocalPath, allRowsByUrl, knownGaps, usedGaps);
            if (image === undefined) return [];
            return [{ image, citation: rewriteCitation(f.citation ?? '', record.character, urlToLocalPath, allRowsByUrl, knownGaps, usedGaps, citationOverrides, usedOverrides) }];
          })
          .sort((a, b) => cLocaleCompare(a.citation, b.citation) || cLocaleCompare(a.image, b.image)),
      }))
      .filter((src) => src.forms.length > 0)
      .sort((a, b) => scriptOrderCompare(SOURCE_SCRIPT_ORDER, a.key, b.key));

    output[cpKey] = { strokes, sources };
  }

  for (const url of Object.keys(knownGaps)) if (!usedGaps.has(url)) throw new Error(`Historical-scripts known-gaps entry is stale (not referenced by any record, or its manifest row is no longer "failed" — remove it or rerun acquisition): ${url}`);
  for (const rawCitation of Object.keys(citationOverrides)) if (!usedOverrides.has(rawCitation)) throw new Error(`Historical-scripts citationOverrides entry is stale (no matching PUA-containing citation found): ${JSON.stringify(rawCitation)}`);

  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => cLocaleCompare(a, b)));
}

export function writeHistoricalScriptsIndex(inputDir: string, outputDir: string): void {
  const recordsPath = path.join(inputDir, 'historical-records.ndjson');
  const manifestPath = path.join(inputDir, 'mirror-manifest.ndjson');
  const knownGapsPath = path.join(inputDir, 'known-gaps.json');
  const citationOverridesPath = path.join(inputDir, 'citation-overrides.json');
  if (!fs.existsSync(recordsPath)) throw new Error(`Historical-scripts records file not found: ${recordsPath}`);
  if (!fs.existsSync(manifestPath)) throw new Error(`Historical-scripts mirror manifest not found: ${manifestPath}`);
  const knownGaps = fs.existsSync(knownGapsPath) ? JSON.parse(fs.readFileSync(knownGapsPath, 'utf8')) as KnownGaps : {};
  const citationOverrides = fs.existsSync(citationOverridesPath) ? JSON.parse(fs.readFileSync(citationOverridesPath, 'utf8')) as CitationOverrides : {};
  const output = compileHistoricalScripts(fs.readFileSync(recordsPath, 'utf8'), fs.readFileSync(manifestPath, 'utf8'), knownGaps, citationOverrides);
  const dir = path.join(outputDir, 'a', 'historical-scripts');
  fs.mkdirSync(dir, { recursive: true });
  const content = `${canonicalJson(output)}\n`;
  assertNoPua(content, 'historical-scripts index.json');
  fs.writeFileSync(path.join(dir, 'index.json'), content);
}
