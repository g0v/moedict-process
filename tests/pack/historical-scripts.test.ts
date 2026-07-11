import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { compileHistoricalScripts, parseMirrorManifest, writeHistoricalScriptsIndex } from '~/pack/historical-scripts';

function record(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    character: '一',
    found: true,
    strokes: [
      { key: '楷書', gif: 'https://x/kai.gif', jpg: 'https://x/kai.jpg' },
      { key: '甲骨文', gif: 'https://x/jia.gif' },
    ],
    sources: [
      { key: '金文', forms: [{ image: 'https://x/source1.png', citation: '集成5318( <img src="https://x/inline1.png" style="width:20px" />丞卣)' }] },
    ],
    ...overrides,
  });
}

function manifestRow(overrides: Record<string, unknown>): string {
  return JSON.stringify({ url: 'https://x/kai.gif', localPath: 'media/kai.webp', status: 'ok', ...overrides });
}

const manifestFixture = [
  manifestRow({ url: 'https://x/kai.gif', localPath: 'media/1/kai.webp' }),
  manifestRow({ url: 'https://x/kai.jpg', localPath: 'media/1/kai.jpg' }),
  manifestRow({ url: 'https://x/jia.gif', localPath: 'media/1/jia.webp' }),
  manifestRow({ url: 'https://x/source1.png', localPath: 'media/1/source1.png' }),
  manifestRow({ url: 'https://x/inline1.png', localPath: 'media/1/inline1.png' }),
];
const manifestText = manifestFixture.join('\n');
const recordsText = record({});

describe('historical-scripts compiler', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(tmpdir(), 'historical-scripts-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('tolerates a malformed trailing manifest line', () => {
    const rows = parseMirrorManifest(`${manifestText}\n{"url":"https://x/trunc`);
    expect(rows.length).toBe(5);
  });

  it('resolves stroke webp/jpg pairs from record + manifest in canonical script order', () => {
    const output = compileHistoricalScripts(recordsText, manifestText);
    expect(output['U+4E00']?.strokes).toEqual([
      { key: '楷書', webp: 'media/1/kai.webp', jpg: 'media/1/kai.jpg' },
      { key: '甲骨文', webp: 'media/1/jia.webp' },
    ]);
  });

  it('rewrites citation-embedded upstream image URLs to local mirrored paths', () => {
    const output = compileHistoricalScripts(recordsText, manifestText);
    expect(output['U+4E00']?.sources).toEqual([
      { key: '金文', forms: [{ image: 'media/1/source1.png', citation: '集成5318( <img src="media/1/inline1.png" style="width:20px" />丞卣)' }] },
    ]);
  });

  it('preserves a media asset shared by two different characters (does not drop the second reference)', () => {
    const shared = [
      record({ character: '戌', found: true, strokes: [], sources: [{ key: '篆文', forms: [{ image: 'https://x/shared.png', citation: '說文古文' }] }] }),
      record({ character: '酉', found: true, strokes: [], sources: [{ key: '篆文', forms: [{ image: 'https://x/shared.png', citation: '說文古文' }] }] }),
    ].join('\n');
    const manifest = [manifestRow({ url: 'https://x/shared.png', localPath: 'media/shared.png' })].join('\n');
    const output = compileHistoricalScripts(shared, manifest);
    expect(output['U+620C']?.sources[0]?.forms).toEqual([{ image: 'media/shared.png', citation: '說文古文' }]);
    expect(output['U+9149']?.sources[0]?.forms).toEqual([{ image: 'media/shared.png', citation: '說文古文' }]);
  });

  it('sorts source script keys in oldest-to-newest citation order', () => {
    const multi = record({
      strokes: [],
      sources: [
        { key: '楷書', forms: [{ image: 'https://x/kai-src.png' }] },
        { key: '甲骨文', forms: [{ image: 'https://x/jia-src.png' }] },
        { key: '戰國文字', forms: [{ image: 'https://x/zhanguo-src.png' }] },
      ],
    });
    const manifest = [
      manifestRow({ url: 'https://x/kai-src.png', localPath: 'm/kai.png' }),
      manifestRow({ url: 'https://x/jia-src.png', localPath: 'm/jia.png' }),
      manifestRow({ url: 'https://x/zhanguo-src.png', localPath: 'm/zg.png' }),
    ].join('\n');
    const output = compileHistoricalScripts(multi, manifest);
    expect(output['U+4E00']?.sources.map((s) => s.key)).toEqual(['甲骨文', '戰國文字', '楷書']);
  });

  it('skips records with found: false', () => {
    const notFound = record({ found: false });
    const output = compileHistoricalScripts(notFound, manifestText);
    expect(output['U+4E00']).toBeUndefined();
  });

  it('rejects a URL whose latest manifest row is failed, even if an earlier row for the same URL was ok (append-only manifest)', () => {
    const manifest = [
      ...manifestFixture,
      manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' }),
    ].join('\n');
    expect(() => compileHistoricalScripts(recordsText, manifest)).toThrow('unmirrored asset');
  });

  it('accepts a URL whose latest manifest row is ok, even if an earlier row for the same URL was failed (retry succeeded)', () => {
    const manifest = [
      manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' }),
      ...manifestFixture,
    ].join('\n');
    const output = compileHistoricalScripts(recordsText, manifest);
    expect(output['U+4E00']?.strokes.find((s) => s.key === '楷書')?.webp).toBe('media/1/kai.webp');
  });

  it('throws when a stroke asset failed to mirror rather than dropping it silently', () => {
    const manifest = manifestFixture.map((line) => {
      const parsed = JSON.parse(line) as { url: string };
      return parsed.url === 'https://x/kai.gif' ? manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' }) : line;
    }).join('\n');
    expect(() => compileHistoricalScripts(recordsText, manifest)).toThrow('unmirrored asset');
  });

  it('omits a stroke field covered by an explicit known-gaps entry instead of throwing', () => {
    const manifest = manifestFixture.map((line) => {
      const parsed = JSON.parse(line) as { url: string };
      return parsed.url === 'https://x/kai.gif' ? manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' }) : line;
    }).join('\n');
    const output = compileHistoricalScripts(recordsText, manifest, { 'https://x/kai.gif': { reason: 'confirmed permanent 404 on manual recheck', source: 'test' } });
    const kai = output['U+4E00']?.strokes.find((s) => s.key === '楷書');
    expect(kai?.webp).toBeUndefined();
    expect(kai?.jpg).toBe('media/1/kai.jpg');
  });

  it('drops a stroke entry entirely when every field it has is a known gap', () => {
    const onlyGif = record({ strokes: [{ key: '楷書', gif: 'https://x/kai.gif' }], sources: [] });
    const manifest = [manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' })].join('\n');
    const output = compileHistoricalScripts(onlyGif, manifest, { 'https://x/kai.gif': { reason: 'confirmed gap', source: 'test' } });
    expect(output['U+4E00']?.strokes).toEqual([]);
  });

  it('drops a source form entirely when its own image is a known gap', () => {
    const withGapImage = record({
      strokes: [],
      sources: [{ key: '金文', forms: [{ image: 'https://x/gap-source.png', citation: 'plain citation, no inline image' }] }],
    });
    const manifest = [manifestRow({ url: 'https://x/gap-source.png', status: 'failed', localPath: '' })].join('\n');
    const output = compileHistoricalScripts(withGapImage, manifest, { 'https://x/gap-source.png': { reason: 'confirmed gap', source: 'test' } });
    expect(output['U+4E00']?.sources).toEqual([]);
  });

  it('strips a known-gap citation-inline image from an otherwise-resolved source form', () => {
    const withGapInline = record({
      strokes: [],
      sources: [{ key: '金文', forms: [{ image: 'https://x/source1.png', citation: 'cite(<img src="https://x/gap-inline.png"/>)' }] }],
    });
    const manifest = [
      manifestRow({ url: 'https://x/source1.png', localPath: 'media/1/source1.png' }),
      manifestRow({ url: 'https://x/gap-inline.png', status: 'failed', localPath: '' }),
    ].join('\n');
    const output = compileHistoricalScripts(withGapInline, manifest, { 'https://x/gap-inline.png': { reason: 'confirmed gap', source: 'test' } });
    expect(output['U+4E00']?.sources).toEqual([{ key: '金文', forms: [{ image: 'media/1/source1.png', citation: 'cite()' }] }]);
  });

  it('hard-fails when a known-gaps entry is never actually referenced or consumed (stale allowlist entry)', () => {
    const manifest = manifestFixture.join('\n');
    expect(() => compileHistoricalScripts(recordsText, manifest, { 'https://x/completely-unrelated.png': { reason: 'stale', source: 'test' } })).toThrow('stale');
  });

  it('still hard-fails a known-gaps entry with no matching failed manifest row (unattested, could be a pipeline bug)', () => {
    const manifest = manifestFixture.join('\n'); // no row at all for the never-attempted URL below
    const withUnattestedGap = record({
      strokes: [{ key: '楷書', gif: 'https://x/never-attempted.gif' }],
      sources: [],
    });
    expect(() => compileHistoricalScripts(withUnattestedGap, manifest, { 'https://x/never-attempted.gif': { reason: 'typo or stale entry', source: 'test' } })).toThrow('not present in mirror manifest at all');
  });

  it('still hard-fails an unmirrored asset not covered by any known-gaps entry', () => {
    const manifest = manifestFixture.map((line) => {
      const parsed = JSON.parse(line) as { url: string };
      return parsed.url === 'https://x/kai.gif' ? manifestRow({ url: 'https://x/kai.gif', status: 'failed', localPath: '' }) : line;
    }).join('\n');
    expect(() => compileHistoricalScripts(recordsText, manifest, { 'https://x/some-other-url.gif': { reason: 'irrelevant', source: 'test' } })).toThrow('unmirrored asset');
  });

  it('throws when a citation-embedded image is absent from the manifest entirely', () => {
    const manifest = manifestFixture.filter((line) => !line.includes('inline1.png')).join('\n');
    expect(() => compileHistoricalScripts(recordsText, manifest)).toThrow('not present in mirror manifest at all');
  });

  it('hard-fails a literal PUA character embedded directly in citation prose (not inside an img tag)', () => {
    const withPuaCitation = record({
      strokes: [],
      sources: [{ key: '金文', forms: [{ image: 'https://x/source1.png', citation: `集成6500(鼓${String.fromCodePoint(0xf4bd)}作父辛觶)` }] }],
    });
    const manifest = [manifestRow({ url: 'https://x/source1.png', localPath: 'media/1/source1.png' })].join('\n');
    expect(() => compileHistoricalScripts(withPuaCitation, manifest)).toThrow('uncurated PUA codepoint');
  });

  it('accepts a reviewed citationOverrides entry for a citation containing PUA', () => {
    const rawCitation = `集成6500(鼓${String.fromCodePoint(0xf4bd)}作父辛觶)`;
    const withPuaCitation = record({
      strokes: [],
      sources: [{ key: '金文', forms: [{ image: 'https://x/source1.png', citation: rawCitation }] }],
    });
    const manifest = [manifestRow({ url: 'https://x/source1.png', localPath: 'media/1/source1.png' })].join('\n');
    const output = compileHistoricalScripts(withPuaCitation, manifest, {}, { [rawCitation]: '集成6500(鼓貞作父辛觶)' });
    expect(output['U+4E00']?.sources[0]?.forms[0]?.citation).toBe('集成6500(鼓貞作父辛觶)');
  });

  it('rejects a record character that is not a single Unicode scalar', () => {
    const bad = record({ character: '一二' });
    expect(() => compileHistoricalScripts(bad, manifestText)).toThrow('not a single Unicode scalar');
  });

  it('produces deterministic key-sorted output across characters', () => {
    const two = [record({ character: '乙', strokes: [], sources: [] }), recordsText].join('\n');
    const output = compileHistoricalScripts(two, manifestText);
    expect(Object.keys(output)).toEqual(['U+4E00', 'U+4E59']);
  });

  it('writes a deterministic no-PUA sidecar file from external record + manifest paths', () => {
    fs.writeFileSync(path.join(root, 'historical-records.ndjson'), recordsText);
    fs.writeFileSync(path.join(root, 'mirror-manifest.ndjson'), manifestText);
    const out = path.join(root, 'out');
    writeHistoricalScriptsIndex(root, out);
    const content = fs.readFileSync(path.join(out, 'a/historical-scripts/index.json'), 'utf8');
    expect(content).toContain('U+4E00');
    expect(content).toContain('kai.webp');
    expect(content).not.toMatch(/[\u{F0000}-\u{FFFFD}]/u);
  });

  it('throws when the records file is missing', () => {
    fs.writeFileSync(path.join(root, 'mirror-manifest.ndjson'), manifestText);
    expect(() => writeHistoricalScriptsIndex(root, path.join(root, 'out'))).toThrow('records file not found');
  });

  it('throws when the manifest file is missing', () => {
    fs.writeFileSync(path.join(root, 'historical-records.ndjson'), recordsText);
    expect(() => writeHistoricalScriptsIndex(root, path.join(root, 'out'))).toThrow('mirror manifest not found');
  });
});
