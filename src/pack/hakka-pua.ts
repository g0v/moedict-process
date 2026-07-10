import hakkaPua from './data/hakka-pua.json';

const TOKEN_RE = /\{\[([0-9a-f]{4})\]\}/gi;

function replacementFor(hex: string, token: string): string {
  const replacement = hakkaPua[hex.toUpperCase() as keyof typeof hakkaPua];
  if (replacement === undefined) throw new Error(`unknown Hakka PUA token: ${token}`);
  return replacement;
}

export function normalizeHakkaPua(raw: string): string {
  return raw.replace(TOKEN_RE, (token, hex) => replacementFor(hex, token));
}
