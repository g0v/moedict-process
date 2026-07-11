import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { assertRowState, classifyHexCodePoint, compileVariants, isUnicodeScalar, writeVariantsIndex } from '~/pack/variants';

const fixture = [
  'A00001\t正\t\t一\t',
  'A00001-001\t\t\t\t/variants/tmp/2092a.png',
  'A00001-003\t\t\t\t/variants/tmp/f0000.png',
  'A00001-004\t\t\t\t/variants/tmp/A00001-004.png',
  'A00021\t正\t\t乙\t',
  'A00021-001\t\t\t\t/variants/tmp/f0001.png',
].join('\n');

describe('variants compiler', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(tmpdir(), 'variants-')); fs.mkdirSync(path.join(root, 'variants')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('decodes filename codepoints but keeps PUA and glyph-only rows symbolic', () => {
    const output = compileVariants({ listText: fixture, overlay: { 'A00021-001': { codepoint: 'U+30001', source: 'glyphwiki' } } });
    expect(output.resolvedGlyphs['U+2092A']).toEqual(['A00001-001']);
    expect(output.resolvedGlyphs['U+30001']).toEqual(['A00021-001']);
    expect(output.resolvedGlyphs['U+4E00']).toEqual(['A00001']);
    expect(output.groups.A00001?.variants).toEqual([
      expect.objectContaining({ educode: 'A00001-001', codepoint: 'U+2092A', status: 'resolved' }),
      expect.objectContaining({ educode: 'A00001-003', glyphRef: 'f0000', status: 'unresolved-pua' }),
      expect.objectContaining({ educode: 'A00001-004', glyphRef: 'A00001-004', status: 'unresolved-glyph' }),
    ]);
  });

  it('keeps headword index separate from resolved child glyph index', () => {
    const output = compileVariants({ listText: fixture });
    expect(output.headwordGroups['U+4E00']).toEqual(['A00001']);
    expect(output.resolvedGlyphs['U+4E00']).toEqual(['A00001']);
  });

  it('rejects malformed overlay codepoints', () => {
    expect(() => compileVariants({ listText: fixture, overlay: { 'A00001': { codepoint: 'U+4E00junk' } } })).toThrow('Invalid overlay codepoint');
  });

  it('rejects source/overlay codepoint conflicts', () => {
    expect(() => compileVariants({ listText: fixture, overlay: { 'A00001': { codepoint: 'U+4E01' } } })).toThrow('Conflicting codepoint');
  });

  it('rejects status/codepoint contradictions', () => {
    expect(() => compileVariants({ listText: fixture, overlay: { 'A00001-003': { status: 'resolved' } } })).toThrow('Conflicting status');
  });
  it('accepts nested educodes and rejects traversal or orphan groups', () => {
    const nested = compileVariants({ listText: 'A01568\t正\t\t一\t\nA01568-003-1\t\t\t丁\t' });
    expect(nested.groups.A01568?.variants[0]?.educode).toBe('A01568-003-1');
    expect(() => compileVariants({ listText: '../index\t正\t\t一\t' })).toThrow('Invalid educode');
    expect(() => compileVariants({ listText: 'A01568-003-1\t\t\t丁\t' })).toThrow('Orphan variant group');
  });

  it('collapses byte-identical duplicates and requires provenance rules for conflicts', () => {
    const exact = 'A00001\t正\t\t一\t';
    expect(compileVariants({ listText: `${exact}\n${exact}` }).groups.A00001?.headword.educode).toBe('A00001');
    const left = 'A00001\t正\t\t一\t';
    const right = 'A00001\t正\t2\t壹\t';
    expect(() => compileVariants({ listText: `${left}\n${right}` })).toThrow('Conflicting duplicate educode');
    const resolved = compileVariants({ listText: `${left}\n${right}`, duplicateResolutions: { A00001: { keepLine: right, reason: 'verified current preferred record', source: 'test-review' } } });
    expect(resolved.groups.A00001?.headword.char).toBe('壹');
  });

  it('indexes several educodes sharing one glyph codepoint without collapsing', () => {
    const shared = compileVariants({ listText: 'A00001\t正\t\t一\t\nA00001-002\t\t\t弌\t\nA00001-006\t\t\t弌\t' });
    expect(shared.resolvedGlyphs['U+5F0C']).toEqual(['A00001-002', 'A00001-006']);
  });

  it('enforces the row-state model on raw character fields', () => {
    expect(() => compileVariants({ listText: 'A00001\t正\t\t一二\t' })).toThrow('not a single Unicode scalar');
    const puaChar = compileVariants({ listText: `A00001\t正\t\t一\t\nA00001-005\t\t\t${String.fromCodePoint(0xf0009)}\t` });
    expect(puaChar.groups.A00001?.variants[0]).toEqual(expect.objectContaining({ educode: 'A00001-005', glyphRef: 'f0009', status: 'unresolved-pua' }));
    expect(puaChar.groups.A00001?.variants[0]?.char).toBeUndefined();
    const invalidHex = compileVariants({ listText: 'A00001\t正\t\t一\t\nA00001-007\t\t\t\t/variants/tmp/110000.png' });
    expect(invalidHex.groups.A00001?.variants[0]).toEqual(expect.objectContaining({ educode: 'A00001-007', glyphRef: '110000', status: 'unresolved-glyph' }));
    const bmpPua = compileVariants({ listText: 'A00001\t正\t\t一\t\nA00001-008\t\t\t\t/variants/tmp/e000.png' });
    expect(bmpPua.groups.A00001?.variants[0]).toEqual(expect.objectContaining({ educode: 'A00001-008', glyphRef: 'e000', status: 'unresolved-pua' }));
  });

  it('rejects a resolved character paired with another codepoint', () => {
    expect(() => assertRowState({ educode: 'A00001', note: '正', seq: '', char: '一', codepoint: 'U+4E01', status: 'resolved' })).toThrow('does not match codepoint');
  });

  it('rejects a lone surrogate as a resolved character', () => {
    expect(() => assertRowState({ educode: 'A00001', note: '正', seq: '', char: '\uD800', codepoint: 'U+D800', status: 'resolved' })).toThrow('single scalar');
  });

  it('keeps verified helpers total over all JS numbers', () => {
    expect(isUnicodeScalar(0x4e00)).toBe(true);
    expect(isUnicodeScalar(0.5)).toBe(false);
    expect(isUnicodeScalar(-1)).toBe(false);
    expect(isUnicodeScalar(Number.NaN)).toBe(false);
    expect(isUnicodeScalar(Number.POSITIVE_INFINITY)).toBe(false);
    expect(classifyHexCodePoint(0x4e00)).toBe('resolved');
    expect(classifyHexCodePoint(0xf0009)).toBe('private-use');
    expect(classifyHexCodePoint(0xe000)).toBe('private-use');
    expect(classifyHexCodePoint(0x110000)).toBe('invalid');
    expect(classifyHexCodePoint(0xd800)).toBe('invalid');
    expect(classifyHexCodePoint(0.5)).toBe('invalid');
  });

  it('merges additive headword observations absent from the raw snapshot', () => {
    const output = compileVariants({ listText: fixture, observations: { kind: 'partial-boundary-observation', source: 'https://dict.variants.moe.edu.tw/', observedAt: '2026-07-11', entries: [{ educode: 'N00517', title: '㠮' }, { educode: 'N00518', title: '珉' }, { educode: 'N00519', title: '瘻' }, { educode: 'N00520', title: '〇' }], boundaryProbes: [{ educode: 'N00521', present: false }, { educode: 'N00535', present: false }] } });
    expect(output.groups.N00517?.headword).toEqual(expect.objectContaining({ educode: 'N00517', codepoint: 'U+382E', source: 'https://dict.variants.moe.edu.tw/', observedAt: '2026-07-11' }));
  });

  it('rejects duplicate additive observations', () => {
    expect(() => compileVariants({ listText: fixture, observations: { kind: 'partial-boundary-observation', source: 'test', observedAt: '2026-07-11', entries: [{ educode: 'A00001', title: '一' }], boundaryProbes: [] } })).toThrow('Conflicting duplicate educode');
  });

  it('rejects malformed observation envelopes and all PUA overlays', () => {
    expect(() => compileVariants({ listText: fixture, observations: [] as never })).toThrow('Invalid headword observation envelope');
    for (const value of ['U+F0009', 'U+E000', 'U+100000']) expect(() => compileVariants({ listText: fixture, overlay: { 'A00021-001': { codepoint: value } } })).toThrow('PUA');
  });

  it('writes deterministic sidecar files from an external input path', () => {
    fs.writeFileSync(path.join(root, 'kcwu-list.tsv'), fixture);
    fs.writeFileSync(path.join(root, 'resolution-overlay.json'), JSON.stringify({ 'A00021-001': { codepoint: 'U+30001', source: 'glyphwiki' } }));
    fs.writeFileSync(path.join(root, 'headword-observations.json'), JSON.stringify({ kind: 'partial-boundary-observation', source: 'https://dict.variants.moe.edu.tw/', observedAt: '2026-07-11', entries: [{ educode: 'N00517', title: '㠮' }, { educode: 'N00518', title: '珉' }, { educode: 'N00519', title: '瘻' }, { educode: 'N00520', title: '〇' }], boundaryProbes: [{ educode: 'N00521', present: false }, { educode: 'N00535', present: false }] }));
    const out = path.join(root, 'out');
    writeVariantsIndex(root, out);
    expect(fs.existsSync(path.join(out, 'a/variants/index.json'))).toBe(true);
    const index = fs.readFileSync(path.join(out, 'a/variants/index.json'), 'utf8');
    expect(index).toContain('U+2092A');
    expect(index).toContain('U+73C9');
    expect(index).not.toMatch(/[\u{F0000}-\u{FFFFD}]/u);
  });
});
