const GIF_TOKEN = /&(\w*?)\._104_0\.gif;?/g;
const PNG_TOKEN = /&([0-9a-fA-F]*?);?_\.png;?/g;

/** Normalize legacy encoded image markers to {[code]} tokens. */
export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(GIF_TOKEN, (_match, code: string) => `{[${code}]}`)
    .replace(PNG_TOKEN, (_match, code: string) => `{[${code}]}`);
}

/** Collapse runs of whitespace (including ideographic U+3000) to single ASCII space. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
