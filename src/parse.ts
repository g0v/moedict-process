import { dedupeHeteronyms } from './dedup';
import { normalizeText } from './normalize';
import {
  UnbalancedBracesError,
  classifySentence,
  splitSentence,
} from './semantic';
import type {
  BasicEntry,
  ColumnMap,
  Definition,
  DictionaryEntry,
  Heteronym,
  SourceCell,
} from './types';

const BOPOMOFO_CHARS = new Set(
  Array.from('˙ˇˊˋㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'),
);

function containsBopomofo(input: string): boolean {
  for (const ch of input) {
    if (BOPOMOFO_CHARS.has(ch)) return true;
  }
  return false;
}

/**
 * Split a definition's raw text into {def, example?, quote?, link?}.
 * Trailing example/quote/link sentences are peeled off; a complex interleaved
 * definition (pattern "0[^0]+0") is skipped to preserve source fidelity.
 */
export function parseDef(text: string, definition: Definition): Definition {
  try {
    const sentences = splitSentence(text);
    const classifies = sentences.map(classifySentence);
    const joined = classifies.join('');
    if (/0[^0]+0/.test(joined)) {
      return definition;
    }

    while (classifies.length > 0 && classifies[classifies.length - 1] !== 0) {
      const cls = classifies.pop()!;
      const snt = sentences.pop()!;
      if (cls === 1) {
        definition.example = definition.example ?? [];
        definition.example.unshift(snt);
      } else if (cls === 2) {
        definition.quote = definition.quote ?? [];
        definition.quote.unshift(snt);
      } else if (cls === 3) {
        definition.link = definition.link ?? [];
        definition.link.unshift(snt);
      }
    }

    definition.def = sentences.join('');
    return definition;
  } catch (err) {
    if (err instanceof UnbalancedBracesError) return definition;
    throw err;
  }
}

const TYPE_TAG_AFTER_PHONETIC = /(\(.\))\[([^倫])\]([^\x08\r\n])/gu;
const TYPE_TAG_AFTER_CHAR = /([^\x08\n\r])\[([^倫])\]/gu;
const TYPE_TAG_BEFORE_CHAR = /\[([^倫])\]([^\x08\r\n])/gu;
const TYPE_TAG_ONLY = /^\[(.*)\]$/u;
const LEADING_NUMBERED = /^\d+\.(.*)/u;

/** Break a raw multiline definitions string into structured Definition[]. */
export function parseDefs(detailRaw: string): Definition[] {
  let detail = detailRaw;
  detail = detail.replace(TYPE_TAG_AFTER_PHONETIC, '[$2]\n$1$3');
  detail = detail.replace(TYPE_TAG_AFTER_CHAR, '$1\n[$2]');
  detail = detail.replace(TYPE_TAG_BEFORE_CHAR, '[$1]\n$2');

  const lines = detail.split(/\r?\n/);
  const definitions: Definition[] = [];
  let pos = '';
  for (const raw of lines) {
    const item = raw.trim();
    if (!item) continue;

    const typeMatch = TYPE_TAG_ONLY.exec(item);
    if (typeMatch && typeMatch[1]) {
      pos = typeMatch[1];
      continue;
    }

    const definition: Definition = { def: item };
    if (pos) definition.type = pos;
    parseDef(definition.def, definition);
    definitions.push(definition);
  }

  return definitions;
}

const SYNONYM_PREFIX = /^((?:\d+\.)*)(.*)$/u;
const NUMBERED_INDEX = /(\d+)\./gu;

/**
 * Attach synonyms/antonyms text onto the matching definition(s).
 *
 * Supports two formats:
 *   1. Flat list  — "A、B、C"           → attaches to defs[0]
 *   2. Keyed list — "1.A、B  2.C、D"    → attaches to the definition whose
 *                                         def starts with the matching number
 */
export function associateToDefs(key: 'synonyms' | 'antonyms', text: string, defs: Definition[]): void {
  if (text && defs.length === 0) {
    defs.push({ def: '' });
  }
  if (!text) return;

  const match = SYNONYM_PREFIX.exec(text);
  if (!match) return;

  const value = (match[2] ?? '').replace(/、/g, ',').trim();

  if (!match[1]) {
    defs[0]![key] = value;
    return;
  }

  const indexMatches = Array.from(match[1].matchAll(NUMBERED_INDEX));
  for (const indexMatch of indexMatches) {
    const idx = Number(indexMatch[1]);
    for (const def of defs) {
      const defIndexMatch = /^(\d+)\./u.exec(def.def);
      if (!defIndexMatch) continue;
      if (Number(defIndexMatch[1]) !== idx) continue;
      def[key] = def[key] ? `${def[key]},${value}` : value;
    }
  }
}

const LEGACY_COLUMNS: ColumnMap = {
  title: 2,
  term_type: 0,
  radical: 3,
  stroke_count: 5,
  non_radical_stroke_count: 4,
  bopomofo: 6,
  pinyin: 7,
  synonyms: 8,
  antonyms: 9,
  definitions: 10,
  notes: 11,
};

const MODERN_COLUMNS: ColumnMap = {
  title: 0,
  term_type: 2,
  radical: 4,
  stroke_count: 5,
  non_radical_stroke_count: 6,
  bopomofo: 8,
  pinyin: 11,
  synonyms: 13,
  antonyms: 14,
  definitions: 15,
  notes: 16,
};

export function pickColumnMap(rowLength: number): ColumnMap {
  return rowLength >= 18 ? MODERN_COLUMNS : LEGACY_COLUMNS;
}

function cellText(cells: readonly SourceCell[], idx: number): string {
  const cell = cells[idx];
  if (!cell) return '';
  return normalizeText(cell.value);
}

function cellInt(cells: readonly SourceCell[], idx: number, fallback = 0): number {
  const cell = cells[idx];
  if (!cell) return fallback;
  const { value } = cell;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.trunc(parsed);
  return fallback;
}

/** Parse one source-row into {basic, heteronym}. */
export function parseHeteronym(cells: readonly SourceCell[]): { basic: BasicEntry; heteronym: Heteronym } {
  const col = pickColumnMap(cells.length);

  const heteronym: Heteronym = {
    bopomofo: cellText(cells, col.bopomofo),
    pinyin: cellText(cells, col.pinyin),
    definitions: parseDefs(cellText(cells, col.definitions)),
  };

  associateToDefs('synonyms', normalizeText(cellText(cells, col.synonyms)), heteronym.definitions!);
  associateToDefs('antonyms', normalizeText(cellText(cells, col.antonyms)), heteronym.definitions!);

  const notesCell = cells[col.notes];
  if (notesCell && notesCell.ctype !== 0) {
    heteronym.definitions!.push(...parseDefs(cellText(cells, col.notes)));
  }

  for (const def of heteronym.definitions!) {
    def.def = def.def.replace(LEADING_NUMBERED, '$1');
  }

  const termType = cellInt(cells, col.term_type);
  const basic: BasicEntry = {
    title: cellText(cells, col.title),
  };

  if (termType !== 2) {
    basic.stroke_count = cellInt(cells, col.stroke_count);
    basic.non_radical_stroke_count = cellInt(cells, col.non_radical_stroke_count);
    basic.radical = cellText(cells, col.radical);
  }

  const trimmed: Heteronym = {};
  if (heteronym.bopomofo) trimmed.bopomofo = heteronym.bopomofo;
  if (heteronym.pinyin) trimmed.pinyin = heteronym.pinyin;
  if (heteronym.definitions && heteronym.definitions.length > 0) {
    trimmed.definitions = heteronym.definitions;
  }

  return { basic, heteronym: trimmed };
}

const PHONETIC_INDEX = /^\([一二三四五六七八九十]\)/u;
const PHONETIC_INDEX_DEF = /^(\([一二三四五六七八九十]\))(.+)/u;

/**
 * Dedupe heteronyms and strip source-only phonetic-index markers like (一)、(二).
 *
 * Dedup fix — see dedupeHeteronyms; resolves the 花枝招展 class of bugs.
 */
export function postProcess(entries: Map<string, DictionaryEntry>): void {
  for (const entry of entries.values()) {
    entry.heteronyms = dedupeHeteronyms(entry.heteronyms);
  }

  for (const entry of entries.values()) {
    const { heteronyms } = entry;
    heteronyms.sort((a, b) => (a.bopomofo ?? '').localeCompare(b.bopomofo ?? ''));

    for (const heteronym of heteronyms) {
      if (!heteronym.bopomofo) continue;
      for (const key of ['bopomofo', 'pinyin'] as const) {
        const value = heteronym[key];
        if (typeof value === 'string' && PHONETIC_INDEX.test(value)) {
          heteronym[key] = value.replace(PHONETIC_INDEX, '');
        }
      }
    }

    for (const heteronym of heteronyms) {
      const defs = heteronym.definitions;
      if (!defs) continue;
      const kept = defs.filter((def) => {
        const match = PHONETIC_INDEX_DEF.exec(def.def);
        if (match && containsBopomofo(match[2] ?? '')) return false;
        return true;
      });
      if (kept.length !== defs.length) {
        heteronym.definitions = kept;
      }
    }
  }
}

/** Merge a row's {basic, heteronym} into the in-progress entry map. */
export function mergeRowIntoEntries(
  entries: Map<string, DictionaryEntry>,
  basic: BasicEntry,
  heteronym: Heteronym,
): void {
  const existing = entries.get(basic.title);
  if (!existing) {
    entries.set(basic.title, { ...basic, heteronyms: [heteronym] });
    return;
  }
  existing.heteronyms.push(heteronym);
}
