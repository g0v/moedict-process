import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';

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
});
