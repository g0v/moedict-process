import { codepointCount } from './codepoint';
import { canonicalJson } from './serializer';
import type { GrokEntry } from './types';

const KEY_REPLACEMENTS: [RegExp, string][] = [
  [/"bopomofo2": "[^"]*",/g, ''],
  [/"heteronyms":/g, '"h":'],
  [/"bopomofo":/g, '"b":'],
  [/"pinyin":/g, '"p":'],
  [/"definitions":/g, '"d":'],
  [/"stroke_count":/g, '"c":'],
  [/"non_radical_stroke_count":/g, '"n":'],
  [/"def":/g, '"f":'],
  [/"title":/g, '"t":'],
  [/"radical":/g, '"r":'],
  [/"example":/g, '"e":'],
  [/"link":/g, '"l":'],
  [/"synonyms":/g, '"s":'],
  [/"antonyms":/g, '"a":'],
  [/"quote":/g, '"q":'],
  [/"trs":/g, '"T":'],
  [/"alt":/g, '"A":'],
  [/"vernacular":/g, '"V":'],
  [/"combined":/g, '"C":'],
  [/"dialects":/g, '"D":'],
  [/"id":/g, '"_":'],
  [/"audio_id":/g, '"=":'],
  [/"specific_to":/g, '"S":'],
];

export function minifyKeys(json: string): string {
  let result = json;
  for (const [re, replacement] of KEY_REPLACEMENTS) {
    result = result.replace(re, replacement);
  }
  return result;
}

/**
 * IDS → assigned Unihan for glyphs that still appear in latest a/c/t/h packs.
 * Dropped when neither the IDS nor its Unihan form is present in shipped data.
 * Font coverage is render-side.
 *
 * Live in packs (2026-07-09 scan of moedict.tw data/dictionary):
 *   ⿰𧾷百 → U+2C9B0 𬦰 (Ext E; buckets/index)
 *   ⿸疒哥 → U+308FB 𰣻 (Ext G; IDS still in xref/variants, Unihan in buckets)
 *   ⿰亻恩 → U+2B8C6 𫣆 (Ext C; buckets/index)
 *   ⿰虫念 → U+2C816 𬠖 (Ext E; h/phck)
 *
 * Not in latest packs (dropped): ⿺皮卜/𱱿, ⿰金四/𳅵, other sym.txt IDS leftovers.
 */
export const IDS2UNI: Record<string, string> = {
  '⿰𧾷百': '𬦰',
  '⿸疒哥': '𰣻',
  '⿰亻恩': '𫣆',
  '⿰虫念': '𬠖',
};

export function grokJson(raw: string, idsMap: Record<string, string> = IDS2UNI): GrokEntry[] {
  const grokked = minifyKeys(raw).replace(
    /[⿰⿸⿺](?:𧾷|.)./g,
    (ids) => idsMap[ids] ?? ids,
  );
  return JSON.parse(grokked) as GrokEntry[];
}

/** Polyfill for the deprecated JS `escape` used in worker.ls. */
export function escapeLegacy(s: string): string {
  return s.replace(/[^A-Za-z0-9@*_+\-./]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code < 256) {
      return `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return `%u${code.toString(16).toUpperCase().padStart(4, '0')}`;
  });
}

/** Polyfill for the deprecated JS `unescape` used in worker.ls. */
export function unescapeLegacy(s: string): string {
  return s.replace(/%u([0-9a-fA-F]{4})|%([0-9a-fA-F]{2})/g, (_match, u, h) => {
    if (u !== undefined) {
      return String.fromCharCode(parseInt(u, 16));
    }
    return String.fromCharCode(parseInt(h, 16));
  });
}

export function expandPuaTokens(input: string): string {
  return input.replace(/\{\[([a-f0-9]{4,5})\]\}/g, (_match, hex) => {
    const code = parseInt(hex, 16);
    return String.fromCodePoint(code);
  });
}

/** True for BMP and supplementary Private Use Areas. */
export function isPuaCodePoint(cp: number): boolean {
  //@ verify
  //@ ensures \result === ((cp >= 0xE000 && cp <= 0xF8FF) || (cp >= 0xF0000 && cp <= 0xFFFFD) || (cp >= 0x100000 && cp <= 0x10FFFD))
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

/** Collect distinct PUA codepoints in `text` (order of first appearance). */
export function findPuaCodePoints(text: string): number[] {
  //@ verify
  //@ requires text.length >= 0
  //@ ensures forall(k, (0 <= k && k < \result.length) ==> ((\result[k] >= 0xE000 && \result[k] <= 0xF8FF) || (\result[k] >= 0xF0000 && \result[k] <= 0xFFFFD) || (\result[k] >= 0x100000 && \result[k] <= 0x10FFFD)))
  //@ ensures forall(i, forall(j, (0 <= i && i < j && j < \result.length) ==> \result[i] !== \result[j]))
  let seen: Set<number> = new Set<number>();
  let out: number[] = [];
  let i = 0;
  while (i < text.length) {
    //@ invariant 0 <= i && i <= text.length
    //@ invariant forall(k, (0 <= k && k < out.length) ==> ((out[k] >= 0xE000 && out[k] <= 0xF8FF) || (out[k] >= 0xF0000 && out[k] <= 0xFFFFD) || (out[k] >= 0x100000 && out[k] <= 0x10FFFD)))
    //@ invariant forall(a, forall(b, (0 <= a && a < b && b < out.length) ==> out[a] !== out[b]))
    //@ invariant forall(k, (0 <= k && k < out.length) ==> seen.has(out[k]))
    const c = text.charCodeAt(i);
    let cp = c;
    let stride = 1;
    if (0xD800 <= c && c <= 0xDBFF && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (0xDC00 <= low && low <= 0xDFFF) {
        cp = 0x10000 + (c - 0xD800) * 0x400 + (low - 0xDC00);
        stride = 2;
      }
    }
    if (isPuaCodePoint(cp) && !seen.has(cp)) {
      seen = seen.add(cp);
      out = [...out, cp];
    }
    i += stride;
  }
  return out;
}

/**
 * Fail hard if processed pack text still contains PUA.
 * Unmapped MOE/source PUA must be curated to assigned Unihan (or IDS),
 * not silently stripped — font coverage is a render-side concern.
 */
export function assertNoPua(text: string, context: string): void {
  const pua = findPuaCodePoints(text);
  if (pua.length === 0) return;
  const labels = pua.map((cp) => `U+${cp.toString(16).toUpperCase()}`);
  throw new Error(
    `PUA codepoint(s) in processed pack data (${context}): ${labels.join(', ')}`,
  );
}

export interface LenToRegexMap {
  [length: number]: RegExp;
}

export function buildLenToRegexMap(lenToRegex: Record<number, string>): LenToRegexMap {
  const map: LenToRegexMap = {};
  for (const [len, re] of Object.entries(lenToRegex)) {
    map[Number(len)] = new RegExp(re, 'g');
  }
  return map;
}

export function autolinkLine(
  idx: number,
  title: string,
  entry: GrokEntry,
  lenToRegex: LenToRegexMap,
): string {
  // Ported from worker.ls lines 23-33.
  let chunk = canonicalJson({ ...entry, t: '' }).replace(
    /.[\u20E3\u20DE\u20DF\u20DD]/g,
    (c) => escapeLegacy(c),
  );

  const lengths = Object.keys(lenToRegex).map(Number).sort((a, b) => b - a);

  // Longest-to-shortest LTM replacement inside the JSON payload.
  for (const len of lengths) {
    const re = lenToRegex[len];
    if (!re) continue;
    chunk = chunk.replace(re, (match) => escapeLegacy('`' + match + '~'));
  }

  const esc = escapeLegacy(title);
  const titleCodes = codepointCount(title);

  let linkedTitle = title;
  for (const len of lengths) {
    if (len >= titleCodes) continue;
    const re = lenToRegex[len];
    if (!re) continue;
    linkedTitle = linkedTitle.replace(re, (match) => escapeLegacy('`' + match + '~'));
  }

  const payload = unescapeLegacy(chunk).replace(
    /"t":""/,
    `"t":"${unescapeLegacy(linkedTitle)}"`,
  );
  return `${idx} ${esc} ${payload}`;
}
