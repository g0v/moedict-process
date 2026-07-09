import { describe, expect, it } from 'bun:test';
import { dedupeHeteronyms, type HeteronymLike } from '../src/dedup';

describe('dedupeHeteronyms', () => {
  it('removes near-duplicate heteronyms that only differ by whitespace in bopomofo', () => {
    const input = [
      {
        audio_id: '284300045',
        bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ',
        pinyin: 'huā zhī zhāo zhǎn',
        definitions: [{ def: '形容花木枝葉迎風搖擺。' }, { def: '比喻人打扮豔麗。' }],
      },
      {
        audio_id: '284300045',
        bopomofo: 'ㄏㄨㄚ　ㄓ　ㄓㄠ　ㄓㄢˇ',
        pinyin: 'huā zhī zhāo zhǎn',
        definitions: [
          { def: '形容花木枝葉迎風搖擺。' },
          { def: '比喻女子打扮豔麗。也作「花枝招颭」。' },
        ],
      },
    ];

    const result = dedupeHeteronyms(input);

    expect(result).toHaveLength(1);
    expect(result[0]!.definitions).toEqual([
      { def: '形容花木枝葉迎風搖擺。' },
      { def: '比喻女子打扮豔麗。也作「花枝招颭」。' },
    ]);
  });

  it('removes byte-identical duplicate heteronyms', () => {
    const reading = {
      audio_id: '6025',
      bopomofo: 'ㄧㄠˋ',
      pinyin: 'yào',
      definitions: [{ def: '光輝、光彩。' }],
    };
    expect(dedupeHeteronyms([reading, { ...reading }])).toHaveLength(1);
  });

  it('keeps legitimate heteronyms that share audio_id but differ in bopomofo (輕聲 variants)', () => {
    const input = [
      { audio_id: '179200072', bopomofo: 'ㄌㄠˇ ˙ㄍㄨㄥ', pinyin: 'lǎo gong' },
      { audio_id: '179200072', bopomofo: 'ㄌㄠˇ ㄍㄨㄥ', pinyin: 'lǎo gōng' },
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(2);
  });

  it('keeps legitimate heteronyms with distinct pronunciations', () => {
    const input = [
      { audio_id: '6025', bopomofo: 'ㄧㄠˋ', pinyin: 'yào' },
      { bopomofo: 'ㄩㄝˋ', pinyin: 'yuè' },
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(2);
  });

  it('dedupes by bopomofo+pinyin when audio_id is absent', () => {
    const input = [
      { bopomofo: 'ㄩㄝˋ', pinyin: 'yuè', definitions: [{ def: '之又音。' }] },
      { bopomofo: 'ㄩㄝˋ', pinyin: 'yuè', definitions: [{ def: '之又音。' }] },
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(1);
  });

  it('leaves untouched heteronyms that have no identity fields at all', () => {
    const input: HeteronymLike[] = [
      { definitions: [{ def: 'A' }] } as HeteronymLike,
      { definitions: [{ def: 'B' }] } as HeteronymLike,
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(2);
  });

  it('preserves order of unique heteronyms', () => {
    const input = [
      { audio_id: '1', bopomofo: 'ㄐㄧㄚ', pinyin: 'jiā' },
      { audio_id: '2', bopomofo: 'ㄧˇ', pinyin: 'yǐ' },
      { audio_id: '1', bopomofo: 'ㄐㄧㄚ', pinyin: 'jiā' },
      { audio_id: '3', bopomofo: 'ㄅㄧㄥˇ', pinyin: 'bǐng' },
    ];
    const result = dedupeHeteronyms(input);
    expect(result.map((h) => h.audio_id)).toEqual(['1', '2', '3']);
  });

  describe('normalize() identity-key behavior', () => {
    it('treats heteronyms differing only in leading/trailing whitespace as duplicates', () => {
      // Tests the .trim() in normalize(): without it, ' ㄐㄧㄚ ' and 'ㄐㄧㄚ' would
      // hash to different identity keys and never merge.
      const input = [
        { audio_id: '1', bopomofo: ' ㄐㄧㄚ ', pinyin: 'jiā' },
        { audio_id: '1', bopomofo: 'ㄐㄧㄚ', pinyin: 'jiā' },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('collapses runs of internal whitespace (tabs, multiple spaces) before deduping', () => {
      // Tests the /\s+/ quantifier in normalize(): single \s would replace each
      // whitespace char individually, leaving multi-char runs intact.
      const input = [
        { audio_id: '1', bopomofo: 'ㄐ\t\tㄚ', pinyin: 'jiā' },
        { audio_id: '1', bopomofo: 'ㄐ ㄚ', pinyin: 'jiā' },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('preserves the single space between syllables (does not delete whitespace)', () => {
      // Tests the ' ' replacement in normalize(): an empty replacement would
      // collapse 'ㄐ ㄚ' to 'ㄐㄚ' and falsely merge it with the un-spaced form.
      const input = [
        { audio_id: '1', bopomofo: 'ㄐ ㄚ', pinyin: 'jiā' },
        { audio_id: '1', bopomofo: 'ㄐㄚ', pinyin: 'jiā' },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(2);
    });
  });

  describe('hasIdentity() field disjunction', () => {
    it('treats a heteronym with only audio_id (no other phonetic fields) as identity-bearing', () => {
      // Tests the OR-chain in hasIdentity(): if the chain were tightened to AND
      // anywhere, a partially-populated heteronym would slip through unmerged.
      const input = [
        { audio_id: '8001', definitions: [{ def: 'A' }] },
        { audio_id: '8001', definitions: [{ def: 'B' }] },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('treats a heteronym with only trs (Taigi romanization) as identity-bearing', () => {
      const input = [
        { trs: 'tsiah', definitions: [{ def: 'A' }] },
        { trs: 'tsiah', definitions: [{ def: 'B' }] },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('treats a heteronym with only pinyin as identity-bearing', () => {
      const input = [
        { pinyin: 'jiǎ', definitions: [{ def: 'A' }] },
        { pinyin: 'jiǎ', definitions: [{ def: 'A' }] },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('treats a heteronym with only bopomofo as identity-bearing', () => {
      const input = [{ bopomofo: 'ㄐㄧㄚˇ' }, { bopomofo: 'ㄐㄧㄚˇ' }];
      expect(dedupeHeteronyms(input)).toHaveLength(1);
    });

    it('treats explicit null in identity fields the same as missing fields', () => {
      // Tests the `value === null` branch in normalize(): without it, null
      // would String()-coerce to "null" and produce a phantom identity that
      // would falsely merge entries the caller meant to keep distinct.
      const input: HeteronymLike[] = [
        { bopomofo: null, pinyin: null, definitions: [{ def: 'A' }] } as HeteronymLike,
        { bopomofo: null, pinyin: null, definitions: [{ def: 'B' }] } as HeteronymLike,
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(2);
    });

    it('does not dedupe when every identity field is whitespace-only or empty', () => {
      // Tests that hasIdentity() rejects strings that normalize() collapses to '':
      // without this guard, two such heteronyms would share an empty identity
      // key and be falsely merged.
      const input = [
        { bopomofo: '   ', pinyin: '', definitions: [{ def: 'A' }] },
        { bopomofo: '', pinyin: '', definitions: [{ def: 'B' }] },
      ];
      expect(dedupeHeteronyms(input)).toHaveLength(2);
    });
  });

  describe('content-size tie-breaking', () => {
    it('keeps the earlier heteronym when its JSON content is larger than a later duplicate', () => {
      // Tests the `contentSize > existingSize` direction: an always-replace
      // mutation would silently swap in the smaller, less-informative entry.
      const longer = {
        audio_id: '1',
        bopomofo: 'ㄐ',
        pinyin: 'jiā',
        definitions: [{ def: '更詳盡的解釋以增加內容長度，避免被視為較短的重複項。' }],
      };
      const shorter = { audio_id: '1', bopomofo: 'ㄐ', pinyin: 'jiā' };
      const result = dedupeHeteronyms([longer, shorter]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(longer);
    });

    it('replaces the earlier heteronym when a later duplicate is richer', () => {
      // Tests the replace branch: ensures the symmetric direction also works.
      const lean = { bopomofo: 'ㄚ', pinyin: 'a', definitions: [{ def: '短。' }] };
      const rich = {
        bopomofo: 'ㄚ',
        pinyin: 'a',
        definitions: [{ def: '短。', example: ['例子'], quote: ['典故'] }],
      };
      const result = dedupeHeteronyms([lean, rich]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(rich);
    });

    it('keeps the first-seen heteronym when duplicates have identical content size', () => {
      // Tests the strict `>` (vs `>=`): on a tie, the earlier entry wins.
      const first = { audio_id: '1', bopomofo: 'ㄐ', pinyin: 'jiā', tag: 'aaa' };
      const second = { audio_id: '1', bopomofo: 'ㄐ', pinyin: 'jiā', tag: 'bbb' };
      const result = dedupeHeteronyms([first, second]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(first);
    });
  });

  it('does not mutate the caller-supplied input array', () => {
    // Tests the heteronyms.slice() defensive clone: without it, the function
    // would null out duplicate slots in the input that the caller still holds.
    const a = { audio_id: '1', bopomofo: 'ㄐ', pinyin: 'jiā' };
    const b = { audio_id: '1', bopomofo: 'ㄐ', pinyin: 'jiā' };
    const input = [a, b];
    const snapshot = [...input];
    dedupeHeteronyms(input);
    expect(input).toEqual(snapshot);
    expect(input[1]).toBe(b);
  });
});
