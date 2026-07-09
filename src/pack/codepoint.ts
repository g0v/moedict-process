/**
 * Count Unicode codepoints in a JS string.
 * Equivalent to json2prefix.ls line 50 but expressed as a pure loop for LemmaScript.
 */
export function codepointCount(s: string): number {
  //@ verify
  //@ requires s.length >= 0
  //@ ensures \result >= 0
  //@ ensures \result <= s.length
  //@ ensures (s.length > 0 ==> \result >= 1)
  let count = 0;
  let i = 0;
  while (i < s.length) {
    //@ invariant 0 <= count
    //@ invariant count <= i
    //@ invariant count <= s.length
    //@ invariant 0 <= i
    //@ invariant (i > 0 ==> count >= 1)
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
 * For a well-formed surrogate pair, returns the low surrogate value minus 0xDC00,
 * matching autolink.ls lines 71-75.
 */
export function firstCharCodeUnit(s: string): number {
  //@ verify
  //@ requires s.length > 0
  //@ requires s.charCodeAt(0) <= 0xFFFF
  //@ ensures \result >= 0
  //@ ensures \result <= 0xFFFF
  // For a leading high surrogate, only fold to the low-surrogate offset when a
  // well-formed pair follows; an unpaired high surrogate falls back to the first
  // code unit (never NaN), so the range postcondition holds for ALL non-empty strings.
  const first = s.charCodeAt(0);
  if (0xD800 <= first && first <= 0xDBFF && s.length >= 2 && 0xDC00 <= s.charCodeAt(1) && s.charCodeAt(1) <= 0xDFFF) {
    return s.charCodeAt(1) - 0xDC00;
  }
  return first;
}

export { codepointCompare } from '~/process';
