const SKIP_PATTERN = /\{\[[0-9a-f]{4}\]\}|\uDB40[\uDD00-\uDD0F]|[⿰⿸⿺]/;

//@ contract True iff title contains a {[hex]} image token, a U+DB40..U+DB4F
//@        tag-suffix PUA sequence, or an IDS radical (⿰/⿸/⿺). Out of model
//@        (RegExp.test); consumed cross-file by the verified bucket/prefix cores
//@        as an opaque axiom. Trust boundary: skip semantics are NOT verified.
export function isSkippedTitle(title: string): boolean {
  return SKIP_PATTERN.test(title);
}

/**
 * Legacy parity: `link2pack.pl` lines 47-49 skip IDS filenames and
 * exact-string bucket duplicates (`next if $seen{$file}++` — Perl string
 * equality, never Unicode-normalized) before both the per-title `.json`
 * write and the bucket append. Its NFD-sensitive behavior is confined to
 * a startup refusal to run on a normalization-insensitive filesystem
 * (APFS) at all — protecting the standalone per-title file from a silent
 * same-path overwrite, never the aggregated bucket content. So bucket
 * acceptance (`acceptFileTitle`) MUST use exact-string equality, matching
 * `%seen`; only the optional standalone per-title file write
 * (`acceptFileWrite`) applies NFD-normalized dedup, replicating the real
 * APFS collision risk on a normalization-insensitive filesystem. Conflating
 * the two (NFD-gating the bucket too) silently drops legitimate distinct
 * dictionary entries whose titles happen to be CJK Compatibility Ideographs
 * with a canonical decomposition to another entry's title (e.g. 善 U+5584
 * vs its 異體字 variant U+2F845) — see g0v/moedict-process pack-pipeline
 * NFD-bucket-drop investigation.
 */
export class FileTitleAcceptor {
  private seenExact = new Set<string>();
  private seenNfd = new Set<string>();

  /** Bucket-append gate: reject IDS titles and exact-string duplicates only. */
  acceptFileTitle(fileTitle: string): boolean {
    if (/[⿰⿸⿺]/.test(fileTitle)) return false;
    if (this.seenExact.has(fileTitle)) return false;
    this.seenExact.add(fileTitle);
    return true;
  }

  /**
   * Standalone per-title `.json` file gate: additionally reject
   * NFD-normalized duplicates. Call only after `acceptFileTitle` returns
   * true for the same `fileTitle`; independent of IDS/exact-duplicate
   * rejection, which `acceptFileTitle` already covers.
   */
  acceptFileWrite(fileTitle: string): boolean {
    const normalized = fileTitle.normalize('NFD');
    if (this.seenNfd.has(normalized)) return false;
    this.seenNfd.add(normalized);
    return true;
  }
}
