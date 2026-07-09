/**
 * Count Unicode codepoints in a JS string.
 * Equivalent to json2prefix.ls line 50 but expressed as a pure loop for LemmaScript.
 */
export function codepointCount(s: string): number {
  //@ verify
  //@ requires s.length >= 0
  //@ ensures \result >= 0
  let count = 0;
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (0xD800 <= c && c <= 0xDBFF) {
      i += 2;
    } else {
      i += 1;
    }
    count += 1;
  }
  return count;
}

/**
 * Return the first UTF-16 code unit used for bucket indexing.
 * For a lone surrogate pair, returns the low surrogate value minus 0xDC00,
 * matching autolink.ls lines 71-75.
 */
export function firstCharCodeUnit(s: string): number {
  //@ verify
  //@ requires s.length > 0
  const first = s.charCodeAt(0);
  if (0xD800 <= first && first <= 0xDBFF) {
    return s.charCodeAt(1) - 0xDC00;
  }
  return first;
}

export { codepointCompare } from '~/process';
