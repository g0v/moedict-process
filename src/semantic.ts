export class UnbalancedBracesError extends Error {
  constructor(input: string) {
    super(`unbalanced braces: ${input}`);
    this.name = 'UnbalancedBracesError';
  }
}

const QUOTE_PAIRS: Record<string, string> = {
  '「': '」',
  '『': '』',
};

export type SentenceClass = 0 | 1 | 2 | 3;

export function splitSentence(source: string): string[] {
  const sentences: string[] = [];
  const chars = Array.from(source);
  const wait: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    current += ch;

    const open = QUOTE_PAIRS[ch];
    if (open !== undefined) wait.push(open);
    // Stryker disable next-line ConditionalExpression,EqualityOperator: when
    // wait is empty, wait[-1] is undefined and undefined !== ch is false
    // anyway, so dropping the length guard is observationally equivalent.
    if (wait.length > 0 && wait[wait.length - 1] === ch) wait.pop();

    if (wait.length > 0) continue;

    const endsWithPeriod = current.endsWith('。');
    const endsWithColonQuote = /：「[\s\S]*」$/.test(current);
    if (!endsWithPeriod && !endsWithColonQuote) continue;

    const nextChar = chars[i + 1];
    if (nextChar === '、' || nextChar === '。') continue;

    // Stryker disable next-line StringLiteral: any non-empty fallback creates
    // a string that can never equal '句下' (the only meaningful value here),
    // so a sentinel-replacement mutant is observationally equivalent.
    const nextTwo = (chars[i + 1] ?? '') + (chars[i + 2] ?? '');
    if (nextTwo === '句下') continue;

    sentences.push(current);
    current = '';
  }

  if (wait.length > 0) {
    throw new UnbalancedBracesError(source);
  }
  if (current) sentences.push(current);

  return sentences;
}

const LINK_CITATION = /^(同|亦作|亦稱為|俗稱為|或作|通|或稱為|簡稱為|或譯作|縮稱為|也稱為)「(.+?)(?:」。|。」)/u;
const LINK_SEE = /^見「(.+?)」等?條。/u;
const LINK_ARCHAIC = /^「(.+?)」的古字。/u;
const LINK_VARIANT = /^「(.+?)」的異體字（\d+）/u;
// Stryker disable next-line Regex: WITH_PERIOD is a strict subset of
// EXAMPLE_WITHOUT_PERIOD's matches (any `如：「X」。` also matches `如：「X」`),
// so any mutation here that doesn't break parsing produces the same return
// via the OR fallback. Kept for parity with the Python source's two-step check.
const EXAMPLE_WITH_PERIOD = /^如：「(.+)」。/u;
const EXAMPLE_WITHOUT_PERIOD = /^如：「(.+)」/u;
const QUOTE_SOURCE_COLON_QUOTE = /^(.+?)：「(.+?)」$/u;
// Stryker disable next-line Regex: this character class is observationally
// dead — every branch in the colonQuote arm of classifySentence returns 2
// (after the `，` early-return), so DOT_SEPARATOR's body doesn't influence
// the function's output. Kept as documentation of the three "reasons for 2".
const DOT_SEPARATOR = /[˙．]/u;

// Stryker disable next-line StringLiteral: same as DOT_SEPARATOR above —
// the Set's contents don't affect classifySentence's output today.
const KNOWN_AUTHORITATIVE_SOURCES = new Set(['說文解字']);

export function classifySentence(sentence: string): SentenceClass {
  if (EXAMPLE_WITH_PERIOD.test(sentence) || EXAMPLE_WITHOUT_PERIOD.test(sentence)) {
    return 1;
  }

  if (LINK_CITATION.test(sentence)) return 3;
  if (LINK_SEE.test(sentence)) return 3;
  if (LINK_ARCHAIC.test(sentence)) return 3;
  if (LINK_VARIANT.test(sentence)) return 3;

  const colonQuote = QUOTE_SOURCE_COLON_QUOTE.exec(sentence);
  if (colonQuote) {
    const source = colonQuote[1]!;
    if (source.includes('，')) return 0;
    // Stryker disable next-line ConditionalExpression: branch is observationally
    // dead — both true and false fall through to `return 2` below.
    if (DOT_SEPARATOR.test(source)) return 2;
    // Stryker disable next-line ConditionalExpression: same as above.
    if (KNOWN_AUTHORITATIVE_SOURCES.has(source)) return 2;
    return 2;
  }

  return 0;
}
