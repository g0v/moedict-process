# Legacy Golden-Output Fixtures

This directory contains a subset of the moedict pack output used as the oracle
for `bun run pack` golden tests.

## Provenance

- Source: `~/w/moedict.tw/data/dictionary/` (the built output consumed by moedict.tw)
- Captured: 2026-07-09
- This is **not** a fresh `make full` run. The legacy toolchain (`lsc`, `perl`, `python2`) is not installed in this environment, so we cannot reproduce the legacy build directly. These fixtures represent the closest available legacy-equivalent output.

## Scope

Only a small, manifest-based subset is committed to the repo to avoid vendoring
~84 MB of pack bucket files without `git-lfs`:

- `a/` — full Mandarin output tree (entry JSONs, `index.json`, `xref.json`, `=*.json`, `@*.json`)
- `h/` — full Hakka output tree (small)
- `t/index.json` — 臺語 index only
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
