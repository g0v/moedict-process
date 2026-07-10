import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';

describe('csld pack edge cases', () => {
  it('packs component-description titles that start with fullwidth parens', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'csld-paren-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);

    const entries = [
      {
        title: '（土+夅）',
        heteronyms: [
          {
            bopomofo: 'ㄍㄤˋ',
            definitions: [{ def: '某些地區指山岡或狹長的高地、土崗（多用於地名）。' }],
            id: '6001140000',
            pinyin: 'gàng',
          },
        ],
      },
    ];
    fs.writeFileSync(path.join(input, 'dict-csld.json'), JSON.stringify(entries));

    await runPack({ lang: 'c', inputDir: input, outputDir: output, concurrency: 1 });

    const bucketPath = path.join(output, 'pcck', '8.txt');
    expect(fs.existsSync(bucketPath)).toBe(true);
    const body = fs.readFileSync(bucketPath, 'utf8');
    // Bucket keys are %uXXXX-escaped; the legacy oracle stores this title as
    // %uFF08%u571F+%u5905%uFF09 (deployed pcck/8.txt).
    expect(body).toContain('"%uFF08%u571F+%u5905%uFF09"');
    // Reconstructed title survives with autolink markup stripped.
    const bucket = JSON.parse(body) as Record<string, { t?: string } | undefined>;
    const payload = bucket['%uFF08%u571F+%u5905%uFF09'];
    expect(payload).toBeDefined();
    expect((payload?.t ?? '').replace(/[`~]/g, '')).toBe('（土+夅）');
    expect(body).not.toContain('"english"');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('normalizes curated Big5-era PUA to assigned Unicode and retains the entries', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'csld-pua-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);

    const entries = [
      {
        // U+E840 in the simplified-form field → 䓖 (PRC simplification of 藭).
        title: '藭',
        heteronyms: [
          {
            alt: '\uE840',
            bopomofo: 'ㄑㄩㄥˊ',
            definitions: [{ def: '參見【芎藭】。' }],
            id: '2041420000',
            pinyin: 'qióng',
          },
        ],
        stroke_count: 19,
        radical: '艸',
      },
      {
        // U+F8F8 trailing bopomofo artifact → stripped.
        title: '樔',
        heteronyms: [
          {
            bopomofo: 'ㄓㄠ\uF8F8',
            definitions: [{ def: '巢的異體。' }],
            id: '2020950000',
            pinyin: 'zhāo',
          },
        ],
      },
      {
        // U+E38F inside example text → 着.
        title: '學舌',
        heteronyms: [
          {
            bopomofo: 'ㄒㄩㄝˊ ㄕㄜˊ',
            definitions: [
              { def: '把別人的話傳來傳去。', example: ['例⃝「手裡拿\uE38F好些頑意兒」。'] },
            ],
            id: '3041720000',
            pinyin: 'xué shé',
          },
        ],
      },
    ];
    // csld2json.py writes ensure_ascii output: PUA arrives as \uXXXX escape
    // sequences, not literal chars. Encode one codepoint each way so both
    // encodings are covered (the golden run caught the escape form).
    const serialized = JSON.stringify(entries).replace(/\uE840/g, '\\ue840');
    fs.writeFileSync(path.join(input, 'dict-csld.json'), serialized);

    await runPack({ lang: 'c', inputDir: input, outputDir: output, concurrency: 1 });

    const qiong = fs.readFileSync(path.join(output, 'c', '藭.json'), 'utf8');
    expect(qiong).toContain('䓖');
    const chao = fs.readFileSync(path.join(output, 'c', '樔.json'), 'utf8');
    expect(chao).toContain('"ㄓㄠ"');
    const xueshe = fs.readFileSync(path.join(output, 'c', '學舌.json'), 'utf8');
    expect(xueshe).toContain('拿著好些');
    for (const body of [qiong, chao, xueshe]) {
      expect(/[\uE000-\uF8FF]/.test(body)).toBe(false);
    }

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('still hard-fails the c run on uncurated PUA codepoints', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'csld-pua-unknown-'));
    const input = path.join(root, 'in');
    const output = path.join(root, 'out');
    fs.mkdirSync(input);
    fs.mkdirSync(output);

    const entries = [
      {
        title: '假',
        heteronyms: [
          {
            alt: '\uE999',
            bopomofo: 'ㄐㄧㄚˇ',
            definitions: [{ def: '不真實的。' }],
            id: '1010990000',
            pinyin: 'jiǎ',
          },
        ],
      },
    ];
    fs.writeFileSync(path.join(input, 'dict-csld.json'), JSON.stringify(entries));

    await expect(
      runPack({ lang: 'c', inputDir: input, outputDir: output, concurrency: 1 }),
    ).rejects.toThrow(/PUA/i);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
