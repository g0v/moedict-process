export type Lang = 'a' | 't' | 'h' | 'c';

/** Raw entry as it appears in moedict-data JSON files. */
export interface PackEntry {
  title: string;
  heteronyms?: unknown[];
  [key: string]: unknown;
}

/** Entry after `grok` key minification (t/h/b/p/... keys). Used by the pack pipeline. */
export interface GrokEntry {
  t: string;
  h?: unknown[];
  [key: string]: unknown;
}

/** Lightweight entry shape used by the verified prefix-trie builder. */
export interface PrefixEntry {
  t: string;
}
/** Prefix-to-suffixes map: value is "|suffix1|suffix2|..." from json2prefix.ls. */
export type PrefixTrie = Record<string, string>;

export interface LenToRegexResult {
  lenToRegex: Record<number, string>;
  lenToTitles: Record<number, string[]>;
  abbrevToTitle: Record<string, string>;
}

export interface LenToRegexMap {
  [length: number]: RegExp;
}
