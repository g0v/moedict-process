import { describe, expect, it } from 'bun:test';
import {
  minifyKeys,
  escapeLegacy,
  unescapeLegacy,
  expandPuaTokens,
  autolinkLine,
  grokJson,
  IDS2UNI,
  isPuaCodePoint,
  findPuaCodePoints,
  assertNoPua,
} from '~/pack/autolink';


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
  it('maps IDS that appear in latest a/c/t/h packs', () => {
    expect(IDS2UNI['⿰𧾷百']).toBe('𬦰');
    expect('𬦰'.codePointAt(0)).toBe(0x2c9b0);
    expect(IDS2UNI['⿰𧾷百']).not.toBe('𬦀'); // not near-neighbor U+2C980

    expect(IDS2UNI['⿸疒哥']).toBe('𰣻');
    expect('𰣻'.codePointAt(0)).toBe(0x308fb);

    expect(IDS2UNI['⿰亻恩']).toBe('𫣆');
    expect('𫣆'.codePointAt(0)).toBe(0x2b8c6);

    expect(IDS2UNI['⿰虫念']).toBe('𬠖');
    expect('𬠖'.codePointAt(0)).toBe(0x2c816);

    // absent from latest packs — do not keep dead maps
    expect(IDS2UNI['⿺皮卜']).toBeUndefined();
    expect(IDS2UNI['⿰金四']).toBeUndefined();
  });

  it('emits no PUA codepoints', () => {
    for (const [ids, ch] of Object.entries(IDS2UNI)) {
      const cp = ch.codePointAt(0)!;
      expect(isPuaCodePoint(cp), `${ids} => U+${cp.toString(16)} is PUA`).toBe(false);
    }
  });

  it('grokJson rewrites live IDS titles', () => {
    const raw = JSON.stringify([
      { title: '⿰𧾷百', heteronyms: [] },
      { title: '⿸疒哥', heteronyms: [] },
      { title: '⿰亻恩', heteronyms: [] },
      { title: '⿰虫念', heteronyms: [] },
    ]);
    const entries = grokJson(raw, IDS2UNI);
    expect(entries.map((e) => e.t)).toEqual(['𬦰', '𰣻', '𫣆', '𬠖']);
  });
});

describe('assertNoPua', () => {
  it('accepts assigned Unihan and ASCII', () => {
    expect(() => assertNoPua('中央𬦰𰣻𱱿', 'ok')).not.toThrow();
    expect(findPuaCodePoints('中央')).toEqual([]);
  });

  it('rejects plane-15 PUA with context', () => {
    const pua = String.fromCodePoint(0xf0000);
    expect(isPuaCodePoint(0xf0000)).toBe(true);
    expect(() => assertNoPua(`x${pua}y`, 'lang=a title=淘漉')).toThrow(
      /PUA codepoint\(s\).*lang=a title=淘漉.*U\+F0000/,
    );
  });
});

describe('autolinkLine', () => {
  it('produces a line with escaped title and linked title', () => {
    const line = autolinkLine(7, '中央', { t: '中央', h: [] }, { 2: /中央/g });
    expect(line.startsWith('7 %u4E2D%u592E ')).toBe(true);
    expect(line).toContain('"t":"中央"');
  });
});
