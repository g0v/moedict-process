# Variants Sidecar Design

## Goal
Provide `moedict.tw` with a reproducible, no-PUA variants sidecar compiled from the 2013 kcwu snapshot plus reviewed Unicode resolutions, without modifying the revised dictionary payloads.

## Ownership and licensing
`moedict-data/variants/` owns source snapshots and provenance. The kcwu snapshot and MOE-derived observations have `licenseStatus: unknown-pending-clarification`; they are not covered by moedict-data's CC0/MIT conversion license. Independently authored resolution assertions identify their source and license separately.

`moedict-process` owns deterministic parsing, merging, conflict detection, output validation, and compilation. It never fetches network data during builds.

## Source model
Inputs are an immutable kcwu list snapshot, a resolution overlay, and partial headword observations. The overlay records `educode`, optional own `codepoint`, symbolic unresolved glyph reference, status, source, evidence, and provenance. Unresolved PUA/image rows remain symbolic and never become literal PUA output. The four observed N-series rows are a partial overlay, not a complete current 正字表.

The full kcwu scrape is not checked into either repository because its repository has no license grant. A local build input must be obtained separately using a pinned manifest and SHA-256, with only tiny synthetic fixtures committed for tests. The source manifest records `licenseStatus: unknown-pending-clarification`.

## Output model
Emit only for Mandarin (`a`) under `a/variants/`:

- `index.json`: `{ resolvedGlyphs, headwordGroups }`.
- `entries/*.json`: group records keyed by parent educode.

`resolvedGlyphs` maps an own resolved codepoint to the educode(s) whose own glyph has that codepoint. `headwordGroups` maps a headword's own codepoint to parent group educodes. Child membership is only in the group record; a child never inherits the parent's codepoint.

## Pipeline
Add `src/pack/variants.ts`; call it from `packLang()` after `writer.finalize()` for `lang === 'a'`. Use canonical deterministic JSON, stable ordering, conflict errors, scalar validation, and `assertNoPua` on generated output. Do not change existing entry payloads or the frozen pack contract.

## Tests
Cover filename hex decoding, PUA symbolic preservation, GlyphWiki overlay resolution and conflicts, N00517–N00520 observations, separate reverse indexes, deterministic ordering, and no-PUA output.
