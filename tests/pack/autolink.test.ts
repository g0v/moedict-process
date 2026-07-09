import { describe, expect, it } from 'bun:test';
import {
  minifyKeys,
  escapeLegacy,
  unescapeLegacy,
  expandPuaTokens,
  autolinkLine,
  grokJson,
  IDS2UNI,
} from '~/pack/autolink';

function isPuaCodePoint(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

describe('minifyKeys', () => {
  it('shortens known keys', () => {
    expect(minifyKeys('{"heteronyms":[],"title":"x"}')).toBe('{"h":[],"t":"x"}');
  });
});

describe('escapeLegacy roundtrip', () => {
  it('is a no-op for CJK', () => {
    const s = '中央';
    expect(unescapeLegacy(escapeLegacy(s))).toBe(s);
  });
});

describe('expandPuaTokens', () => {
  it('decodes bracket hex', () => {
    expect(expandPuaTokens('{[4e2d]}')).toBe('中');
  });
});

describe('IDS2UNI PUA-free Unihan map', () => {
  it('maps all known IDS to assigned Unihan codepoints', () => {
    expect(IDS2UNI['⿰𧾷百']).toBe('𬦰');
    expect('𬦰'.codePointAt(0)).toBe(0x2c9b0);
    expect(IDS2UNI['⿰𧾷百']).not.toBe('𬦀'); // not near-neighbor U+2C980

    expect(IDS2UNI['⿸疒哥']).toBe('𰣻');
    expect('𰣻'.codePointAt(0)).toBe(0x308fb);

    expect(IDS2UNI['⿰亻恩']).toBe('𫣆');
    expect('𫣆'.codePointAt(0)).toBe(0x2b8c6);

    expect(IDS2UNI['⿰虫念']).toBe('𬠖');
    expect('𬠖'.codePointAt(0)).toBe(0x2c816);

    expect(IDS2UNI['⿺皮卜']).toBe('𱱾');
    expect('𱱾'.codePointAt(0)).toBe(0x31c7e);
  });

  it('emits no PUA codepoints', () => {
    for (const [ids, ch] of Object.entries(IDS2UNI)) {
      const cp = ch.codePointAt(0)!;
      expect(isPuaCodePoint(cp), `${ids} => U+${cp.toString(16)} is PUA`).toBe(false);
    }
  });

  it('grokJson rewrites all five IDS titles', () => {
    const raw = JSON.stringify([
      { title: '⿰𧾷百', heteronyms: [] },
      { title: '⿸疒哥', heteronyms: [] },
      { title: '⿰亻恩', heteronyms: [] },
      { title: '⿰虫念', heteronyms: [] },
      { title: '⿺皮卜', heteronyms: [] },
    ]);
    const entries = grokJson(raw, IDS2UNI);
    expect(entries.map((e) => e.t)).toEqual(['𬦰', '𰣻', '𫣆', '𬠖', '𱱾']);
  });
});

describe('autolinkLine', () => {
  it('produces a line with escaped title and linked title', () => {
    const line = autolinkLine(7, '中央', { t: '中央', h: [] }, { 2: /中央/g });
    expect(line.startsWith('7 %u4E2D%u592E ')).toBe(true);
    expect(line).toContain('"t":"中央"');
  });
});
