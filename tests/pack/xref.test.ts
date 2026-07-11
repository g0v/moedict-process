import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { writeXrefs } from '~/pack/xref';

function readJson(out: string, rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(out, rel), 'utf8'));
}

describe('writeXrefs', () => {
  let input: string;
  let out: string;

  beforeEach(() => {
    input = fs.mkdtempSync(path.join(tmpdir(), 'xref-input-'));
    out = fs.mkdtempSync(path.join(tmpdir(), 'xref-output-'));
  });

  afterEach(() => {
    fs.rmSync(input, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('does not emit xrefs without explicit side sources', () => {
    writeXrefs(input, out, new Set(['萌']));
    expect(fs.existsSync(path.join(out, 'a', 'xref.json'))).toBe(false);
  });

  it('preserves Taiwanese heteronym IDs independently of forward deduplication', () => {
    fs.writeFileSync(
      path.join(input, 'x-華語對照表.csv'),
      [
        '華語,詞條編號,詞條名稱',
        '依照,9746,照',
        '按照,9746,照',
        '照,9747,照',
        '證照,9746,照',
        '照,9746,照',
        '依照,9746,照',
        '',
      ].join('\n'),
    );
    writeXrefs(input, out, new Set(['依照', '按照', '照', '證照']));
    expect(readJson(out, 'a/xref.json')).toEqual({
      t: { 依照: '照', 按照: '照', 照: '', 證照: '照', 萌: '發穎' },
    });
    expect(readJson(out, 't/xref.json')).toEqual({
      a: { 照: '依照,按照,,證照', 發穎: '萌' },
    });
    expect(readJson(out, 't/xref-by-id.json')).toEqual({
      a: {
        照: {
          '9746': ['依照', '按照', '證照', '照'],
          '9747': ['照'],
        },
      },
    });
    expect(fs.readFileSync(path.join(out, 'a', 'xref.json'), 'utf8')).toBe(
      '{"t":{"依照":"照","按照":"照","照":"","萌":"發穎","證照":"照"}}\n',
    );
  });

  it('normalizes Hakka tokens and preserves M2H/H2M asymmetry', () => {
    fs.writeFileSync(
      path.join(input, 'work-in-progress.json'),
      JSON.stringify([
        { 詞目: '【{[F305]}仔】', 對應華語: '我' },
        { 詞目: '【小孩】', 對應華語: '小孩、舀水' },
      ]),
    );
    writeXrefs(input, out, new Set(['我', '小孩', '舀', '水']));
    expect(readJson(out, 'a/xref.json')).toEqual({ h: { 我: '𠊎仔', 小孩: '' } });
    expect(readJson(out, 'h/xref.json')).toEqual({ a: { '𠊎仔': '`我~', 小孩: ',`舀~`水~' } });
  });

  it('drops boundary delimiters while preserving interior empty Hakka components', () => {
    fs.writeFileSync(
      path.join(input, 'work-in-progress.json'),
      JSON.stringify([{ 詞目: '【細人仔】', 對應華語: '、小孩、、兒童、' }]),
    );
    writeXrefs(input, out, new Set(['小孩', '兒童']));
    expect(readJson(out, 'a/xref.json')).toEqual({ h: { 小孩: '細人仔', 兒童: '細人仔' } });
    expect(readJson(out, 'h/xref.json')).toEqual({ a: { 細人仔: '`小孩~,,`兒童~' } });
  });

  it('rejects unknown Hakka placeholder tokens', () => {
    fs.writeFileSync(
      path.join(input, 'work-in-progress.json'),
      JSON.stringify([{ 詞目: '【{[FFFF]}】', 對應華語: '測試' }]),
    );
    expect(() => writeXrefs(input, out, new Set(['測試']))).toThrow('unknown Hakka PUA token');
  });
});
