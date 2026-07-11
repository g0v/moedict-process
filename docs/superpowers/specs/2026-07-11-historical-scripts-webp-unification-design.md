# Historical Scripts WebP Unification Design

## Goal

Make every mirrored historical-scripts raster asset a lossless WebP file while preserving the source snapshot, citation provenance, decoded pixels, animation timing, and offline compiler contract.

The cutover covers all successful mirror outputs:

- stroke GIF animations → animated WebP;
- stroke JPEG previews → still lossless WebP;
- BMP files served at a JPEG URL → still lossless WebP;
- source-form PNGs → still lossless WebP;
- citation-inline PNGs → still lossless WebP.

The source records remain authoritative and unchanged. Their upstream-shaped fields (`gif`, `jpg`, and `image`) are not renamed. Only mirrored output paths and manifest role vocabulary change.

## Non-goals

- No lossy recompression, resizing, palette reduction, or frame dropping.
- No global PUA substitution or citation rewriting beyond the already reviewed exact override for 鼓.
- No dual-format archive or browser format negotiation in this cutover.
- No change to the semantic sidecar fields: `strokes[].webp`, `strokes[].preview`, and `sources[].forms[].image` remain semantic names. Every successful path they reference ends in `.webp` after the cutover.
- No change to the live frontend in this process-side change; the existing local index/R2 consumer continues to resolve relative paths.

## Acquisition contract

`mirror.ts` remains the single owner of output naming, format validation, optimization, checksums, and manifest rows. The mirror is rebuilt into a fresh output directory; the old JPEG/PNG media tree is never mixed with the new WebP tree.

### Source-role vocabulary

Rename the manifest role values to describe the source relationship rather than the output extension:

- `stroke-animation` — upstream `gif` field;
- `stroke-preview` — upstream `jpg` field, including BMP mislabeled as `.jpg`;
- `source-form` — upstream source-form `image` field;
- `citation-inline` — image URL embedded inside citation HTML.

`HistoricalRecord` keeps the upstream field names because the NDJSON snapshot is a faithful acquisition record. The role values are mirror metadata and may change between archive generations.

### Output naming

`outPathFor()` preserves the upstream URL pathname and filename stem under `media/`, but always emits the `.webp` extension:

```text
media/<upstream-path>/<stem>.webp
```

Every successful manifest row MUST have a non-empty `localPath` ending in `.webp`. Failed rows retain an empty local path and are handled through the existing reviewed `known-gaps.json` mechanism.

### Optimizers

- `stroke-animation`: `gif2webp -min_size -m 6 -mt`.
- `stroke-preview` with JPEG magic `FF D8`: `cwebp -lossless -m 6 -exact`.
- `stroke-preview` with BMP magic `42 4D`: convert the fetched BMP to a temporary PNG with `ffmpeg`, then run `cwebp -lossless -m 6 -exact`; remove the temporary PNG. The BMP branch is gated specifically on `42 4D`; any other unrecognized non-JPEG format hard-fails.
- `source-form` and `citation-inline`: `cwebp -lossless -m 6 -exact`.

`-lossless` guarantees decoded pixel preservation. `-exact` preserves RGB values beneath transparent pixels as well as visible RGBA output. The manifest continues recording `originalSha256` for the fetched upstream bytes and `optimizedSha256` for the shipped WebP bytes; JPEG-to-WebP does not claim byte-identical JPEG reconstruction.

The `losslessTool` field records the exact command family, including the BMP temporary conversion path, so the archive remains auditable.

## Compiler contract

`src/pack/historical-scripts.ts` continues to consume `historical-records.ndjson`, `mirror-manifest.ndjson`, `known-gaps.json`, and `citation-overrides.json` without network access.

The compiler behavior remains semantic rather than extension-specific:

- stroke animation URLs resolve to `strokes[].webp`;
- stroke preview URLs resolve to `strokes[].preview`;
- source-form and citation-inline URLs resolve to `sources[].forms[].image`;
- all emitted paths are local relative paths ending in `.webp`;
- canonical ordering, citation rewriting, PUA rejection, known-gap validation, and citation-override self-auditing remain unchanged.

The existing exact override remains part of the pinned input:

```json
{
  "集成6500(鼓\uF4BD作父辛觶)": "集成6500(鼓𦎫作父辛觶)"
}
```

## Rebuild and publication

This is a clean generation cutover, not an in-place migration:

1. Rebuild the complete mirror from the pinned records into a new directory.
2. Confirm all successful media paths are `.webp` and no stale `.jpg`/`.png` files are referenced.
3. Compile the index from that fresh input and run the full media hash audit.
4. Package a new generation-qualified archive (for example, `historical-scripts-v2.tar.zst`) with records, WebP media, manifest, known gaps, citation overrides, provenance, and archive checksum.
5. Keep the archive unpublished until the existing written-license/scope gate is satisfied.

The archive is a release artifact, not a Git blob. Runtime consumers receive the extracted index and individual R2 assets, not the archive itself.

## Tests and acceptance criteria

Add focused regression coverage for the conversion boundary:

- JPEG → WebP decoded RGBA pixels are identical;
- PNG → WebP decoded RGBA pixels and alpha are identical;
- transparent PNG RGB values remain identical with `-exact`;
- BMP mislabeled as JPEG → WebP decoded pixels are identical;
- unknown non-JPEG/non-BMP stroke-preview input is rejected;
- successful mirror rows all use `.webp` paths;
- compiler output resolves preview, source-form, and citation-inline paths ending in `.webp`;
- reviewed failed rows remain excluded from required-file validation.

For the real rebuilt archive:

- all 46,934 latest successful assets exist;
- every successful file size equals `optimizedBytes`;
- every successful SHA-256 equals `optimizedSha256`;
- the 63 reviewed failed rows are not required files;
- all 3,000 characters compile offline;
- output contains zero literal PUA codepoints and zero upstream URLs;
- the 鼓 citation emits `集成6500(鼓𦎫作父辛觶)`;
- the full test suite, typecheck, lint, and Dafny verification pass.

## Risks and mitigations

- **WebP output is pixel-lossless but not original-container-byte-identical.** The manifest retains the original fetch hash and source URL; the optimized hash identifies the shipped derivative.
- **A malformed JPEG URL could hide a third format.** Magic-byte sniffing remains strict; only JPEG and confirmed BMP are accepted for `stroke-preview`.
- **The current staged archive uses mixed extensions.** A fresh generation and all-successful-path assertion prevent stale media from surviving the cutover.
- **Static WebP may be larger for individual files.** The full-corpus rebuild measures aggregate size before publication; correctness takes precedence over an assumed size win.
