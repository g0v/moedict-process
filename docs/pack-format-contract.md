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

Each directory contains:

- `<title>.json` — one JSON file per entry, named by the entry title with `` ` ``
  and `~` removed. Files containing IDS characters (`⿰⿸⿺`) or duplicate NFD
  filenames are skipped by the writer.
- `index.json` — list/index structure consumed by the frontend.
- `xref.json` — cross-reference index (Mandarin only).
- `=<category>.json` — category list files.
- `@<radical>.json` — radical list files.

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

- `dict-revised.json` — Mandarin source (same data historically symlinked as
  `dict-revised.pua.json` in `moedict-webkit`).
- `dict-twblg.json` and `dict-twblg-ext.json` — Taiwanese sources.
- `dict-hakka.json` — Hakka source.
- `dict-csld.json` — Cross-Strait source.

## Ordering and normalization

- Titles are sorted by Unicode codepoint (grapheme cluster) where the pipeline
  controls ordering, **not** by UTF-16 code unit.
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

- Static frontend assets are served from `g0v/moedict-app` gh-pages, not directly
  from `moedict-webkit`.
- Pack data is consumed through the same paths as `moedict.tw`.

## Trust boundaries

The following are explicitly **not** verified by LemmaScript and are covered by
property tests and golden-output regression tests:

- JavaScript `RegExp` behavior in LTM replacement and regex generation.
- `JSON.stringify` key ordering and escaping.
- File-system I/O and APFS/NFD filename handling.
- Audio-map heuristics for Mandarin `audio_id` injection.

## Known differences from legacy output

1. **`a/index.json` / `a/xref.json`** — not yet produced by `bun run pack`. Legacy
   index comes from the full title list; xref comes from translation-side data.
   Golden tests skip these paths until the generators are ported.
2. **Special `@*.json` / `=*.json` entry files** under `a/` — these are inputs to
   `special2pack` (and category dumps), not outputs of the core pack run. The
   pipeline writes aggregated `pack/@.txt` and `pack/=.txt` when those inputs
   are present under `outputDir/a/`.
3. **Payload key order** — the port uses `canonicalJson` (sorted object keys).
   Legacy LiveScript/V8 `JSON.stringify` preserves insertion order. Byte-for-byte
   golden diffs on entry payloads may fail until either the port matches insertion
   order or fixtures are regenerated from the port.
4. **Translations / audio_id** — require `dict-revised-translated.json` and
   `dict-concised.audio.json`. Raw `dict-revised.json` packs without those fields.
5. **PUA-free processed data (policy)** — pack output must not contain Private
   Use Area codepoints. Two layers:
   - **`IDS2UNI`** maps known IDS to assigned Unihan (shared by prefix+autolink):
     `⿰𧾷百`→U+2C9B0 𬦰, `⿸疒哥`→U+308FB 𰣻, `⿰亻恩`→U+2B8C6 𫣆,
     `⿰虫念`→U+2C816 𬠖, `⿺皮卜`→U+31C7F 𱱿.
   - **`assertNoPua`** runs after `{[hex]}` expansion and before `PackWriter`
     writes. Unmapped MOE/source PUA in definitions (e.g. plane‑15 glyphs still
     present in `dict-revised.json`) **fail the pack** with title context so
     mappings can be curated. No silent strip/`□` substitution.

   Font coverage for Ext C/E/G/H is **render-side**. Fixtures from the pre-Unihan
   pack tree may still show PUA/`𬦀` until regenerated from a PUA-free source.
6. **Phase 5 (`moedict-webkit` retirement) is blocked** until a full
   `MOEDICT_PACK_INPUT` golden pass and downstream staging are green. Do not
   delete pack Makefile targets, close Dependabot PRs as “retired”, or archive
   the repo while rollback still depends on the legacy toolchain.
