# Legacy Golden-Output Fixtures

This directory contains a subset of the moedict pack output used as the oracle
for `bun run pack` golden tests.

## Provenance

- Source: `~/w/moedict.tw/data/dictionary/` (the built output consumed by moedict.tw)
- Captured: 2026-07-09
- This is **not** a fresh `make full` run. The legacy toolchain (`lsc`, `perl`, `python2`) is not installed in this environment, so we cannot reproduce the legacy build directly. These fixtures represent the closest available legacy-equivalent output.

### Regenerated metadata

`a/index.json` and `a/xref.json`, `h/xref.json`, `t/xref.json`, and
`h/index.json` were regenerated on 2026-07-10 with the TypeScript pack
port. The inputs were the dictionary snapshot above plus
`moedict-data-twblg` commit
`253365f292b38e431ffcee541348e44b9f69ae22:x-華語對照表.csv` and
`moedict-data-hakka` commit
`848be54226a673ff3b56b9b56cebb300ce5f0ae4:work-in-progress.json`.

These are source-contract fixtures, not byte-preserved legacy artifacts:
generated indexes use Unicode scalar ordering, and xrefs use canonical JSON.
The remaining files retain the 2026-07-09 legacy capture.

#### h/index.json regeneration notes

The legacy `h/index.json` fixture (2026-07-09 capture, 14712 entries) was
replaced with a port-generated index (14711 entries) because of source
drift in `dict-hakka.json` since the original capture:

- 12 titles: `朏` (U+670F) → `胐` (U+80D0) — MOE character correction
- 1 title: `落食` → `絡食` — MOE character correction
- 1 title: `U+FF545` (plane-15 PUA) → `⿺皮卜` (IDS) — the legacy pipeline
  converted IDS titles to plane-15 PUA via the `hakka-pua` token map
  (F545 → `⿺皮卜`); the port's `isSkippedTitle` filter drops IDS titles
  (`⿰`/`⿸`/`⿺`) entirely, so the entry is absent from both the index and
  the `phck/` bucket output. This is a deliberate 1-entry loss: the port
  produces 15455 `phck/` entries vs 15456 in the deployed legacy output.
  The missing entry (`⿺皮卜`, audio_id 15287) is a minor Hakka word for
  "skin bump from insect bite."


## Scope

Only a small, manifest-based subset is committed to the repo to avoid vendoring
~84 MB of pack bucket files without `git-lfs`:

- `a/` — full Mandarin output tree (entry JSONs, regenerated `index.json` and
  `xref.json`, plus `=*.json` and `@*.json`)
- `h/` — full Hakka output tree (small; `xref.json` is regenerated)
- `t/` — source-driven `index.json` and regenerated `xref.json`
- `pack/` — representative bucket files: `0.txt`, `7.txt`, `102.txt`, `123.txt`, `259.txt`, `379.txt`, `396.txt`, `414.txt`, `804.txt`, `958.txt`

See `manifest.json` for the complete list.

## Comparing against a full external legacy root

Set the environment variable `LEGACY_FIXTURE_ROOT` to a locally generated or
legacy pack tree, and the golden tests will compare against that root instead of
(or in addition to) the committed subset:

```sh
LEGACY_FIXTURE_ROOT=/path/to/legacy/data/dictionary bun test tests/pack/golden-output.test.ts
```

When `LEGACY_FIXTURE_ROOT` is unset, the tests use the committed `manifest.json`
subset.
