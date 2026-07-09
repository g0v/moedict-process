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

/** Map used by json2prefix.ls for prefix/lenToRegex generation. */
export const PUA2UNI_JSON2PREFIX: Record<string, string> = {
  '⿰𧾷百': '𬦀',
  '⿸疒哥': '󿗧',
  '⿰亻恩': '𫣆',
  '⿰虫念': '𬠖',
  '⿺皮卜': '󿕅',
};

/** Map used by autolink.ls for payload generation. Differs for three IDS strings. */
export const PUA2UNI_AUTOLINK: Record<string, string> = {
  '⿰𧾷百': '󾜅',
  '⿸疒哥': '󿗧',
  '⿰亻恩': '󿌇',
  '⿰虫念': '󿑂',
  '⿺皮卜': '󿕅',
};

export function grokJson(raw: string, puaMap: Record<string, string>): GrokEntry[] {
  const grokked = minifyKeys(raw).replace(
    /[⿰⿸⿺](?:𧾷|.)./g,
    (ids) => puaMap[ids] ?? ids,
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
