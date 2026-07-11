import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalJson, cLocaleCompare } from './serializer';
import { codepoint, cpFromChar } from './variants';
import { assertNoPua } from './autolink';

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
 * Resolve one upstream asset URL to its mirrored local path. An asset the
 * source record references but the mirror never successfully fetched is a
 * hard compile error, not a silently dropped or upstream-hotlinked entry —
 * the whole point of the mirror is that the emitted sidecar never depends on
 * a live fetch to the upstream host.
 */
function resolveLocalPath(url: string, character: string, assetKind: string, urlToLocalPath: ReadonlyMap<string, string>, allRowsByUrl: ReadonlyMap<string, MirrorManifestRow>): string {
  const localPath = urlToLocalPath.get(url);
  if (localPath !== undefined) return localPath;
  const knownRow = allRowsByUrl.get(url);
  const reason = knownRow ? `mirror status=${knownRow.status}` : 'not present in mirror manifest at all';
  throw new Error(`Historical-scripts ${assetKind} for ${character} references an unmirrored asset (${reason}): ${url}`);
}

const CITATION_IMG_RE = /<img[^>]+src=["']([^"']+)["']/g;

/**
 * Rewrite every upstream citation-inline `<img src="…">` URL in a source
 * form's citation HTML to its mirrored local path via a single targeted
 * extraction pass per citation (not a scan of the whole URL→path map, which
 * is O(rows × manifest size) at this corpus's ~47k-row scale).
 */
function rewriteCitation(citation: string, character: string, urlToLocalPath: ReadonlyMap<string, string>, allRowsByUrl: ReadonlyMap<string, MirrorManifestRow>): string {
  return citation.replace(CITATION_IMG_RE, (full, url: string) => full.replace(url, resolveLocalPath(url, character, 'citation-inline image', urlToLocalPath, allRowsByUrl)));
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
 * drop every reference after the first).
 */
export function compileHistoricalScripts(recordsText: string, manifestText: string): HistoricalScriptsOutput {
  const allRows = parseMirrorManifest(manifestText);
  const allRowsByUrl = new Map(allRows.map((r) => [r.url, r]));
  const urlToLocalPath = new Map(allRows.filter((r) => r.status === 'ok').map((r) => [r.url, r.localPath]));

  const output: HistoricalScriptsOutput = {};
  for (const record of parseHistoricalRecords(recordsText)) {
    if (!record.found) continue;
    const cp = cpFromChar(record.character);
    if (cp === undefined) throw new Error(`Historical-scripts record character is not a single Unicode scalar: ${JSON.stringify(record.character)}`);
    const cpKey = codepoint(cp);

    const strokes: StrokeEntry[] = record.strokes
      .map((s) => ({
        key: s.key,
        ...(s.gif ? { webp: resolveLocalPath(s.gif, record.character, 'stroke gif', urlToLocalPath, allRowsByUrl) } : {}),
        ...(s.jpg ? { jpg: resolveLocalPath(s.jpg, record.character, 'stroke jpg', urlToLocalPath, allRowsByUrl) } : {}),
      }))
      .sort((a, b) => scriptOrderCompare(STROKE_SCRIPT_ORDER, a.key, b.key));

    const sources: SourceEntry[] = record.sources
      .map((src) => ({
        key: src.key,
        forms: src.forms
          .filter((f): f is HistoricalRecordSourceForm & { image: string } => !!f.image)
          .map((f) => ({
            image: resolveLocalPath(f.image, record.character, 'source image', urlToLocalPath, allRowsByUrl),
            citation: rewriteCitation(f.citation ?? '', record.character, urlToLocalPath, allRowsByUrl),
          }))
          .sort((a, b) => cLocaleCompare(a.citation, b.citation) || cLocaleCompare(a.image, b.image)),
      }))
      .sort((a, b) => scriptOrderCompare(SOURCE_SCRIPT_ORDER, a.key, b.key));

    output[cpKey] = { strokes, sources };
  }

  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => cLocaleCompare(a, b)));
}

export function writeHistoricalScriptsIndex(inputDir: string, outputDir: string): void {
  const recordsPath = path.join(inputDir, 'historical-records.ndjson');
  const manifestPath = path.join(inputDir, 'mirror-manifest.ndjson');
  if (!fs.existsSync(recordsPath)) throw new Error(`Historical-scripts records file not found: ${recordsPath}`);
  if (!fs.existsSync(manifestPath)) throw new Error(`Historical-scripts mirror manifest not found: ${manifestPath}`);
  const output = compileHistoricalScripts(fs.readFileSync(recordsPath, 'utf8'), fs.readFileSync(manifestPath, 'utf8'));
  const dir = path.join(outputDir, 'a', 'historical-scripts');
  fs.mkdirSync(dir, { recursive: true });
  const content = `${canonicalJson(output)}\n`;
  assertNoPua(content, 'historical-scripts index.json');
  fs.writeFileSync(path.join(dir, 'index.json'), content);
}
