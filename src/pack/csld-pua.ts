import csldPua from './data/csld-pua.json';

/**
 * Curated literal-PUA normalization for the Cross-Strait (c) source.
 *
 * Fixture-era `dict-csld.json` carries exactly three BMP-PUA codepoints, all
 * Big5-era encoding leftovers. The legacy Perl pipeline passed them through
 * verbatim into pcck/ payloads; the port normalizes them to assigned Unicode
 * at source load, before the `assertNoPua` gate:
 *
 *   U+E38F → 著   紅樓夢 quote in 學舌's traditional-orthography example:
 *                 「手裡拿著好些頑意兒」; the Mandarin corpus renders the same
 *                 construction as 拿著 (webkit pack/767.txt).
 *   U+E840 → 䓖   alternate-form (`alt`) field of 藭/芎藭; 䓖 (U+44D6) is the
 *                 PRC simplification of 藭, corroborated by the Mandarin pack's
 *                 芎䓖 cross-reference (pack/493.txt).
 *   U+F8F8 → ""   trailing artifact after complete bopomofo readings
 *                 (峿 「ㄩˇ␦」, 樔 「ㄓㄠ␦」); stripped.
 *
 * Only mapped codepoints are replaced. Any other PUA flows through to
 * `assertNoPua`, which hard-fails with lang/title context — the PUA-free
 * output contract stays intact for uncurated codepoints.
 */
const CSLD_PUA: Record<string, string> = csldPua;

const LITERAL_PUA_RE = /[\uE000-\uF8FF]/g;

export function normalizeCsldPua(raw: string): string {
  return raw.replace(LITERAL_PUA_RE, (ch) => {
    const hex = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    const mapped = CSLD_PUA[hex];
    return mapped === undefined ? ch : mapped;
  });
}
