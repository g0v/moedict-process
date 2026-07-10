import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';
import { buildSpecialPacks, buildCategoryFiles } from '~/pack/special';
import { assertNoPua, HAKKA_LITERAL_PUA } from '~/pack/autolink';

describe('pack PUA gate', () => {
  it('fails runPack when source definitions contain unmapped PUA', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'pack-pua-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);

    // Minimal Mandarin entry with a plane-15 PUA glyph in the definition.
    const pua = String.fromCodePoint(0xf0000);
    const entries = [
      {
        title: '一',
        heteronyms: [
          {
            bopomofo: 'ㄧ',
            definitions: [{ def: `含${pua}字` }],
            pinyin: 'yī',
          },
        ],
        stroke_count: 1,
        radical: '一',
        non_radical_stroke_count: 0,
      },
      {
        title: '一心',
        heteronyms: [
          {
            bopomofo: 'ㄧ ㄒㄧㄣ',
            definitions: [{ def: '專心。' }],
            pinyin: 'yī xīn',
          },
        ],
      },
    ];
    fs.writeFileSync(path.join(input, 'dict-revised.json'), JSON.stringify(entries));

    await expect(
      runPack({ lang: 'a', inputDir: input, outputDir: output, concurrency: 1 }),
    ).rejects.toThrow(/PUA codepoint\(s\).*U\+F0000/);

    fs.rmSync(root, { recursive: true, force: true });
  });
  it('passes runPack when source PUA is an allowlisted MOE variant glyph', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'pack-pua-ok-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);
    // 0xfbfb9 is one of the 110 curated MOE variant-headword codepoints and must
    // pass through (rendered by the MOE font display-side), not fail the gate.
    const pua = String.fromCodePoint(0xfbfb9);
    const entries = [
      {
        title: '一',
        heteronyms: [
          { bopomofo: 'ㄧ', definitions: [{ def: `含${pua}字` }], pinyin: 'yī' },
        ],
        stroke_count: 1,
        radical: '一',
        non_radical_stroke_count: 0,
      },
      {
        title: '一心',
        heteronyms: [
          { bopomofo: 'ㄧ ㄒㄧㄣ', definitions: [{ def: '專心。' }], pinyin: 'yī xīn' },
        ],
      },
    ];
    fs.writeFileSync(path.join(input, 'dict-revised.json'), JSON.stringify(entries));
    await runPack({ lang: 'a', inputDir: input, outputDir: output, concurrency: 1 });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes all approved Hakka literal BMP-PUA codepoints when HAKKA_LITERAL_PUA is passed', () => {
    // All 16 codepoints from dict-hakka.json that are passed through in deployed phck/
    const allHakka = '\uE577\uE6B3\uF305\uF307\uF34C\uF354\uF369\uF36B\uF36E\uF36F\uF374\uF377\uF385\uF390\uF3B9\uF545';
    expect(() => assertNoPua(allHakka, 'hakka literals', HAKKA_LITERAL_PUA)).not.toThrow();
    expect(() => assertNoPua(allHakka, 'hakka literals')).toThrow(/U\+E577/);
    // Neighbor codepoints still rejected
    expect(() => assertNoPua('\uE578', 'neighbor', HAKKA_LITERAL_PUA)).toThrow(/U\+E578/);
    expect(() => assertNoPua('\uF34D', 'neighbor', HAKKA_LITERAL_PUA)).toThrow(/U\+F34D/);
  });

  it('fails buildSpecialPacks when @ payload contains PUA', () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'special-pua-'));
    const aDir = path.join(root, 'a');
    fs.mkdirSync(aDir, { recursive: true });
    const pua = String.fromCodePoint(0xf0000);
    fs.writeFileSync(path.join(aDir, '@一.json'), JSON.stringify(['甲', `乙${pua}`]));

    expect(() => buildSpecialPacks('a', root)).toThrow(
      /PUA codepoint\(s\).*special a\/@一\.json.*U\+F0000/,
    );

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails buildCategoryFiles when entries contain PUA', () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'cat-pua-'));
    const pua = String.fromCodePoint(0xf0000);
    expect(() =>
      buildCategoryFiles([{ name: '測試', entries: ['甲', `乙${pua}`] }], root),
    ).toThrow(/PUA codepoint\(s\).*category =測試.*U\+F0000/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
