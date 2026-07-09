import { describe, expect, it } from 'bun:test';
import { buildPrefixTrie, buildLenToRegex } from '~/pack/prefix';

describe('buildPrefixTrie', () => {
  it('groups titles by first character', () => {
    const trie = buildPrefixTrie([
      { t: '中央' },
      { t: '中間' },
      { t: '中' },
    ]);
    expect(trie['中']).toContain('央');
    expect(trie['中']).toContain('間');
    expect(trie['中']).toContain('');
  });
});

describe('buildLenToRegex', () => {
  it('covers every title length', () => {
    const entries = [{ t: '中央' }, { t: '中間' }, { t: '人民' }];
    const trie = buildPrefixTrie(entries);
    const result = buildLenToRegex(trie, 'a');
    for (const entry of entries) {
      const len = [...entry.t].length; // codepoint length
      expect(result.lenToTitles[len]).toContain(entry.t);
    }
  });
});
