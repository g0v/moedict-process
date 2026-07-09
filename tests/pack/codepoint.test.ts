import { describe, expect, it } from 'bun:test';
import { codepointCount, firstCharCodeUnit, codepointCompare } from '~/pack/codepoint';

describe('codepointCount', () => {
  it('counts BMP and supplementary chars', () => {
    expect(codepointCount('abc')).toBe(3);
    expect(codepointCount('中')).toBe(1);
    expect(codepointCount('𠀀')).toBe(1); // U+20000
    expect(codepointCount('a𠀀b')).toBe(3);
  });
});

describe('firstCharCodeUnit', () => {
  it('returns first code unit for BMP and low surrogate offset for pairs', () => {
    expect(firstCharCodeUnit('中')).toBe(0x4e2d);
    const s = '𠀀';
    expect(s.length).toBe(2);
    expect(firstCharCodeUnit(s)).toBe(s.charCodeAt(1) - 0xdc00);
  });
  it('falls back to first code unit for an unpaired high surrogate (no NaN)', () => {
    expect(firstCharCodeUnit('\uD800')).toBe(0xD800);
    expect(firstCharCodeUnit('\uD800A')).toBe(0xD800);
  });
});

describe('codepointCompare', () => {
  it('orders by codepoint', () => {
    expect(codepointCompare('b', 'a') > 0).toBe(true);
    expect(codepointCompare('\uFA3E', '\u{2000D}') < 0).toBe(true);
  });
});
