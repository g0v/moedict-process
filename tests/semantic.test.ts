import { describe, expect, it } from 'bun:test';
import {
  UnbalancedBracesError,
  classifySentence,
  splitSentence,
} from '../src/semantic';

describe('UnbalancedBracesError', () => {
  it('attaches the offending input to the error message', () => {
    // Tests `super(\`unbalanced braces: ${input}\`)`: an empty-template
    // mutant would lose the input context that callers rely on for debugging.
    const err = new UnbalancedBracesError('開「但未關');
    expect(err.message).toContain('unbalanced braces');
    expect(err.message).toContain('開「但未關');
  });

  it('sets the error name so callers can identify it via instanceof + .name', () => {
    // Tests `this.name = 'UnbalancedBracesError'`: an empty-string mutant
    // would break Error logging that prints `${name}: ${message}` without
    // the class identifier.
    const err = new UnbalancedBracesError('x');
    expect(err.name).toBe('UnbalancedBracesError');
  });
});

describe('splitSentence', () => {
  it('splits the composite book citation example', () => {
    const source =
      '架子，放置器物的木器。木架上分不同形狀的許多層小格，格內可放入各種器皿、用具。儒林外史˙第二十三回：「又走進去，大殿上{[8e50]}子倒的七橫八豎。」紅樓夢˙第八十五回：「麝月便走去在裡間屋裡{[8e50]}子上頭拿了來。」亦作「格子」、「{[8e50]}子」。';
    const parts = splitSentence(source);
    expect(parts.map((p) => Array.from(p).length)).toEqual([11, 28, 37, 37, 19]);
  });

  it('splits the see-entry doctest sample', () => {
    expect(
      splitSentence('栝樓的別名。見「栝樓」條。').map((p) => Array.from(p).length),
    ).toEqual([6, 7]);
  });

  it('keeps a list of examples as one sentence when separated by 、', () => {
    expect(
      splitSentence('如：「一則新聞」、「一則廣告」。').map((p) => Array.from(p).length),
    ).toEqual([16]);
  });

  it('respects 『』 brace nesting', () => {
    const source = '紅樓夢˙第五十七回：「紫鵑停了半晌，自言自語的說道：『一動不如一靜，我們這裡就算好人家。』」';
    expect(splitSentence(source)).toHaveLength(1);
  });

  it('does not split inside 「」 quotes even when 。 appears', () => {
    const source = '一部：「看這于家死的實在可慘。又平白的受了。」尾部。';
    const parts = splitSentence(source);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('一部：「看這于家死的實在可慘。又平白的受了。」');
  });

  it('does not split when next char is 、 or 。', () => {
    expect(splitSentence('甲。、乙。')).toEqual(['甲。、乙。']);
  });

  it('does not split before 句下', () => {
    expect(splitSentence('甲。句下乙。')).toEqual(['甲。句下乙。']);
  });

  it('returns trailing fragment without terminator', () => {
    expect(splitSentence('第一句。尾巴沒句點')).toEqual(['第一句。', '尾巴沒句點']);
  });

  it('throws UnbalancedBracesError when braces do not close', () => {
    expect(() => splitSentence('開「但未關。')).toThrow(UnbalancedBracesError);
  });

  it('returns an empty array for empty input', () => {
    expect(splitSentence('')).toEqual([]);
  });

  it('detects end-of-sentence on `:「..」` boundary even when the quote contains whitespace', () => {
    // Tests `endsWithColonQuote = /：「[\s\S]*」$/.test(current)`: with the
    // class mutated to `[\S\S]` (= `[\S]`), whitespace inside the quote
    // breaks the match, so the quote isn't recognized as an end-marker and
    // subsequent text gets glued into one over-long sentence.
    expect(splitSentence('前。中：「has space」尾。')).toEqual([
      '前。',
      '中：「has space」',
      '尾。',
    ]);
  });
});

describe('classifySentence', () => {
  it.each([
    ['數量詞：(1) 物一組。', 0],
    ['(2) 物成雙。', 0],
    ['比喻多一事不如少一事，勸人行事謹慎小心，以靜制動。', 0],
    ['九牛二虎之力比喻極大的力量。', 0],
    ['放在二疊字動詞之間，表行為是不費力或嘗試性的。', 0],
  ] as const)('returns 0 (normal) for %p', (sentence, expected) => {
    expect(classifySentence(sentence)).toBe(expected);
  });

  it.each([
    ['如：「雙手動一動」、「問一問」、「隨便說一說」。', 1],
    ['如：「簡單句」。', 1],
    ['如：「無句點例句結尾」', 1],
  ] as const)('returns 1 (example) for %p', (sentence, expected) => {
    expect(classifySentence(sentence)).toBe(expected);
  });

  it.each([
    ['水滸傳˙第三回：「史進便入茶坊裡來，揀一副座位坐了。」', 2],
    ['警世通言˙卷二十二˙宋小官團圓破氈笠：「況且下水順風。」', 2],
    ['元˙鄭光祖˙三戰呂布˙楔子：「兄弟，你不知他靴尖點地。」', 2],
    ['說文解字：「一也。」', 2],
  ] as const)('returns 2 (quote) for %p', (sentence, expected) => {
    expect(classifySentence(sentence)).toBe(expected);
  });

  it('returns 2 (not-sure but best guess) when source has no comma and no dot separator', () => {
    expect(classifySentence('未知來源：「隨便一句」')).toBe(2);
  });

  it('returns 0 when the source side contains 、but no dot (comma found inside the source)', () => {
    expect(classifySentence('某書，第三回：「內容。」')).toBe(0);
  });

  it.each([
    ['亦作「格子」、「{[8e50]}子」。', 3],
    ['見「糖{[8ecf]}類」、「核{[8ecf]}」、「核{[8ecf]}酸」等條。', 3],
    ['俗稱為「沙丁魚」。', 3],
    ['俗稱為「沙丁魚。」', 3],
    ['也稱為「捺」、「磔」。', 3],
    ['「栝樓」的古字。', 3],
    ['「栝樓」的異體字（2）', 3],
  ] as const)('returns 3 (link) for %p', (sentence, expected) => {
    expect(classifySentence(sentence)).toBe(expected);
  });

  it('known-wrong doctest case stays classified as 0 (documenting the known defect)', () => {
    expect(
      classifySentence('二虎指春秋魯國的大力士管莊子刺二虎的故事，典出戰國策˙秦策二。'),
    ).toBe(0);
  });

  describe('regex anchors require start-of-sentence (^ kills mid-text false positives)', () => {
    // Each LINK_*/EXAMPLE_*/QUOTE pattern is anchored at `^`. Removing it
    // would make any sentence with the pattern fragment mid-text classify
    // as the wrong category. Test inputs prepend prose to the canonical
    // pattern and assert the prose-only classification (0).
    it('LINK_CITATION mid-text does not classify as link', () => {
      expect(classifySentence('前文亦作「別名」。')).toBe(0);
    });
    it('LINK_SEE mid-text does not classify as link', () => {
      expect(classifySentence('前文見「Y」條。')).toBe(0);
    });
    it('LINK_ARCHAIC mid-text does not classify as link', () => {
      expect(classifySentence('前文「X」的古字。')).toBe(0);
    });
    it('LINK_VARIANT mid-text does not classify as link', () => {
      expect(classifySentence('前文「X」的異體字（2）')).toBe(0);
    });
    it('EXAMPLE_WITH_PERIOD mid-text does not classify as example', () => {
      expect(classifySentence('前文如：「示例」。')).toBe(0);
    });
    it('EXAMPLE_WITHOUT_PERIOD mid-text does not classify as example', () => {
      // Trailing 'extra' breaks QUOTE_SOURCE_COLON_QUOTE's `$` anchor so it
      // doesn't pre-empt this case as a quote (returning 2).
      expect(classifySentence('前文如：「示例」extra')).toBe(0);
    });
    it('QUOTE_SOURCE_COLON_QUOTE leading char that `.` cannot match does not classify as quote', () => {
      // Leading \n: `.` (no `s` flag) doesn't match \n, so original `^(.+?)`
      // can't start matching. Without `^`, the regex engine retries from
      // pos 1 onward and false-positives.
      expect(classifySentence('\n某書：「內文」')).toBe(0);
    });
  });

  it('LINK_VARIANT requires multi-digit index in （\\d+）', () => {
    // Tests `\d+` (vs `\d`): `異體字（10）` (multi-digit) must still match.
    // A single-digit mutant fails on '10' because after '1' the engine
    // expects `）` but finds '0'.
    expect(classifySentence('「X」的異體字（10）')).toBe(3);
  });

  it('LINK_SEE matches the no-等 form (見「X」條。)', () => {
    // Tests `等?` (vs `等`): the optional 等 mutated to required would
    // reject the bare 見「X」條。 form.
    expect(classifySentence('見「X」條。')).toBe(3);
  });

  it('QUOTE_SOURCE_COLON_QUOTE requires the closing 」 at end-of-string', () => {
    // Tests `$` anchor on QUOTE_SOURCE_COLON_QUOTE: with `$` removed, any
    // trailing text after the closing 」 would still match and classify
    // as quote (returning 2 instead of 0).
    expect(classifySentence('某書：「內文」extra')).toBe(0);
  });
});
