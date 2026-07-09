import { isSkippedTitle } from './bucket';
import type { PrefixEntry } from './types';
export { buildLenToRegex } from './regex';
export function buildPrefixTrie(entries: readonly PrefixEntry[]): Record<string, string> {
  //@ verify
  let prefix: Map<string, string> = new Map();
  for (const entry of entries) {
    const title = entry.t;
    if (title.length === 0) continue;
    if (isSkippedTitle(title)) continue;
    const first = title.charCodeAt(0);
    const preLen = 0xD800 <= first && first <= 0xDBFF && title.length >= 2 ? 2 : 1;
    const pre = title.slice(0, preLen);
    const post = title.slice(preLen);
    if (post.length) {
      prefix = prefix.set(pre, (prefix.get(pre) || '') + '|' + post);
    } else {
      prefix = prefix.set(pre, prefix.get(pre) || '');
    }
  }
  return Object.fromEntries(prefix);
}

