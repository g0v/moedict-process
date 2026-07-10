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

#### c/ and pcck/ fixtures (Cross-Strait)

Captured 2026-07-10 from the deployed `~/w/moedict.tw/data/dictionary/{c,pcck}`
tree — a ~2026-04 output of the legacy Perl pipeline (the `c` target was
best-effort in the webkit Makefile: `-perl link2pack.pl c`). Subset: `c/index.json`,
`c/=.json`, sample `c/@*.json` radical and `c/=*.json` category files, six
representative `pcck/*.txt` buckets, and individual `c/<title>.json` entries.

The port's `c` run consumes an enriched `dict-csld.json` **pinned to the
fixture era**: `moedict-data-csld` commit
`f7bd225d88d76edbb21f79b6ada4e3ee84de0beb` ("Latest revision from CSLD
editor" — the last commit before the `語本/語出` editorial wave landed in
`ec6afd1`), enriched by `scripts/translation/csld2json.py` with the
fixture-era `cfdict` translation inputs preserved in the deployed
`data/dictionary/translation-data/`:

```sh
git -C moedict-data-csld show f7bd225:dict-csld.json > /tmp/csld-pinned-raw.json
python3 scripts/translation/csld2json.py \
  --cedict <cedict.txt> --cfdict <deployed cfdict.txt> --handedict <handedict.txt> \
  --moedict /tmp/csld-pinned-raw.json \
  --output "$MOEDICT_PACK_INPUT/dict-csld.json"
```

A full-fixture scan against this pinned input shows **zero** content drift
(HEAD `a1e9119` by contrast drifts on 432 surfaces: added citations,
reordered/removed definitions, reading reformatting). Running the c golden
against a newer edition is an input error, not tolerated drift.

Comparison mode is **structural** (`compareCEntryStructurally`), strict on
content, tolerant only of representation:

- **PUA curation** — fixture-era `dict-csld.json` carries three Big5-era PUA
  codepoints that the legacy pipeline passed through verbatim (visible in the
  captured `pcck/` buckets). The port normalizes them to assigned Unicode at
  source load (`src/pack/csld-pua.ts`): `U+E38F → 著` (學舌 example quote),
  `U+E840 → 䓖` (alt form of 藭/芎藭), `U+F8F8 → removed` (trailing bopomofo
  artifact in 峿/樔). All affected entries are retained; any uncurated PUA
  still hard-fails `assertNoPua`.
- **Autolink markup** (`` ` ``/`~`) is stripped on both sides before
  comparison; translation-era enrichment fields are the only tolerated
  payload divergence. Titles, heteronym ids, readings, and ordered
  definition text must match, and every compared port payload must be
  PUA-free.


## Scope

Only a small, manifest-based subset is committed to the repo to avoid vendoring
~84 MB of pack bucket files without `git-lfs`:

- `a/` — full Mandarin output tree (entry JSONs, regenerated `index.json` and
  `xref.json`, plus `=*.json` and `@*.json`)
- `h/` — full Hakka output tree (small; `xref.json` is regenerated)
- `t/` — source-driven `index.json` and regenerated `xref.json`
- `pack/` — representative bucket files: `0.txt`, `7.txt`, `102.txt`, `123.txt`, `259.txt`, `379.txt`, `396.txt`, `414.txt`, `804.txt`, `958.txt`
- `c/` — Cross-Strait subset: `index.json`, `=.json`, sample `@*.json`/`=*.json`,
  and individual entry JSONs (structural-comparison oracle)
- `pcck/` — six representative Cross-Strait buckets

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
