import { describe, expect, it } from 'vitest';
import { dedupeHeteronyms } from '../src/dedup';
import type { Heteronym } from '../src/types';

describe('dedupeHeteronyms', () => {
  it('fixes the 花枝招展 duplicate-heteronym pattern (ASCII space vs U+3000)', () => {
    const ascii: Heteronym = {
      bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ',
      pinyin: 'huā zhī zhāo zhǎn',
      definitions: [
        { def: '形容花木枝葉迎風搖擺，婀娜多姿的樣子。' },
        { def: '比喻人打扮豔麗、引人注目的樣子。' },
      ],
    };
    const fullwidth: Heteronym = {
      bopomofo: 'ㄏㄨㄚ　ㄓ　ㄓㄠ　ㄓㄢˇ',
      pinyin: 'huā zhī zhāo zhǎn',
      definitions: [
        { def: '形容花木枝葉迎風搖擺，婀娜多姿的樣子。' },
        { def: '比喻女子打扮豔麗、引人注目的樣子。多用於女子。也作「花枝招颭」。' },
      ],
    };
    const result = dedupeHeteronyms([ascii, fullwidth]);
    expect(result).toHaveLength(1);
    expect(result[0]!.definitions![1]!.def).toContain('花枝招颭');
  });

  it('removes byte-identical duplicate heteronyms', () => {
    const h: Heteronym = { bopomofo: 'ㄧㄠˋ', pinyin: 'yào', definitions: [{ def: '光輝、光彩。' }] };
    expect(dedupeHeteronyms([h, { ...h, definitions: [{ ...h.definitions![0]! }] }])).toHaveLength(1);
  });

  it('preserves distinct pronunciations even when audio_id matches upstream', () => {
    const input: Heteronym[] = [
      { bopomofo: 'ㄌㄠˇ ˙ㄍㄨㄥ', pinyin: 'lǎo gong' },
      { bopomofo: 'ㄌㄠˇ ㄍㄨㄥ', pinyin: 'lǎo gōng' },
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(2);
  });

  it('preserves order of unique heteronyms', () => {
    const input: Heteronym[] = [
      { bopomofo: 'ㄧㄠˋ', pinyin: 'yào' },
      { bopomofo: 'ㄩㄝˋ', pinyin: 'yuè' },
      { bopomofo: 'ㄧㄠˋ', pinyin: 'yào' },
      { bopomofo: 'ㄏㄨㄚ', pinyin: 'huā' },
    ];
    expect(dedupeHeteronyms(input).map((h) => h.pinyin)).toEqual(['yào', 'yuè', 'huā']);
  });

  it('never drops heteronyms that have no bopomofo and no pinyin', () => {
    const input: Heteronym[] = [
      { definitions: [{ def: 'A' }] },
      { definitions: [{ def: 'B' }] },
    ];
    expect(dedupeHeteronyms(input)).toHaveLength(2);
  });

  it('keeps the richer duplicate when sizes differ (rich is second)', () => {
    const lean: Heteronym = { bopomofo: 'ㄚ', pinyin: 'a', definitions: [{ def: '短。' }] };
    const rich: Heteronym = {
      bopomofo: 'ㄚ',
      pinyin: 'a',
      definitions: [{ def: '短。', example: ['例子'], quote: ['典故'] }],
    };
    expect(dedupeHeteronyms([lean, rich])[0]).toEqual(rich);
  });

  it('keeps the richer duplicate when rich is first and lean is second', () => {
    const rich: Heteronym = {
      bopomofo: 'ㄚ',
      pinyin: 'a',
      definitions: [{ def: '完整。', example: ['例1', '例2'] }],
    };
    const lean: Heteronym = { bopomofo: 'ㄚ', pinyin: 'a', definitions: [{ def: '短。' }] };
    const result = dedupeHeteronyms([rich, lean]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(rich);
  });

  it('dedupes heteronyms with only pinyin set (no bopomofo)', () => {
    const a: Heteronym = { pinyin: 'jiǎ', definitions: [{ def: 'A' }] };
    const b: Heteronym = { pinyin: 'jiǎ', definitions: [{ def: 'A' }] };
    expect(dedupeHeteronyms([a, b])).toHaveLength(1);
  });

  it('dedupes heteronyms with only bopomofo set (no pinyin)', () => {
    const a: Heteronym = { bopomofo: 'ㄐㄧㄚˇ' };
    const b: Heteronym = { bopomofo: 'ㄐㄧㄚˇ' };
    expect(dedupeHeteronyms([a, b])).toHaveLength(1);
  });

  it('does not dedupe when only whitespace-stripping would match but both identity fields are empty', () => {
    const a: Heteronym = { bopomofo: '   ', pinyin: '', definitions: [{ def: 'A' }] };
    const b: Heteronym = { bopomofo: '', pinyin: '', definitions: [{ def: 'B' }] };
    expect(dedupeHeteronyms([a, b])).toHaveLength(2);
  });
});
