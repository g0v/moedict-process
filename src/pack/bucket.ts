import type { Lang } from './types';
import { firstCharCodeUnit } from './codepoint';

export function bucketIndex(title: string, lang: Lang): number {
  //@ verify
  //@ requires title.length > 0
  //@ requires title.charCodeAt(0) <= 0xFFFF
  //@ requires lang === 'a' || lang === 't' || lang === 'h' || lang === 'c'
  //@ ensures \result >= 0
  //@ ensures lang === 'a' ==> \result < 1024
  //@ ensures lang !== 'a' ==> \result < 128
  const modulus = lang === 'a' ? 1024 : 128;
  return firstCharCodeUnit(title) % modulus;
}

export function filenameForTitle(title: string): string {
  //@ verify
  //@ requires title.length >= 0
  //@ ensures \result.length <= title.length
  //@ ensures forall(k, (0 <= k && k < \result.length) ==> (\result.charCodeAt(k) !== 96 && \result.charCodeAt(k) !== 126))
  // Trust boundary: JS string remove operation; tested by property tests.
  let result = '';
  for (let i = 0; i < title.length; i++) {
    //@ invariant 0 <= i
    //@ invariant i <= title.length
    //@ invariant result.length <= i
    //@ invariant result.length <= title.length
    //@ invariant forall(k, (0 <= k && k < result.length) ==> (result.charCodeAt(k) !== 96 && result.charCodeAt(k) !== 126))
    const code = title.charCodeAt(i);
    if (code !== 96 && code !== 126) {
      result += title.slice(i, i + 1);
    }
  }
  return result;
}

export { isSkippedTitle, FileTitleAcceptor } from './title-filter';
