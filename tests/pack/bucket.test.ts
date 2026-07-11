import { describe, expect, it } from 'bun:test';
import { bucketIndex, filenameForTitle, isSkippedTitle, FileTitleAcceptor } from '~/pack/bucket';

describe('bucketIndex', () => {
  it('matches legacy modulus', () => {
    expect(bucketIndex('中', 'a')).toBe(0x4e2d % 1024);
    expect(bucketIndex('中', 't')).toBe(0x4e2d % 128);
    const s = '𠀀';
    expect(bucketIndex(s, 'a')).toBe((s.charCodeAt(1) - 0xdc00) % 1024);
  });
  it('returns a finite bucket for an unpaired high surrogate (no NaN)', () => {
    const u = bucketIndex('\uD800', 'a');
    expect(Number.isFinite(u)).toBe(true);
    expect(u).toBe(0xD800 % 1024);
  });
});

describe('filenameForTitle', () => {
  it('removes backtick and tilde', () => {
    expect(filenameForTitle('`中~')).toBe('中');
    expect(filenameForTitle('abc')).toBe('abc');
  });
});

describe('isSkippedTitle', () => {
  it('skips IDS and unsubstituted tokens', () => {
    expect(isSkippedTitle('⿰木木')).toBe(true);
    expect(isSkippedTitle('{[4e2d]}')).toBe(true);
    expect(isSkippedTitle('正常')).toBe(false);
  });
});

describe('FileTitleAcceptor', () => {
  it('accepts both NFC and NFD forms for the bucket (exact-string match only, matching legacy link2pack.pl $seen{$file}++)', () => {
    const acceptor = new FileTitleAcceptor();
    const nfc = 'é';
    const nfd = 'e\u0301';
    expect(acceptor.acceptFileTitle(nfc)).toBe(true);
    expect(acceptor.acceptFileTitle(nfd)).toBe(true);
  });

  it('rejects an exact-string duplicate for the bucket', () => {
    const acceptor = new FileTitleAcceptor();
    expect(acceptor.acceptFileTitle('中')).toBe(true);
    expect(acceptor.acceptFileTitle('中')).toBe(false);
  });

  it('rejects IDS filenames', () => {
    const acceptor = new FileTitleAcceptor();
    expect(acceptor.acceptFileTitle('⿰亻恩')).toBe(false);
  });

  it('accepts the first NFD-normalized form for the standalone per-entry file, rejects the second', () => {
    const acceptor = new FileTitleAcceptor();
    const nfc = 'é';
    const nfd = 'e\u0301';
    expect(acceptor.acceptFileTitle(nfc)).toBe(true);
    expect(acceptor.acceptFileWrite(nfc)).toBe(true);
    expect(acceptor.acceptFileTitle(nfd)).toBe(true);
    expect(acceptor.acceptFileWrite(nfd)).toBe(false);
  });

  it('regression: a CJK compatibility ideograph variant entry (真實案例：善 U+5584 vs its 異體字 U+2F845) is bucket-accepted alongside its base character', () => {
    const acceptor = new FileTitleAcceptor();
    const base = '\u5584'; // 善
    const variant = '\u{2F845}'; // CJK Compatibility Ideograph, NFD-decomposes to 善
    expect(variant.normalize('NFD')).toBe(base);
    expect(acceptor.acceptFileTitle(base)).toBe(true);
    expect(acceptor.acceptFileTitle(variant)).toBe(true);
  });
});
