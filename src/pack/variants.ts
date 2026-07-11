import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPuaCodePoint } from './autolink';
import { canonicalJson, cLocaleCompare } from './serializer';

export type VariantStatus = 'resolved' | 'unresolved-pua' | 'unresolved-glyph';
export interface VariantRow { educode: string; note: string; seq: string; char?: string; glyphRef?: string; status: VariantStatus; codepoint?: string; source?: string; observedAt?: string; }
export interface HeadwordObservation { educode: string; title: string; }
export interface HeadwordObservationEnvelope { kind: 'partial-boundary-observation'; source: string; observedAt: string; entries: HeadwordObservation[]; boundaryProbes: Array<{ educode: string; present: boolean }>; }
export interface DuplicateResolution { keepLine: string; reason: string; source: string; }
export interface VariantsInput { listText: string; overlay?: Record<string, { codepoint?: string; status?: VariantStatus; source?: string }>; observations?: HeadwordObservationEnvelope; duplicateResolutions?: Record<string, DuplicateResolution>; }
export interface VariantsOutput { resolvedGlyphs: Record<string, string[]>; headwordGroups: Record<string, string[]>; groups: Record<string, { headword: VariantRow; variants: VariantRow[] }>; }

const HEX_IMAGE = /^\/variants\/tmp\/([0-9a-f]+)\.png$/i;
const EDUCODE = /^[ABCN]\d{5}(?:-\d{3}(?:-\d+)*)?$/;

/**
 * True exactly for Unicode scalar values: non-negative integers up to
 * U+10FFFF, excluding the surrogate range. `String.fromCodePoint` accepts
 * precisely these inputs without throwing, and `codepoint()` formats them.
 * Total over all JS numbers: non-integers, NaN, and infinities return false
 * (the floor conjunct is trivially true under the verified precondition, so
 * the proof covers the integer domain and the runtime rejects the rest).
 */
export function isUnicodeScalar(cp: number): boolean {
  //@ verify
  //@ requires cp === Math.floor(cp)
  //@ ensures \result === (cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF))
  return cp === Math.floor(cp) && cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

/**
 * Partition a candidate codepoint (decoded from a kcwu PNG filename or an
 * overlay assertion) into exactly one of three categories:
 * - 'resolved': a real assigned-range scalar safe to emit as text;
 * - 'private-use': a PUA scalar (BMP or planes 15/16) that must stay symbolic;
 * - 'invalid': not a Unicode scalar at all (out of range or surrogate).
 * The three ensures are biconditionals over disjoint, exhaustive conditions,
 * so exactly one category holds for every input.
 */
export function classifyHexCodePoint(cp: number): 'resolved' | 'private-use' | 'invalid' {
  //@ verify
  //@ requires cp === Math.floor(cp) && cp >= 0
  //@ ensures (\result === 'invalid') === (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF))
  //@ ensures (\result === 'private-use') === ((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0xFFFFD) || (cp >= 0x100000 && cp <= 0x10FFFD))
  //@ ensures (\result === 'resolved') === (cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF) && !((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0xFFFFD) || (cp >= 0x100000 && cp <= 0x10FFFD)))
  if (!isUnicodeScalar(cp)) return 'invalid';
  if (isPuaCodePoint(cp)) return 'private-use';
  return 'resolved';
}

function codepoint(cp: number): string {
  if (!isUnicodeScalar(cp)) throw new Error(`Invalid Unicode scalar: ${cp.toString(16)}`);
  return `U+${cp.toString(16).toUpperCase()}`;
}

function cpFromChar(value: string): number | undefined {
  const values = [...value];
  if (values.length !== 1) return undefined;
  const cp = values[0]?.codePointAt(0);
  return cp !== undefined && isUnicodeScalar(cp) ? cp : undefined;
}

function assertNoPrivateUse(value: string, context: string): void {
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    if (isPuaCodePoint(cp)) throw new Error(`PUA codepoint(s) in ${context}: U+${cp.toString(16).toUpperCase()}`);
  }
}

function parseOverlayCodepoint(value: string): { cp: number; text: string } {
  if (!/^U\+[0-9A-Fa-f]{4,6}$/.test(value)) throw new Error(`Invalid overlay codepoint: ${value}`);
  const cp = Number.parseInt(value.slice(2), 16);
  if (!isUnicodeScalar(cp)) throw new Error(`Invalid overlay codepoint: ${value}`);
  if (isPuaCodePoint(cp)) throw new Error(`Overlay codepoint is PUA: ${value}`);
  return { cp, text: codepoint(cp) };
}

/**
 * Row-state invariant: resolved rows carry exactly a single-scalar char plus
 * its codepoint and no glyphRef; unresolved rows carry a symbolic glyphRef
 * and neither char nor codepoint.
 */
export function assertRowState(row: VariantRow): VariantRow {
  const resolved = row.status === 'resolved';
  if (resolved !== (row.codepoint !== undefined)) throw new Error(`Resolved status requires a codepoint for ${row.educode}`);
  if (resolved !== (row.char !== undefined)) throw new Error(`Resolved status requires a character for ${row.educode}`);
  if (resolved === (row.glyphRef !== undefined)) throw new Error(`Unresolved status requires a symbolic glyphRef for ${row.educode}`);
  if (resolved) {
    const cp = cpFromChar(row.char!);
    if (cp === undefined) throw new Error(`Resolved character must be a single scalar for ${row.educode}`);
    if (row.codepoint !== codepoint(cp)) throw new Error(`Resolved character does not match codepoint for ${row.educode}`);
  }
  return row;
}

export function parseVariantList(listText: string, overlay: VariantsInput['overlay'] = {}, observationEnvelope?: HeadwordObservationEnvelope, duplicateResolutions: VariantsInput['duplicateResolutions'] = {}): VariantRow[] {
  const byEducode = new Map<string, string[]>();
  for (const [index, line] of listText.split(/\r?\n/).filter(Boolean).entries()) {
    const educode = line.split('\t')[0] ?? '';
    if (!educode || !EDUCODE.test(educode)) throw new Error(`Invalid educode at line ${index + 1}: ${educode}`);
    byEducode.set(educode, [...(byEducode.get(educode) ?? []), line]);
  }
  const selectedLines: string[] = [];
  for (const [educode, candidates] of byEducode) {
    const unique = [...new Set(candidates)];
    if (unique.length === 1) selectedLines.push(unique[0]!);
    else {
      const rule = duplicateResolutions[educode];
      if (!rule || !rule.reason || !rule.source || !unique.includes(rule.keepLine)) throw new Error(`Conflicting duplicate educode: ${educode}`);
      selectedLines.push(rule.keepLine);
    }
  }
  const seen = new Set<string>();
  const rows: VariantRow[] = selectedLines.map((line) => {
    const [educode = '', note = '', seq = '', rawChar = '', image = ''] = line.split('\t');
    if (seen.has(educode)) throw new Error(`Duplicate educode: ${educode}`);
    seen.add(educode);
    const override = overlay[educode];
    let char: string | undefined;
    let glyphRef: string | undefined;
    let cp: number | undefined;
    let symbolic: VariantStatus | undefined;
    if (rawChar) {
      const rawCp = cpFromChar(rawChar);
      if (rawCp === undefined) throw new Error(`Invalid character field for ${educode}: not a single Unicode scalar`);
      if (isPuaCodePoint(rawCp)) { glyphRef = rawCp.toString(16).toLowerCase(); symbolic = 'unresolved-pua'; }
      else { cp = rawCp; char = rawChar; }
    }
    if (cp === undefined && glyphRef === undefined) {
      const match = image.match(HEX_IMAGE);
      if (match) {
        const value = Number.parseInt(match[1]!, 16);
        const category = classifyHexCodePoint(value);
        if (category === 'resolved') { cp = value; char = String.fromCodePoint(value); }
        else { glyphRef = match[1]!.toLowerCase(); symbolic = category === 'private-use' ? 'unresolved-pua' : 'unresolved-glyph'; }
      } else if (image) { glyphRef = image.replace(/^\/variants\/tmp\//, '').replace(/\.png$/i, ''); symbolic = 'unresolved-glyph'; }
      else { glyphRef = educode; symbolic = 'unresolved-glyph'; }
    }
    if (override?.codepoint) {
      const parsed = parseOverlayCodepoint(override.codepoint);
      if (cp !== undefined && cp !== parsed.cp) throw new Error(`Conflicting codepoint for ${educode}: ${codepoint(cp)} vs ${parsed.text}`);
      cp = parsed.cp; char = String.fromCodePoint(parsed.cp); glyphRef = undefined; symbolic = undefined;
    }
    const inferred: VariantStatus = cp !== undefined ? 'resolved' : (symbolic ?? 'unresolved-glyph');
    if (override?.status && override.status !== inferred) throw new Error(`Conflicting status for ${educode}: ${override.status} vs ${inferred}`);
    return assertRowState({ educode, note, seq, ...(char !== undefined ? { char } : {}), ...(glyphRef !== undefined ? { glyphRef } : {}), status: inferred, ...(cp !== undefined ? { codepoint: codepoint(cp) } : {}), ...(override?.source ? { source: override.source } : {}) });
  });
  if (observationEnvelope) {
    if (observationEnvelope.kind !== 'partial-boundary-observation' || typeof observationEnvelope.source !== 'string' || typeof observationEnvelope.observedAt !== 'string' || !Array.isArray(observationEnvelope.entries) || !Array.isArray(observationEnvelope.boundaryProbes)) throw new Error('Invalid headword observation envelope');
    for (const probe of observationEnvelope.boundaryProbes) if (!EDUCODE.test(probe.educode) || typeof probe.present !== 'boolean') throw new Error(`Invalid boundary probe: ${JSON.stringify(probe)}`);
    for (const observation of observationEnvelope.entries) {
      if (!EDUCODE.test(observation.educode)) throw new Error(`Invalid observation educode: ${observation.educode}`);
      if (seen.has(observation.educode)) throw new Error(`Conflicting duplicate educode: ${observation.educode}`);
      const cp = cpFromChar(observation.title);
      if (cp === undefined || isPuaCodePoint(cp)) throw new Error(`Invalid observation title: ${observation.educode}`);
      rows.push(assertRowState({ educode: observation.educode, note: '正', seq: '', char: observation.title, status: 'resolved', codepoint: codepoint(cp), source: observationEnvelope.source, observedAt: observationEnvelope.observedAt }));
      seen.add(observation.educode);
    }
  }
  return rows;
}

export function compileVariants(input: VariantsInput): VariantsOutput {
  const rows = parseVariantList(input.listText, input.overlay, input.observations, input.duplicateResolutions);
  const byGroup = new Map<string, VariantRow[]>();
  for (const row of rows) {
    const group = row.educode.split('-')[0]!;
    const list = byGroup.get(group) ?? [];
    list.push(row);
    byGroup.set(group, list);
  }
  const resolvedGlyphs: Record<string, string[]> = {};
  const headwordGroups: Record<string, string[]> = {};
  const groups: VariantsOutput['groups'] = {};
  for (const [group, members] of byGroup) {
    const headword = members.find(row => row.educode === group);
    if (!headword) throw new Error(`Orphan variant group: ${group}`);
    const variants = members.filter(row => row.educode !== group).sort((a, b) => cLocaleCompare(a.educode, b.educode));
    groups[group] = { headword, variants };
    if (headword.codepoint) (headwordGroups[headword.codepoint] ??= []).push(group);
    for (const row of members) if (row.codepoint) (resolvedGlyphs[row.codepoint] ??= []).push(row.educode);
  }
  // Bidirectional set equality per (codepoint, educode) pair — independent of
  // how the index was constructed. Expected pairs come from rows; actual pairs
  // come from the built index. Duplicate actual pairs are rejected outright, so
  // a duplicate+omission cancellation cannot slip through a size comparison.
  // Several educodes may legitimately share one glyph codepoint.
  const expectedGlyphPairs = new Set(rows.filter(row => row.codepoint !== undefined).map(row => `${row.codepoint}\u0000${row.educode}`));
  const actualGlyphPairs = new Set<string>();
  for (const [cpKey, educodes] of Object.entries(resolvedGlyphs)) {
    for (const educode of educodes) {
      const pair = `${cpKey}\u0000${educode}`;
      if (actualGlyphPairs.has(pair)) throw new Error(`Duplicate reverse index pair: ${cpKey} -> ${educode}`);
      actualGlyphPairs.add(pair);
      if (!expectedGlyphPairs.has(pair)) throw new Error(`Reverse index corruption: ${cpKey} -> ${educode}`);
    }
  }
  for (const pair of expectedGlyphPairs) if (!actualGlyphPairs.has(pair)) throw new Error(`Reverse index omission: ${pair.replace('\u0000', ' -> ')}`);
  const expectedHeadwordPairs = new Set(Object.entries(groups).filter(([, g]) => g.headword.codepoint !== undefined).map(([group, g]) => `${g.headword.codepoint}\u0000${group}`));
  const actualHeadwordPairs = new Set<string>();
  for (const [cpKey, groupCodes] of Object.entries(headwordGroups)) {
    for (const group of groupCodes) {
      if (group.includes('-')) throw new Error(`Headword index contains child educode: ${group}`);
      const pair = `${cpKey}\u0000${group}`;
      if (actualHeadwordPairs.has(pair)) throw new Error(`Duplicate headword index pair: ${cpKey} -> ${group}`);
      actualHeadwordPairs.add(pair);
      if (!expectedHeadwordPairs.has(pair)) throw new Error(`Headword index corruption: ${cpKey} -> ${group}`);
    }
  }
  for (const pair of expectedHeadwordPairs) if (!actualHeadwordPairs.has(pair)) throw new Error(`Headword index omission: ${pair.replace('\u0000', ' -> ')}`);
  for (const map of [resolvedGlyphs, headwordGroups]) for (const key of Object.keys(map)) map[key]!.sort(cLocaleCompare);
  const output = { resolvedGlyphs: Object.fromEntries(Object.entries(resolvedGlyphs).sort(([a], [b]) => cLocaleCompare(a, b))), headwordGroups: Object.fromEntries(Object.entries(headwordGroups).sort(([a], [b]) => cLocaleCompare(a, b))), groups: Object.fromEntries(Object.entries(groups).sort(([a], [b]) => cLocaleCompare(a, b))) };
  assertNoPrivateUse(canonicalJson(output), 'variants output');
  return output;
}

export function writeVariantsIndex(inputDir: string, outputDir: string): void {
  const listPath = path.join(inputDir, 'kcwu-list.tsv');
  const overlayPath = path.join(inputDir, 'resolution-overlay.json');
  if (!fs.existsSync(listPath)) throw new Error(`Variants source file not found: ${listPath}`);
  const overlay = fs.existsSync(overlayPath) ? JSON.parse(fs.readFileSync(overlayPath, 'utf8')) as VariantsInput['overlay'] : {};
  const observationPath = path.join(inputDir, 'headword-observations.json');
  const observations = fs.existsSync(observationPath) ? JSON.parse(fs.readFileSync(observationPath, 'utf8')) as HeadwordObservationEnvelope : undefined;
  const duplicatePath = path.join(inputDir, 'duplicate-resolutions.json');
  const duplicateResolutions = fs.existsSync(duplicatePath) ? JSON.parse(fs.readFileSync(duplicatePath, 'utf8')) as VariantsInput['duplicateResolutions'] : {};
  const output = compileVariants({ listText: fs.readFileSync(listPath, 'utf8'), overlay, observations, duplicateResolutions });
  const dir = path.join(outputDir, 'a', 'variants');
  fs.mkdirSync(path.join(dir, 'entries'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), `${canonicalJson({ resolvedGlyphs: output.resolvedGlyphs, headwordGroups: output.headwordGroups })}\n`);
  for (const [group, value] of Object.entries(output.groups)) fs.writeFileSync(path.join(dir, 'entries', `${group}.json`), `${canonicalJson({ [group]: value })}\n`);
}
