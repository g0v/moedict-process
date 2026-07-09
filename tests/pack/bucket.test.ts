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
  it('accepts first title and rejects duplicates by NFD', () => {
    const acceptor = new FileTitleAcceptor();
    const nfc = 'é';
    const nfd = 'e\u0301';
    expect(acceptor.acceptFileTitle(nfc)).toBe(true);
    expect(acceptor.acceptFileTitle(nfd)).toBe(false);
  });

  it('rejects IDS filenames', () => {
    const acceptor = new FileTitleAcceptor();
    expect(acceptor.acceptFileTitle('⿰亻恩')).toBe(false);
  });
});
