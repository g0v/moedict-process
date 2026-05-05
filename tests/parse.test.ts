import { describe, expect, it, vi } from 'vitest';
import {
  associateToDefs,
  mergeRowIntoEntries,
  parseDef,
  parseDefs,
  parseHeteronym,
  pickColumnMap,
  postProcess,
} from '../src/parse';
import type { Definition, DictionaryEntry, SourceCell } from '../src/types';

function cell(value: unknown, ctype = 1): SourceCell {
  return { value, ctype };
}

function empty(): SourceCell {
  return { value: '', ctype: 0 };
}

describe('parseDef', () => {
  it('peels the trailing example sentence off a definition', () => {
    const def: Definition = { def: '' };
    parseDef('數量詞。如：「一則新聞」、「一則廣告」。', def);
    expect(def.def).toBe('數量詞。');
    expect(def.example).toEqual(['如：「一則新聞」、「一則廣告」。']);
  });

  it('peels trailing quote sentence', () => {
    const def: Definition = { def: '' };
    parseDef('某義。水滸傳˙第三回：「史進便入茶坊裡來。」', def);
    expect(def.def).toBe('某義。');
    expect(def.quote).toEqual(['水滸傳˙第三回：「史進便入茶坊裡來。」']);
  });

  it('peels trailing link sentence', () => {
    const def: Definition = { def: '' };
    parseDef('某義。亦作「別名」。', def);
    expect(def.def).toBe('某義。');
    expect(def.link).toEqual(['亦作「別名」。']);
  });

  it('keeps the whole text when classifications are interleaved (0...0 pattern)', () => {
    const def: Definition = { def: '' };
    const input = '某義。如：「一則新聞」。另一義。';
    parseDef(input, def);
    expect(def.def).toBe('');
    expect(def.example).toBeUndefined();
  });

  it('recovers gracefully from unbalanced braces', () => {
    const def: Definition = { def: '' };
    parseDef('開「但不關', def);
    expect(def.def).toBe('');
  });

  it('rethrows non-UnbalancedBraces errors raised by splitSentence', async () => {
    // Tests the `if (err instanceof UnbalancedBracesError)` guard: if mutated
    // to `if (true)`, ANY error would be silently swallowed instead of just
    // the expected one.
    const semantic = await import('../src/semantic');
    const spy = vi.spyOn(semantic, 'splitSentence').mockImplementation(() => {
      throw new TypeError('unexpected');
    });
    try {
      const def: Definition = { def: '' };
      expect(() => parseDef('anything', def)).toThrow(TypeError);
    } finally {
      spy.mockRestore();
    }
  });

  it('terminates without infinite loop when given empty input', () => {
    // Tests the `classifies.length > 0` guard: with `>= 0`, the empty-array
    // branch enters the loop, classifies[-1] is undefined, undefined !== 0
    // is true, and we'd spin forever (caught only by Stryker timeout).
    const def: Definition = { def: '' };
    parseDef('', def);
    expect(def.def).toBe('');
  });

  it('preserves def text intact when all sentences classify as type 0', () => {
    // Tests `classifies.join('')`: with a sentinel like "Stryker was here!",
    // the joined string would always contain a 0…0 pattern via interpolation,
    // wrongly triggering the early-return that preserves the original def.
    const def: Definition = { def: '' };
    parseDef('某義。再義。', def);
    expect(def.def).toBe('某義。再義。');
    expect(def.example).toBeUndefined();
  });

  it('does not classify out-of-range sentences as link (cls === 3 specificity)', async () => {
    // Tests `else if (cls === 3)`: a `true` mutant would treat ANY non-0/1/2
    // class as a link. classifySentence's runtime return is always 0|1|2|3,
    // so we mock it to return a sentinel and verify the branch is gated.
    const semantic = await import('../src/semantic');
    const spy = vi.spyOn(semantic, 'classifySentence').mockReturnValue(5 as never);
    try {
      const def: Definition = { def: '' };
      parseDef('某。', def);
      expect(def.link).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps text intact for 0,1,1,0 interleaved patterns (multiple non-zero classes)', () => {
    // Tests `0[^0]+0` (vs `0[^0]0`): the `+` quantifier matters when there
    // are 2+ consecutive non-zero classifications. Two examples sandwiched
    // between two definitions should still trigger early-return.
    const def: Definition = { def: '' };
    parseDef('某義。如：「A」。如：「B」。又義。', def);
    expect(def.def).toBe('');
  });
});

describe('parseDefs', () => {
  it('extracts [POS] tags as type and one line per definition', () => {
    const input = '[名]一曰名詞。[動]二曰動詞。';
    const defs = parseDefs(input);
    expect(defs).toEqual([
      { def: '一曰名詞。', type: '名' },
      { def: '二曰動詞。', type: '動' },
    ]);
  });

  it('splits [POS] markers that sit between a (phonetic) marker and subsequent text', () => {
    const input = '(一)[名]首義。';
    const defs = parseDefs(input);
    expect(defs).toEqual([{ def: '(一)首義。', type: '名' }]);
  });

  it('returns an empty list for empty input', () => {
    expect(parseDefs('')).toEqual([]);
  });

  it('preserves U+FEFF (BOM) in def text — parity with Python str.strip()', () => {
    // JS String.prototype.trim() strips U+FEFF but Python str.strip() does not.
    // We must not strip BOMs inside definitions or we change classification downstream.
    const defs = parseDefs('﻿某義。﻿');
    expect(defs[0]!.def).toBe('﻿某義。﻿');
  });

  it('strips ordinary whitespace (space, tab, newline) around a line', () => {
    const defs = parseDefs('  \t某義。\n');
    expect(defs[0]!.def).toBe('某義。');
  });

  it('strips Python-equivalent whitespace classes (U+3000 ideographic, U+00A0 NBSP)', () => {
    // Python's str.strip() treats these as whitespace; JS's String.prototype.trim()
    // also handles U+3000 but the project's PYTHON_WS_CLASS pins the explicit set
    // for parity. Mutating the class to "" produces an invalid /^+/ regex and
    // breaks all stripping; mutating the regex template to '' would treat all
    // strings as un-stripped.
    expect(parseDefs('　某義。　')[0]!.def).toBe('某義。');
    expect(parseDefs(' 某義。 ')[0]!.def).toBe('某義。');
  });

  it('strips trailing whitespace independently of leading whitespace', () => {
    // Tests the trailing-strip replacement specifically: with mutant
    // `replace(PYTHON_STRIP_TRAILING, "Stryker was here!")`, the trailing
    // whitespace would be replaced by the sentinel rather than removed.
    expect(parseDefs('某義。   ')[0]!.def).toBe('某義。');
  });

  it('extracts a multi-character [POS] tag (more than one char between brackets)', () => {
    // Tests `(.*)` vs `(.)` capture in TYPE_TAG_ONLY: a 2+-char POS tag like
    // [名動] would not be recognized under the single-char mutant.
    const defs = parseDefs('[名動]\n主義。');
    expect(defs).toEqual([{ def: '主義。', type: '名動' }]);
  });

  it('does not treat lines with mid-line [...] patterns as type-only markers', () => {
    // The 倫 exclusion in pre-processing leaves '[倫]' un-split-out; the line
    // arrives at TYPE_TAG_ONLY as 'abc[倫]'. Without the leading `^`, the
    // mutant regex matches the trailing [倫] and misclassifies the whole
    // line as a type marker, dropping the definition.
    const defs = parseDefs('abc[倫]');
    expect(defs).toEqual([{ def: 'abc[倫]' }]);
  });

  it('does not treat lines with extra content after [POS] as type-only markers', () => {
    // Tests the trailing `$` anchor in TYPE_TAG_ONLY: '[倫]extra' must not be
    // matched as a type tag (the 倫 exclusion blocks pre-processing from
    // splitting it). Without `$`, the mutant would match `[倫]` at the start
    // and lose the rest.
    const defs = parseDefs('[倫]extra');
    expect(defs).toEqual([{ def: '[倫]extra' }]);
  });

  it('leaves type undefined when a definition has no preceding [POS] marker', () => {
    // Tests `let pos = ''` (initial value) and `if (pos)` (truthy guard): a
    // non-empty initial value, or an `if (true)` mutation, would attach a
    // bogus type to definitions that came before any [POS] tag.
    const defs = parseDefs('主義。');
    expect(defs).toEqual([{ def: '主義。' }]);
    expect(defs[0]!.type).toBeUndefined();
  });
});

describe('associateToDefs', () => {
  it('attaches flat synonyms to the first definition', () => {
    const defs: Definition[] = [{ def: '主義。' }, { def: '次義。' }];
    associateToDefs('synonyms', 'A、B、C', defs);
    expect(defs[0]!.synonyms).toBe('A,B,C');
    expect(defs[1]!.synonyms).toBeUndefined();
  });

  it('attaches keyed synonyms to matching numbered definition', () => {
    const defs: Definition[] = [{ def: '1.主義。' }, { def: '2.次義。' }];
    associateToDefs('synonyms', '2.B、C', defs);
    expect(defs[0]!.synonyms).toBeUndefined();
    expect(defs[1]!.synonyms).toBe('B,C');
  });

  it('creates a placeholder definition when text present but defs empty', () => {
    const defs: Definition[] = [];
    associateToDefs('synonyms', 'X、Y', defs);
    expect(defs).toEqual([{ def: '', synonyms: 'X,Y' }]);
  });

  it('no-ops on empty text', () => {
    const defs: Definition[] = [{ def: 'a' }];
    associateToDefs('synonyms', '', defs);
    expect(defs[0]!.synonyms).toBeUndefined();
  });

  it('does not push a placeholder when defs already has entries', () => {
    // Tests `defs.length === 0` guard: with `true`, a placeholder {def:''}
    // would be appended even when defs already has real entries, polluting
    // the entry's definition list.
    const defs: Definition[] = [{ def: 'A' }];
    associateToDefs('synonyms', 'X、Y', defs);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.synonyms).toBe('X,Y');
  });

  it('trims whitespace from the synonyms value', () => {
    // Tests `.replace(/、/g, ',').trim()`: removing `.trim()` would leave
    // surrounding whitespace from the source spreadsheet on the value.
    const defs: Definition[] = [{ def: 'A' }];
    associateToDefs('synonyms', '  X、Y  ', defs);
    expect(defs[0]!.synonyms).toBe('X,Y');
  });

  it('attaches keyed synonyms to multi-digit numbered definitions (10+)', () => {
    // Tests `\d+` (vs `\d`) in SYNONYM_PREFIX (line 110), NUMBERED_INDEX
    // (line 111), and the per-def regex (line 141): single-digit-only
    // mutants would fail to match '12.' / '12.A' and either lose the prefix
    // or misalign the numbered index.
    const defs: Definition[] = [{ def: '1.主義' }, { def: '12.次義' }];
    associateToDefs('synonyms', '12.B、C', defs);
    expect(defs[0]!.synonyms).toBeUndefined();
    expect(defs[1]!.synonyms).toBe('B,C');
  });

  it('does not match numbered indices in the middle of def text', () => {
    // Tests the `^` anchor on the per-def regex /^(\d+)\./: without it, any
    // mid-text `N.` would falsely match and attach synonyms to a definition
    // that doesn't start with a numbered index.
    const defs: Definition[] = [{ def: '主義1.內文' }];
    associateToDefs('synonyms', '1.A', defs);
    expect(defs[0]!.synonyms).toBeUndefined();
  });

  it('appends repeated synonym values when the same numbered index appears twice', () => {
    // Tests the truthy template-literal branch
    // `def[key] ? \`${def[key]},${value}\` : value`: an empty-template
    // mutant would clobber the first assignment's value with "".
    // Input '1.1.X' has match[1]='1.1.' (NUMBERED_INDEX matches '1.' twice,
    // both yielding idx=1) and match[2]='X', so defs[0] gets assigned twice.
    const defs: Definition[] = [{ def: '1.主義' }];
    associateToDefs('synonyms', '1.1.X', defs);
    expect(defs[0]!.synonyms).toBe('X,X');
  });
});

describe('pickColumnMap', () => {
  it('returns legacy (14-col) map by default', () => {
    expect(pickColumnMap(14).title).toBe(2);
  });

  it('returns modern (18-col) map when row length >= 18', () => {
    expect(pickColumnMap(18).title).toBe(0);
  });
});

describe('parseHeteronym', () => {
  function modernRow(overrides: Partial<Record<keyof import('../src/types').ColumnMap, unknown>> = {}): SourceCell[] {
    const row: SourceCell[] = new Array(20).fill(null).map(() => empty());
    row[0] = cell('花枝招展'); // title
    row[2] = cell(2); // term_type (複詞 — strips radical/strokes)
    row[4] = cell(''); // radical
    row[5] = cell(0); // stroke_count
    row[6] = cell(0); // non_radical_stroke_count
    row[8] = cell('ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ'); // bopomofo
    row[11] = cell('huā zhī zhāo zhǎn'); // pinyin
    row[13] = cell(''); // synonyms
    row[14] = cell(''); // antonyms
    row[15] = cell('形容花木枝葉迎風搖擺。'); // definitions
    row[16] = empty(); // notes (empty)
    for (const [key, value] of Object.entries(overrides)) {
      const map = { title: 0, term_type: 2, radical: 4, stroke_count: 5, non_radical_stroke_count: 6, bopomofo: 8, pinyin: 11, synonyms: 13, antonyms: 14, definitions: 15, notes: 16 };
      const idx = map[key as keyof typeof map];
      row[idx] = cell(value);
    }
    return row;
  }

  it('parses the 花枝招展 happy-path row', () => {
    const row = modernRow();
    const { basic, heteronym } = parseHeteronym(row);
    expect(basic.title).toBe('花枝招展');
    expect(basic.radical).toBeUndefined(); // term_type=2 (compound) strips these
    expect(basic.stroke_count).toBeUndefined();
    expect(heteronym.bopomofo).toBe('ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ');
    // Tests `if (heteronym.pinyin)` truthy-guard at trim time: a `false`
    // mutant would drop pinyin from the trimmed heteronym entirely.
    expect(heteronym.pinyin).toBe('huā zhī zhāo zhǎn');
    expect(heteronym.definitions).toHaveLength(1);
  });

  it('retains radical and strokes for single-char rows (term_type !== 2)', () => {
    const row = modernRow({ term_type: 1, radical: '木', stroke_count: 8, non_radical_stroke_count: 4 });
    const { basic } = parseHeteronym(row);
    expect(basic.radical).toBe('木');
    expect(basic.stroke_count).toBe(8);
    expect(basic.non_radical_stroke_count).toBe(4);
  });

  it('appends notes block to the definitions when the notes cell is non-empty', () => {
    const row = modernRow({ definitions: '[名]主義。', notes: '[動]附義。' });
    row[16] = { value: '[動]附義。', ctype: 1 };
    const { heteronym } = parseHeteronym(row);
    expect(heteronym.definitions).toHaveLength(2);
    expect(heteronym.definitions![1]!.type).toBe('動');
  });

  it('drops empty bopomofo/pinyin/definitions from heteronym', () => {
    const row = modernRow({ bopomofo: '', pinyin: '', definitions: '' });
    const { heteronym } = parseHeteronym(row);
    expect(heteronym).toEqual({});
  });

  it('returns "" (not a sentinel) for out-of-range column indices in cellText', () => {
    // Tests `if (!cell) return ''` inside cellText: a `'Stryker was here!'`
    // mutant on the fallback would leak a phantom string into bopomofo/pinyin
    // for any row that's shorter than the column map expects. We use a
    // 6-cell legacy row so columns 6+ (bopomofo, pinyin, definitions...) are
    // all out of range and exercise the missing-cell branch. With the
    // original '' fallback those fields are empty strings and the trimmed
    // heteronym drops them; with a sentinel fallback they'd be truthy and
    // surface in the result.
    const shortRow: SourceCell[] = [
      cell(1),     // 0: term_type=1 (legacy)
      empty(),     // 1
      cell('短'),  // 2: title (legacy column 2)
      empty(),     // 3
      empty(),     // 4
      empty(),     // 5
      // No more cells — bopomofo (col 6), pinyin (7), definitions (10), notes (11) are out of range.
    ];
    const { basic, heteronym } = parseHeteronym(shortRow);
    expect(basic.title).toBe('短');
    expect(heteronym).toEqual({});
  });

  it('strips multi-digit leading numbered prefix from each definition', () => {
    // Tests the LEADING_NUMBERED loop (block + replacement string $1) and
    // the regex `^\d+\.` against multi-digit and single-digit prefixes.
    // Mutants that turn `\d+` into `\d` or `\D+`, replace `$1` with `''`,
    // or remove the loop entirely would all leave the prefix in place.
    const row = modernRow({ definitions: '1.主義。\n12.次義。' });
    const { heteronym } = parseHeteronym(row);
    expect(heteronym.definitions![0]!.def).toBe('主義。');
    expect(heteronym.definitions![1]!.def).toBe('次義。');
  });

  it('returns 0 (fallback) when stroke_count cell value is non-numeric', () => {
    // Tests `Number.isFinite(parsed)` guard in cellInt: a `true` mutant would
    // return Math.trunc(NaN) = NaN, polluting the entry's stroke_count.
    const row = modernRow({ term_type: 1, radical: '木', stroke_count: 'abc', non_radical_stroke_count: 4 });
    const { basic } = parseHeteronym(row);
    expect(basic.stroke_count).toBe(0);
  });

  it('parses string-typed numeric cell values via Number coercion', () => {
    // Tests `Number.isFinite(parsed)` guard: a `false` mutant would skip the
    // coerced-number return and fall through to the fallback, dropping
    // stroke counts that the spreadsheet stored as text.
    const row = modernRow({ term_type: 1, radical: '木', stroke_count: '8', non_radical_stroke_count: '4' });
    const { basic } = parseHeteronym(row);
    expect(basic.stroke_count).toBe(8);
    expect(basic.non_radical_stroke_count).toBe(4);
  });

  it('does not strip mid-text "N." patterns from def text', () => {
    // Tests the `^` anchor on LEADING_NUMBERED: without it, any digit-dot
    // substring in the middle of a definition would be matched and mangled.
    const row = modernRow({ definitions: '主義1.詳細' });
    const { heteronym } = parseHeteronym(row);
    expect(heteronym.definitions![0]!.def).toBe('主義1.詳細');
  });

  it('skips notes when notes cell ctype === 0 even if its value is non-empty', () => {
    // Tests the `notesCell.ctype !== 0` half of the guard: with `true`, a
    // ctype-0 stub cell that happens to carry text would still be parsed
    // and appended, double-counting the data.
    const row = modernRow({ definitions: '主義。' });
    row[16] = { value: '附義。', ctype: 0 };
    const { heteronym } = parseHeteronym(row);
    expect(heteronym.definitions).toHaveLength(1);
    expect(heteronym.definitions![0]!.def).toBe('主義。');
  });
});

describe('mergeRowIntoEntries', () => {
  it('inserts a new title, accumulates multiple heteronyms', () => {
    const entries = new Map<string, DictionaryEntry>();
    mergeRowIntoEntries(entries, { title: '耀' }, { bopomofo: 'ㄧㄠˋ' });
    mergeRowIntoEntries(entries, { title: '耀' }, { bopomofo: 'ㄩㄝˋ' });
    expect(entries.get('耀')!.heteronyms).toHaveLength(2);
  });
});

describe('postProcess', () => {
  it('dedupes heteronyms across an entry (花枝招展)', () => {
    const entries = new Map<string, DictionaryEntry>();
    entries.set('花枝招展', {
      title: '花枝招展',
      heteronyms: [
        { bopomofo: 'ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ', pinyin: 'huā zhī zhāo zhǎn', definitions: [{ def: 'x' }] },
        { bopomofo: 'ㄏㄨㄚ　ㄓ　ㄓㄠ　ㄓㄢˇ', pinyin: 'huā zhī zhāo zhǎn', definitions: [{ def: 'x' }, { def: 'y' }] },
      ],
    });
    postProcess(entries);
    expect(entries.get('花枝招展')!.heteronyms).toHaveLength(1);
    expect(entries.get('花枝招展')!.heteronyms[0]!.definitions).toHaveLength(2);
  });

  it('strips (一) phonetic index markers from bopomofo, pinyin, and def', () => {
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [
        { bopomofo: '(一)ㄚ', pinyin: '(一)a', definitions: [{ def: 'kept' }, { def: '(二)又ㄚ' }] },
      ],
    });
    postProcess(entries);
    const h = entries.get('字')!.heteronyms[0]!;
    expect(h.bopomofo).toBe('ㄚ');
    expect(h.pinyin).toBe('a');
    expect(h.definitions).toEqual([{ def: 'kept' }]);
  });

  it('does not strip (一)-like markers from the middle of bopomofo or pinyin', () => {
    // Tests the `^` anchor on PHONETIC_INDEX: without it, a `(一)` sequence
    // anywhere in the field would be stripped, mangling otherwise-valid text.
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [{ bopomofo: '前(一)後', pinyin: 'pre(一)post', definitions: [{ def: 'kept' }] }],
    });
    postProcess(entries);
    const h = entries.get('字')!.heteronyms[0]!;
    expect(h.bopomofo).toBe('前(一)後');
    expect(h.pinyin).toBe('pre(一)post');
  });

  it('does not filter definitions whose (一) marker sits in the middle of the def text', () => {
    // Tests the `^` anchor on PHONETIC_INDEX_DEF: without it, any def with a
    // mid-text `(N)又bopomofo` pattern would be incorrectly classified as a
    // duplicate-phonetic entry and dropped.
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [{
        bopomofo: 'ㄚ',
        definitions: [{ def: 'kept' }, { def: '前文(二)又ㄚ' }],
      }],
    });
    postProcess(entries);
    const h = entries.get('字')!.heteronyms[0]!;
    expect(h.definitions).toHaveLength(2);
    expect(h.definitions![1]!.def).toBe('前文(二)又ㄚ');
  });

  it('does not filter (一) defs whose body contains no bopomofo (containsBopomofo guard)', () => {
    // Tests the `if (BOPOMOFO_CHARS.has(ch)) return true` inside containsBopomofo:
    // an `if (true)` mutant would always claim the body has bopomofo and filter
    // out source-only phonetic-index defs that legitimately carry plain prose.
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [{
        bopomofo: 'ㄚ',
        definitions: [{ def: 'kept' }, { def: '(三)純文字無注音' }],
      }],
    });
    postProcess(entries);
    const h = entries.get('字')!.heteronyms[0]!;
    expect(h.definitions).toHaveLength(2);
    expect(h.definitions![1]!.def).toBe('(三)純文字無注音');
  });

  it('skips PHONETIC_INDEX stripping when bopomofo is absent', () => {
    // Tests `if (!heteronym.bopomofo) continue`: with `if (false)`, a
    // pinyin-only heteronym would have legitimate '(一)' content stripped
    // even though it has no bopomofo to deduplicate against.
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [{ pinyin: '(一)x', definitions: [{ def: 'kept' }] }],
    });
    postProcess(entries);
    const h = entries.get('字')!.heteronyms[0]!;
    expect(h.pinyin).toBe('(一)x');
  });

  it('treats missing bopomofo as empty string in the sort comparator', () => {
    // Tests the two `?? ''` fallbacks inside `heteronyms.sort(...)`: a sentinel
    // like 'Stryker was here!' sorts between 'A' and 'Z' (instead of before
    // both like '' does), shifting the no-bopomofo entry's position. V8's
    // insertion sort happens to call the comparator asymmetrically, so each
    // input order only triggers one of the two `??` sites: [Z, NB, A] forces
    // NB onto the b-side (kills col 78), [A, NB, Z] forces NB onto the a-side
    // (kills col 46). Both arrangements should produce the same sorted output.
    for (const input of [['Z', 'NB', 'A'], ['A', 'NB', 'Z']] as const) {
      const entries = new Map<string, DictionaryEntry>();
      entries.set('字', {
        title: '字',
        heteronyms: input.map((x) =>
          x === 'NB'
            ? { definitions: [{ def: 'NO_BOPO' }] }
            : { bopomofo: x, definitions: [{ def: x }] },
        ),
      });
      postProcess(entries);
      expect(entries.get('字')!.heteronyms.map((h) => h.definitions![0]!.def)).toEqual([
        'NO_BOPO',
        'A',
        'Z',
      ]);
    }
  });

  it('sorts heteronyms within an entry by bopomofo (Python parity)', () => {
    // Tests `heteronyms.sort(...)` on line 255: removing the .sort() call
    // would leave heteronyms in source-input order, breaking Python parity.
    const entries = new Map<string, DictionaryEntry>();
    entries.set('字', {
      title: '字',
      heteronyms: [
        { bopomofo: 'ㄈ', definitions: [{ def: 'F' }] },
        { bopomofo: 'ㄅ', definitions: [{ def: 'B' }] },
        { bopomofo: 'ㄉ', definitions: [{ def: 'D' }] },
      ],
    });
    postProcess(entries);
    expect(entries.get('字')!.heteronyms.map((h) => h.bopomofo)).toEqual(['ㄅ', 'ㄈ', 'ㄉ']);
  });
});
