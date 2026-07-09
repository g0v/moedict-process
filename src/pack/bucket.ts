import type { Lang } from './types';
import { firstCharCodeUnit } from './codepoint';

export function bucketIndex(title: string, lang: Lang): number {
  //@ verify
  //@ requires title.length > 0
  //@ requires lang === 'a' || lang === 't' || lang === 'h' || lang === 'c'
  const modulus = lang === 'a' ? 1024 : 128;
  return firstCharCodeUnit(title) % modulus;
}

export function filenameForTitle(title: string): string {
  // Trust boundary: JS string remove operation; tested by property tests.
  let result = '';
  for (let i = 0; i < title.length; i++) {
    const c = title.charAt(i);
    if (c !== '`' && c !== '~') {
      result += c;
    }
  }
  return result;
}

export { isSkippedTitle, FileTitleAcceptor } from './title-filter';
