import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runPack } from '~/pack/pipeline';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Taiwanese reading-only heteronyms', () => {
  it('adds attr=2 readings to an existing entry without inventing an audio id', async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'twblg-empty-reading-'));
    roots.push(root);
    const input = path.join(root, 'input');
    const output = path.join(root, 'output');
    const csvDir = path.join(input, 'moedict-data-twblg', 'uni');
    fs.mkdirSync(csvDir, { recursive: true });

    fs.writeFileSync(
      path.join(input, 'dict-twblg.json'),
      JSON.stringify([
        {
          title: '蛇',
          radical: '虫',
          stroke_count: 11,
          non_radical_stroke_count: 5,
          heteronyms: [
            {
              id: '7843',
              trs: 'tsua\u0302',
              reading: '白',
              definitions: [{ def: '爬蟲類動物。' }],
            },
          ],
        },
      ]),
    );
    fs.writeFileSync(path.join(input, 'dict-twblg-ext.json'), '[]');
    fs.writeFileSync(
      path.join(csvDir, '詞目總檔.csv'),
      [
        '主編碼,屬性,詞目,音讀,文白屬性,部首',
        '21281,2,蛇,siâ,1,虫',
        '21282,2,孤,koo,1,子',
        '21283,1,蛇,sô,1,虫',
        '',
      ].join('\n'),
    );

    await runPack({ lang: 't', inputDir: input, outputDir: output, concurrency: 1 });

    const snake = JSON.parse(fs.readFileSync(path.join(output, 't', '蛇.json'), 'utf8'));
    expect(snake.h).toHaveLength(2);
    expect(snake.h[1]).toEqual({ T: 'sia\u0302', d: [], reading: '文' });
    expect(snake.h[1]._).toBeUndefined();
    expect(snake.h[1]['=']).toBeUndefined();
    expect(fs.existsSync(path.join(output, 't', '孤.json'))).toBe(false);
  });
});
