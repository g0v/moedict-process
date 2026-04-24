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
    if (wait.length > 0 && wait[wait.length - 1] === ch) wait.pop();

    if (wait.length > 0) continue;

    const endsWithPeriod = current.endsWith('。');
    const endsWithColonQuote = /：「[\s\S]*」$/.test(current);
    if (!endsWithPeriod && !endsWithColonQuote) continue;

    const nextChar = chars[i + 1];
    if (nextChar === '、' || nextChar === '。') continue;

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
const EXAMPLE_WITH_PERIOD = /^如：「(.+)」。/u;
const EXAMPLE_WITHOUT_PERIOD = /^如：「(.+)」/u;
const QUOTE_SOURCE_COLON_QUOTE = /^(.+?)：「(.+?)」$/u;
const DOT_SEPARATOR = /[˙．]/u;

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
    if (DOT_SEPARATOR.test(source)) return 2;
    if (KNOWN_AUTHORITATIVE_SOURCES.has(source)) return 2;
    return 2;
  }

  return 0;
}
