import { describe, expect, it } from 'bun:test';
import { minifyKeys, escapeLegacy, unescapeLegacy, expandPuaTokens, autolinkLine } from '~/pack/autolink';

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

describe('autolinkLine', () => {
  it('produces a line with escaped title and linked title', () => {
    const line = autolinkLine(7, '中央', { t: '中央', h: [] }, { 2: /中央/g });
    expect(line.startsWith('7 %u4E2D%u592E ')).toBe(true);
    expect(line).toContain('"t":"中央"');
  });
});
