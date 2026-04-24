import { describe, expect, it } from 'vitest';
import { collapseWhitespace, normalizeText } from '../src/normalize';

describe('normalizeText', () => {
  it('rewrites legacy gif image markers into {[code]} tokens', () => {
    expect(normalizeText('字&abc._104_0.gif;後')).toBe('字{[abc]}後');
    expect(normalizeText('字&abc._104_0.gif後')).toBe('字{[abc]}後');
  });

  it('rewrites legacy png image markers into {[code]} tokens', () => {
    expect(normalizeText('字&8e50;_.png;後')).toBe('字{[8e50]}後');
    expect(normalizeText('字&8e50;_.png後')).toBe('字{[8e50]}後');
    expect(normalizeText('字&8e50_.png後')).toBe('字{[8e50]}後');
  });

  it('handles multiple markers in one string', () => {
    expect(normalizeText('&abc._104_0.gif;與&DEF;_.png;之間')).toBe('{[abc]}與{[DEF]}之間');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(123)).toBe('');
    expect(normalizeText({})).toBe('');
  });

  it('passes strings without image markers through unchanged', () => {
    expect(normalizeText('純文字，沒有標記。')).toBe('純文字，沒有標記。');
  });
});

describe('collapseWhitespace', () => {
  it('collapses runs of ascii whitespace to single space', () => {
    expect(collapseWhitespace('a   b\t\tc')).toBe('a b c');
  });

  it('treats U+3000 (fullwidth space) the same as ascii space', () => {
    expect(collapseWhitespace('ㄏㄨㄚ　ㄓ ㄓㄠ　ㄓㄢˇ')).toBe('ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ');
  });

  it('trims leading and trailing whitespace', () => {
    expect(collapseWhitespace('  abc  ')).toBe('abc');
  });

  it('returns empty string unchanged', () => {
    expect(collapseWhitespace('')).toBe('');
  });
});
