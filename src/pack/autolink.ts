import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// Legacy {[hex]}→glyph conversion (moedict-epub sym.txt, the PUA-free default
// json2unicode.pl uses for dict-revised.unicode.json). Two key kinds:
//   plain `<hex> <value>` — inline `{[hex]}` → value (IDS/Unihan, PUA-free).
//   `x<hex> <value>`      — whole-string `"{[hex]}"` → value (compat pass).
// Unknown {[hex]} tokens are left as the literal `{[hex]}` string (not expanded
// to a codepoint) so no unmapped PUA enters the pack; assertNoPua then only sees
// the raw variant-headword PUA (allowlisted) and curated sym values.
const SYM_MAP: Record<string, string> = {};
const X_SYM_MAP: Record<string, string> = {};
{
  const p = fileURLToPath(new URL('./data/sym.txt', import.meta.url));
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const parts = line.split(/\s+/, 2);
    if (parts.length !== 2) continue;
    const k = parts[0]!;
    const v = parts[1]!;
    if (k.startsWith('x')) X_SYM_MAP[k.slice(1)] = v;
    else SYM_MAP[k] = v;
  }
}

export function expandPuaTokens(input: string): string {
  // Pass 1 (compat): a JSON string value that is exactly "{[hex]}" → the x-sym
  // (or plain-sym) value, re-quoted. Mirrors json2unicode.pl's first pass.
  let out = input.replace(/"\{\[([a-f0-9]{4,5})\]\}"/g, (match, hex) => {
    const v = X_SYM_MAP[hex] ?? SYM_MAP[hex];
    return v !== undefined ? JSON.stringify(v) : match;
  });
  // Pass 2 (generic): inline {[hex]} → sym value (IDS/Unihan) for known keys;
  // otherwise a codepoint escape — but a plane-15 PUA literal outside the 131
  // MOE-font variant set is left as the literal `{[hex]}` token (no unmapped PUA
  // enters the pack; assertNoPua only sees allowlisted raw variant PUA + sym
  // values). BMP/astral non-PUA escapes (e.g. {[4e2d]}→中) decode normally.
  return out.replace(/\{\[([a-f0-9]{4,5})\]\}/g, (match, hex) => {
    const mapped = SYM_MAP[hex];
    if (mapped !== undefined) return mapped;
    const code = parseInt(hex, 16);
    if (code >= 0xf0000 && code <= 0xffffd) {
      return VARIANT_PUA_ALLOWLIST.has(code) ? String.fromCodePoint(code) : match;
    }
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
 * The 131 MOE plane-15 PUA variant-glyph codepoints — the full cmap of MOE's
 * 標楷體2 / revised-dict.woff (U+F0000–FFFFF slots the font defines). These are
 * deliberate MOE-font variant glyphs with no canonical Unicode/IDS mapping, used
 * both as headword titles (110 of them) and inline within definitions. They are
 * NOT "real" characters; the PUA-free policy targets real (non-variant) PUA, so
 * these pass through (rendered by the MOE font on the display side). The set is
 * FIXED/curated from the font cmap — do not generate it from source at runtime
 * (that would silently bless future bad PUA). Any PUA codepoint NOT in this set
 * (i.e. not a MOE-font variant glyph) still fails assertNoPua and must be curated
 * to assigned Unihan (or IDS).
 */
const VARIANT_PUA_ALLOWLIST: ReadonlySet<number> = new Set<number>([
  0xf0009, 0xf003e, 0xf00e8, 0xf01f9, 0xf05a2, 0xf0605, 0xf06eb, 0xf07ff,
  0xf0a33, 0xf0ac2, 0xf0b78, 0xf0bc1, 0xf0ca2, 0xf0efe, 0xf0fc0, 0xf1391,
  0xf148e, 0xf15fd, 0xf1657, 0xf16ca, 0xf17c2, 0xf17f6, 0xf18b5, 0xf1c6c,
  0xf24e7, 0xf25e6, 0xf26ed, 0xf295b, 0xf3b19, 0xf3e71, 0xf3ef1, 0xf4033,
  0xf448b, 0xf4a4e, 0xf4ea3, 0xf52bc, 0xf5386, 0xf54bd, 0xf5736, 0xf585d,
  0xf5938, 0xf59dd, 0xf5e66, 0xf6063, 0xf6095, 0xf6196, 0xf6197, 0xf66ca,
  0xf6872, 0xf6c68, 0xf6c85, 0xf6d47, 0xf6f84, 0xf719f, 0xf7205, 0xf73c4,
  0xf73d3, 0xf7ba3, 0xf7d55, 0xf7e81, 0xf828d, 0xf8566, 0xf8720, 0xf892a,
  0xf89fb, 0xf8a56, 0xf8dad, 0xf8fae, 0xf9006, 0xf945c, 0xf95b0, 0xf9701,
  0xf977a, 0xf989d, 0xf991d, 0xf9b33, 0xf9d81, 0xf9e75, 0xf9f6d, 0xf9f85,
  0xf9fac, 0xf9fe0, 0xfa7d1, 0xfa868, 0xfaafc, 0xfabfa, 0xfac32, 0xfac33,
  0xfac34, 0xfaff6, 0xfb18d, 0xfb407, 0xfb464, 0xfb525, 0xfb575, 0xfb578,
  0xfb57b, 0xfbfb9, 0xfc05a, 0xfc1bb, 0xfcb51, 0xfcd7a, 0xfce75, 0xfce7c,
  0xfd166, 0xfd185, 0xfd1c5, 0xfd617, 0xfd660, 0xfd679, 0xfd734, 0xfd85a,
  0xfd98e, 0xfd9e8, 0xfdb3f, 0xfdb50, 0xfdd9e, 0xfdda4, 0xfde3d, 0xfdf55,
  0xfdfb1, 0xffbab, 0xffbae, 0xffbbb, 0xffc82, 0xffd36, 0xffd70, 0xffd9b,
  0xffdd0, 0xffefd, 0xfff46,
]);

/**
 * Fail hard if processed pack text still contains PUA that is NOT a curated
 * MOE variant glyph (one of the 131 in the font cmap). Those pass through
 * by the MOE font display-side); all other PUA must be curated to assigned
 * Unihan (or IDS), not silently stripped.
 */
export function assertNoPua(text: string, context: string): void {
  const pua = findPuaCodePoints(text).filter((cp) => !VARIANT_PUA_ALLOWLIST.has(cp));
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
