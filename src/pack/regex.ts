import { codepointCount } from './codepoint';
import type { Lang, LenToRegexResult, PrefixTrie } from './types';

function escapeRegexMeta(s: string): string {
  return s.replace(/[-[\]{}()*+?.,\\#\s]/g, '\\$&');
}

export function buildLenToRegex(trie: PrefixTrie, _lang: Lang): LenToRegexResult {
  const abbrevToTitle: Record<string, string> = {};
  const lenToTitles: Record<number, string[]> = {};

  for (const [k, v] of Object.entries(trie)) {
    const prefixLength = codepointCount(k);
    const suffixes = v.split('|');
    for (let suffix of suffixes) {
      const abbrevIndex = suffix.indexOf('(');
      if (abbrevIndex >= 0) {
        const orig = suffix;
        suffix = suffix.slice(0, abbrevIndex);
        abbrevToTitle[k + suffix] = k + orig;
      }
      const len = prefixLength + suffix.length;
      if (!lenToTitles[len]) lenToTitles[len] = [];
      lenToTitles[len].push(k + suffix);
    }
  }

  const lenToRegex: Record<number, string> = {};
  const lens: number[] = [];
  for (const [len, titles] of Object.entries(lenToTitles)) {
    const length = Number(len);
    lens.push(length);
    // Legacy LiveScript `titles.sort!` uses UTF-16 code-unit order.
    titles.sort();
    const joined = titles.join('|');
    lenToRegex[length] = escapeRegexMeta(joined);
  }
  lens.sort((a, b) => b - a);

  // Optimized regex for the shortest lengths, matching json2prefix.ls lines 75-98.
  for (const len of [2, 3, 4]) {
    const titles = lenToTitles[len];
    if (!titles) continue;
    let cur = '';
    let re = '';
    for (const t of titles) {
      let one = t.slice(0, 1);
      let two = t.slice(1);
      const code = one.charCodeAt(0);
      if (0xD800 <= code && code <= 0xDBFF) {
        one = t.slice(0, 2);
        two = t.slice(2);
      }
      if (one === cur) {
        if (len !== 2) re += '|';
        re += two;
      } else {
        if (len === 2) {
          re += ']|' + one + '[' + two;
        } else {
          re += ')|' + one + '(' + two;
        }
      }
      cur = one;
    }
    if (len === 2) {
      re = re.replace(/\[(.|[\uD800-\uDBFF].)\]/g, '$1');
    } else {
      re = re.replace(/\(([^|]+)\)/g, '$1');
    }
    re = re.slice(2).replace(/[-{}*+?.,\\#\s]/g, '\\$&');
    if (len === 2) re += ']';
    else re += ')';
    lenToRegex[len] = re;
  }

  return { lenToRegex, abbrevToTitle, lenToTitles };
}
