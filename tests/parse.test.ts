import { describe, expect, it } from 'vitest';
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
});
