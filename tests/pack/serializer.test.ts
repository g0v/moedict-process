import { describe, expect, it } from 'bun:test';
import { canonicalJson, cLocaleCompare } from '~/pack/serializer';

describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('cLocaleCompare', () => {
  it('matches LC_ALL=C byte order', () => {
    expect(cLocaleCompare('10', '2') < 0).toBe(true); // '1' < '2'
    expect(cLocaleCompare('中央', '中国') !== 0).toBe(true);
  });
});
