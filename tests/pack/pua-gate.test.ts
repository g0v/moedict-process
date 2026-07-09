import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';
import { buildSpecialPacks, buildCategoryFiles } from '~/pack/special';

describe('pack PUA gate', () => {
  it('fails runPack when source definitions contain unmapped PUA', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'pack-pua-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);

    // Minimal Mandarin entry with a plane-15 PUA glyph in the definition.
    const pua = String.fromCodePoint(0xfbfb9);
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
    ).rejects.toThrow(/PUA codepoint\(s\).*U\+FBFB9/);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails buildSpecialPacks when @ payload contains PUA', () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'special-pua-'));
    const aDir = path.join(root, 'a');
    fs.mkdirSync(aDir, { recursive: true });
    const pua = String.fromCodePoint(0xfbfb9);
    fs.writeFileSync(path.join(aDir, '@一.json'), JSON.stringify(['甲', `乙${pua}`]));

    expect(() => buildSpecialPacks('a', root)).toThrow(
      /PUA codepoint\(s\).*special a\/@一\.json.*U\+FBFB9/,
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
