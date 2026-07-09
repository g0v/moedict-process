function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON matching Perl JSON::XS canonical output. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, sortedReplacer);
}

/** Compare UTF-8 byte sequences, equivalent to `env LC_ALL=C sort`. */
export function cLocaleCompare(a: string, b: string): number {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const len = Math.min(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = ab[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return ab.length - bb.length;
}
