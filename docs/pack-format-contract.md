# Pack Format Contract

This document specifies the output of `bun run pack` in `g0v/moedict-process`.
It is the contract between the pack pipeline and its downstream consumers:
`g0v/moedict.tw`, `g0v/moedict-app`, and the frozen legacy `moedict.org` frontend.

## Output layout

`bun run pack` writes the following tree under its `outputDir`:

```
outputDir/
├── a/                    # Mandarin: individual entry JSONs + indexes
├── c/                    # 兩岸詞典 (Cross-Strait): individual entry JSONs
├── h/                    # 客語： individual entry JSONs
├── t/                    # 臺語： individual entry JSONs
├── pack/                 # Mandarin bucket files (<bucket>.txt)
├── pcck/                 # Cross-Strait bucket files
├── phck/                 # Hakka bucket files
├── ptck/                 # Taiwanese bucket files
├── search-index/         # Fuse.js full-text search indexes (generated in moedict.tw)
├── translation-data/     # English/French/German translation JSON
└── lookup/pinyin/        # Pinyin-token lookup indexes for romanization search
```

### Per-language directory (`a/`, `c/`, `h/`, `t/`)

Each directory contains its source-defined subset of:

- `<title>.json` — one JSON file per entry, named by the entry title with `` ` ``
  and `~` removed. Files containing IDS characters (`⿰⿸⿺`) or duplicate NFD
  filenames are skipped by the writer.
- `index.json` — a language index where that language's source provides one.
  The core pipeline generates Mandarin and Hakka indexes from accepted emitted
  titles in deterministic Unicode scalar order; Taiwanese retains its source
  CSV-driven index generator.
- `xref.json` — cross-language mapping, shipped for Mandarin, Taiwanese, and
  Hakka. The pack generates it from optional explicit correspondence side inputs
  (`x-華語對照表.csv` and `work-in-progress.json`), not dictionary entries.
- `=<category>.json` — Mandarin category list files.
- `@<radical>.json` — Mandarin radical list files.

### Bucket files (`pack/`, `pcck/`, `phck/`, `ptck/`)

Each bucket file is a single-line JSON object keyed by escaped title:

```json
{"<escaped title 1>":<payload 1>,"<escaped title 2>":<payload 2>}
```

- Bucket index = `firstCharCodeUnit(title) % 1024` for `a`, `% 128` for `t/h/c`.
- Keys are sorted by byte-wise UTF-8 comparison (C-locale order).
- Payloads are canonical JSON produced by `JSON.stringify` with sorted keys and
  the `"t"` field cleared to ` ""` (the title is reconstructed from the bucket
  key by consumers).

## Input files

`bun run pack` reads from `inputDir`:

- `dict-revised-translated.json` — preferred Mandarin source when present; it
  carries the generated English/French/German fields. The pipeline falls back
  to `dict-revised.json` when translations are unavailable.
- `dict-concised.audio.json` — optional Mandarin audio-id map, copied from the
  legacy translation-side source.
- `dict-twblg.json` and `dict-twblg-ext.json` — Taiwanese sources.
- `dict-hakka.json` — Hakka source.
- `dict-csld.json` — Cross-Strait source.

## Ordering and normalization

- Bucket lines and bucket-object keys use UTF-8 byte order, exactly matching
  legacy `LC_ALL=C sort`.
- `lenToRegex.*.json` construction retains legacy JavaScript `Array.sort()`
  ordering (UTF-16 code units). Legacy `a/index.json` was a separately
  maintained checked-in artifact; the pack command did not generate it.
- Bucket filenames and per-entry `.json` filenames are NFD-normalized by the
  filesystem. The pack writer rejects filenames containing IDS characters
  (`⿰⿸⿺`) and rejects duplicate NFD filenames before both file write and bucket
  append, matching `link2pack.pl` lines 47–49.
- Unsubstituted `{[hex]}` tokens and variant selectors (`\uDB40[\uDD00-\uDD0F]`)
  are filtered upstream by `isSkippedTitle` in the autolink/prefix stage.

## Consumer contracts

### `g0v/moedict.tw`

- Reads `data/dictionary/{pack,pcck,phck,ptck,a,c,h,t,search-index,translation-data,lookup/pinyin}`.
- `commands/upload_dictionary.sh` copies `data/dictionary` to R2 and purges the
  Cloudflare cache.

### `g0v/moedict-app`

- `scripts/prepare-data.sh` copies from a sibling `moedict.tw/data/dictionary`
  tree into `public/dictionary/` and `public/search-index/`.
- Required directories: `pack/`, `pcck/`, `phck/`, `ptck/`, `a/`, `c/`, `h/`,
  `t/`, `lookup/pinyin/`.
- Top-level `@*.json` and `=*.json` special files are copied to
  `public/dictionary/` root.

### Legacy `moedict.org`

- Static frontend assets are served from `g0v/moedict-webkit` gh-pages (verified
  live 2026-07-09: a font push to `g0v/moedict-webkit` gh-pages went live on
  www.moedict.org). Earlier notes claiming `g0v/moedict-app` gh-pages host it are
  stale. Implication: the `moedict-webkit` repo cannot be archived even after pack
  retirement — it still hosts the live moedict.org frontend; only its pack
  Makefile targets can retire.
- Pack data is consumed through the same paths as `moedict.tw`.

## Trust boundaries

The following are explicitly **not** verified by LemmaScript and are covered by
property tests and golden-output regression tests:

- JavaScript `RegExp` behavior in LTM replacement and regex generation.
- `JSON.stringify` key ordering and escaping.
- File-system I/O and APFS/NFD filename handling.
- Audio-map heuristics for Mandarin `audio_id` injection.

## Known differences from legacy output

1. **Legacy xref object order and coverage** — the Perl xref generator wrote
   hash order noncanonically, and archived output contains mappings absent from
   recoverable correspondence snapshots. The committed a/h/t xref fixtures were
   regenerated from the pinned source snapshots named in
   `tests/pack/fixtures/legacy/README.md`; golden tests compare parsed keys and
   values against that source-contract oracle, not the stale legacy object.
2. **Special `@*.json` / `=*.json` entry files** under `a/` — these are inputs to
   `special2pack` (and category dumps), not outputs of the core pack run. The
   pipeline writes aggregated `pack/@.txt` and `pack/=.txt` when those inputs
   are present under `outputDir/a/`.
3. **Payload key order** — no current difference: `canonicalJson` matches the
   legacy `sort-json.pl` canonical-key serialization.
4. **Translations / audio_id** — when `dict-revised-translated.json` and
   `dict-concised.audio.json` are supplied, the pack port emits their legacy
   translation fields and audio ids; raw Mandarin input intentionally omits
   those enrichment fields.
5. **Variant PUA policy** — all non-variant PUA remains a hard failure. The
   curated 131 plane-15 MOE variant glyphs in `revised-dict.woff` are allowed
   through unchanged for display; any other PUA is rejected with path/title
   context. `IDS2UNI` converts known IDS forms to assigned Unicode before this
   gate. No uncurated codepoint is silently stripped or rendered as `□`.

   The Cross-Strait source additionally carries three curated Big5-era PUA
   codepoints that legacy passed through verbatim; the port normalizes them
   to assigned Unicode at source load (`src/pack/csld-pua.ts`: `U+E38F → 著`,
   `U+E840 → 䓖`, `U+F8F8 → removed`) and retains the entries. Uncurated PUA
   in any language still hard-fails.

   Font coverage for Ext C/E/G/H is **render-side**. Fixtures from the pre-Unihan
   pack tree may still show PUA/`𬦀` until regenerated from a PUA-free source.
6. **Phase 5 (`moedict-webkit` retirement) is blocked** until a full
   `MOEDICT_PACK_INPUT` golden pass and downstream staging are green. Do not
   delete pack Makefile targets, close Dependabot PRs as “retired”, or archive
   the repo while rollback still depends on the legacy toolchain.
