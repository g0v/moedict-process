# Historical Scripts (歷代書體) Mirror Design

## Problem

`moedict.tw`'s `StrokeAnimation.tsx` fetches `https://bs.chinese-linguipedia.org/api/web/word/{char}` directly from the browser on every 歷代書體 click and hotlinks the returned GIF URLs. This breaks offline, depends on a third party's uptime (upstream has returned transient HTTP 526 invalid-cert errors — see g0v/moedict-webkit#279, #236, #135), and `SCRIPT_TYPES` only lists 6 of the 7 script types the API actually returns (missing 甲骨文). `About.tsx` documents the intended model as "歷代書體以內嵌網頁方式，連至中華文化總會網站" (embed/link out), which the current hotlink implementation only loosely honors and which cannot deliver the offline parity variants sidecar work already established as mandatory for this project.

## Source and license

- Source: 中華語文知識庫's 漢字源流彙編 (`chinese-linguipedia.org`, operated by 中華文化總會), covering exactly the **3,000 常用漢字** the about page names — not moedict's full ~11,217-headword Mandarin index. Confirmed empirically: a scan seeded from the site's own `/api/web/source` catalog returns a 100.0% hit rate across all 3,000 catalog entries; a scan seeded from moedict's broader headword index returns ~0% outside that catalog.
- API: `GET https://bs.chinese-linguipedia.org/api/web/source` (catalog of all 3,000 covered characters, grouped by radical) and `GET https://bs.chinese-linguipedia.org/api/web/word/{char}` (per-character `strokes[]`: 楷書/篆書/隸書/行書/草書/金文/甲骨文, each with `gif`+`jpg`; and `sources[]`: historical-form citations with PNG images).
- License: `copyright.html`'s default clause is all-rights-reserved ("若未特別註明，版權均屬中華文化總會或其合作單位所有…非經授權不得重製…"), with one named carve-out (NPM/故宮 Open Data images for banner/background/academic-term categories only — not this dataset). The page also embeds a bare, unlinked `images/cc.svg` whose SVG source is `sodipodi:docname="by-nc-sa.svg"` (the canonical CC BY-NC-SA badge shape), with no `<a href>` to a deed and no caption text scoping it. Read together with 中華文化總會 already licensing its 中華語文大辭典 dataset to moedict.tw under `CC BY-NC-ND 3.0 臺灣` (see `About.tsx`), the badge is treated here as the *likely* intended license for the 漢字源流彙編 dataset by analogy.
- **This is an inference from an unlinked, unscoped badge, not a confirmed grant.** `licenseStatus: inferred-from-unlinked-site-badge-not-confirmed-in-writing` in both `provenance/source.json` and `source-catalog/source.json`. **The archive must not be published or labeled as "CC BY-NC-SA" without qualification** until 中華文化總會 confirms the grant and its scope in writing (their own copyright page invites exactly this: "如果您想要洽談內容授權或其他合作事宜，也請以電子郵件聯繫我們") — or until an explicit, informed accepted-risk decision is made with this exact evidence in view.
- Provenance capture: `copyright.html` + SHA-256, the CC badge itself (`cc-badge.svg` + SHA-256, not just a description of it — confirms its shape is `by-nc-sa.svg` without confirming its scope), and `source.json` recording the API base, fetch timestamps, and this full license reasoning — committed alongside the manifest so the inference is auditable and revisitable, not asserted from memory.

## Corpus measurement

Full metadata scan of all 3,000 catalog characters (100% hit rate, 0 failures):

| Asset | Count | Avg size (measured) | Total (unoptimized) |
|---|---|---|---|
| Stroke GIFs (7 script types × ~2.27 avg per char due to some chars missing types) | 15,884 | 397,624 B | 6,023 MB |
| Stroke JPGs (static preview per script type) | 15,884 | 19,758 B | 299 MB |
| Source PNGs (historical-form citation images) | 14,764 | 4,619 B | 65 MB |
| **Total** | **46,532** | — | **6.24 GB** |

For scale context: moedict-data's largest currently-committed file is `dict-revised_bkup.json` at 75 MB. 6.24 GB of raw media is roughly 80x that and unsuitable for direct git commit regardless of licensing.

## Lossless optimization

The stroke GIFs are unoptimized progressive-stroke animations (each frame close to a full independent redraw with its own LZW-coded palette, despite most pixels repeating frame-to-frame) — ideal targets for lossless re-encoding:

| Tool | Output | Measured ratio (sample) |
|---|---|---|
| `gif2webp -min_size -m 6 -mt` | animated WebP | **9.1%** of original (best) |
| `gifsicle --optimize=3 --lossy=0` | re-optimized GIF | 12.4% of original |
| `jpegtran -optimize -copy none` | JPEG | 63.8% of original |
| `oxipng -o max --strip safe` | PNG | 57.5% of original |

`gif2webp` is selected for stroke animations. Losslessness was verified, not assumed: decoded both the source GIF and the resulting WebP to disposal-composited RGBA frames (matching the actual rendered output, not raw per-frame deltas), merged only consecutive *duplicate* composited frames in the source (summing their delays — the encoder-side optimization gif2webp itself performs), and confirmed per-frame pixel hashes, per-frame delays, total duration, canvas size, and `webpmux -info`'s literal `compression: lossless` on every frame all match across 18 diverse samples (single- and multi-hundred-KB files, all 7 script types). The one apparent mismatch — PIL reporting GIF loop as `None` vs WebP `Loop Count: 1` — is not a regression: the source GIF has no `NETSCAPE2.0` loop-extension block at all (GIF89a default = play once), and WebP's ANIM chunk makes that implicit "play once" explicit as `loop_count=1`; both play the animation exactly once.

Applying all three optimizers to the full projected corpus:

| Asset | Before | After | Ratio |
|---|---|---|---|
| GIF → WebP | 6,023 MB | 548 MB | 9.1% |
| JPG | 299 MB | 191 MB | 63.8% |
| PNG | 65 MB | 37 MB | 57.5% |
| **Total** | **6.24 GB** | **776 MB** | **12.2%** (87.8% reduction) |

776 MB is still too many small objects for git (46,532 loose blobs bloats pack files independent of total bytes) but is a reasonable size for a single content-addressed archive.

## Acquisition pipeline

`mirror.ts` (staged at `/tmp/moedict-linguipedia-historical-20260711/`, to be relocated into `moedict-data` tooling): fetches each unique media URL once, computes `originalSha256` over the exact fetched bytes (provenance — proves the optimized artifact is a lossless derivative of a specific, checksummed upstream response), re-encodes losslessly per the table above, computes `optimizedSha256` over the shipped bytes, and appends one manifest row per asset (`mirror-manifest.ndjson`, resumable — a rerun rehashes every prior `status:"ok"` row's local file against its recorded `optimizedSha256` through a bounded pool before trusting it as done, and tolerates a malformed/truncated trailing manifest line instead of discarding all prior progress). Smoke-tested against 5 characters (108 assets, 0 failures, 86.2% size reduction, checksums reproduced exactly).

**Citation-embedded inline images**: 451 of the 14,764 source-form `citation` strings embed their own `<img src="…/word_sources/source_img/…">` tag for an archaic/unencodable glyph inline in the citation prose (e.g. 丞's 金文 citation is `集成5318( <img src="…A00016j001a001.png"/>丞卣)`), separate from the form's own `f.image`. These are enumerated as their own `citation-inline-png` mirror jobs (466 unique URLs) so the compiled sidecar's citation HTML never depends on a live fetch to the upstream host. This was caught only after the main 46,531-URL acquisition pass was already running (its in-memory job list predates the fix), so acquisition is two passes: the original pass, then a resumable rerun of the same `mirror.ts` that fetches only the net-new 466 URLs (everything else is skipped via the checksum-verified resume set) — bringing the total to 46,997 unique assets.


## Ownership and packaging boundary

Following the variants sidecar precedent:

- **`moedict-data`** owns the pinned input: `historical-records.ndjson` (metadata scan) and the optimized media corpus, published as a single checksummed archive (e.g. `historical-scripts-v1.tar.zst`) attached to a GitHub Release — not committed as loose files — plus `provenance/` (copyright.html + sha256, cc.svg + sha256, source.json with the license reasoning above). `licenseStatus: cc-by-nc-sa-inferred-from-site-badge` until confirmed.
- **`moedict-process`** owns `src/pack/historical-scripts.ts` (implemented, tested, wired into `packLang()` behind an optional `historicalScriptsInputDir` / `MOEDICT_HISTORICAL_SCRIPTS_INPUT`, matching `src/pack/variants.ts`'s pattern exactly): consumes **two** pinned, no-network inputs — `historical-records.ndjson` (the relationship graph of record ↔ script type ↔ form exactly as scraped, authoritative for *what points at what*) and `mirror-manifest.ndjson` (a URL-deduplicated fetch ledger, authoritative only for *where a given URL landed locally*) — and emits `a/historical-scripts/index.json` mapping each covered headword's own codepoint to `{ strokes: [{ key, webp, jpg }], sources: [{ key, forms: [{ image, citation }] }] }`, with `webp`/`jpg`/`image` as content-addressed relative paths (never full upstream URLs). The two-input split matters because a media asset can legitimately be referenced by more than one character (e.g. 戌 and 酉 both cite the same 說文古文 form image for 篆文) — the manifest's URL-keyed `seen` dedup means only one manifest row exists per shared URL, so grouping by manifest rows instead of by records would silently drop every reference after the first. Strokes sort by the upstream API's own key order (楷書…甲骨文); sources sort oldest→newest citation order (甲骨文、金文、戰國文字、篆文、隸書、楷書, matching the site's own "漢字源流彙編" description) since the source-form key set is disjoint from the stroke key set (includes 戰國文字/篆文, excludes 行書/草書). Every `<img src>` a citation still embeds is rewritten to its mirrored local path via a single targeted regex extraction per citation (not a scan of the whole URL→path map, which is O(rows × manifest size) at this corpus's ~47k-row scale); any record-referenced asset with no successful mirror entry is a hard compile error rather than a silently dropped or upstream-hotlinked entry — `assertNoPua` cannot see through an `<img src>` HTML attribute, so this has to be enforced at compile time. `assertNoPua` still gates the final `canonicalJson` output as a second, independent check.
- **`moedict.tw`** serves the archive's contents from R2 under the existing `ASSET_BASE_URL` pattern already used for `jquery.strokeWords.js` etc. (`fetchR2Endpoint()` in `StrokeAnimation.tsx`), giving the feature the same offline/service-worker parity as every other static asset. The 3,000/11,217 coverage gap is real and permanent (漢字源流彙編 only covers common characters): the frontend must render an explicit "此字無歷代書體資料" state for uncovered headwords rather than erroring or silently hiding the button.

## Frontend changes required (moedict.tw, follow-up)

- Replace the direct `bs.chinese-linguipedia.org` fetch + hotlinked `<img src>` in `StrokeAnimation.tsx` with a lookup against the new `a/historical-scripts/index.json` sidecar and R2-served assets.
- Add the missing 甲骨文 to `SCRIPT_TYPES` (data already carries all 7; the component only renders 6).
- Render the CC BY-NC-SA attribution inline on the 歷代書體 panel itself (not only in a separate About page), consistent with the SA clause and the existing 張炳煌/郭晉銓 credit line.
- Handle the no-coverage case for the ~8,217 headwords outside the 3,000-character catalog.

## Verification performed

- 100.0% hit rate across all 3,000 source-catalog characters (0 failures) — confirms catalog-vs-broad-index coverage boundary.
- Exact media counts from the completed scan: 15,884 GIF + 15,884 JPG + 14,764 PNG (source-form) + 466 citation-inline PNG = 46,997 unique URLs (of which exactly one — a `篆文`/說文古文 form image — is legitimately shared by two different characters, 戌 and 酉; the manifest's URL-keyed dedup means this asset has only one manifest row, which is why the compiler must build the relationship graph from `historical-records.ndjson`, not from `mirror-manifest.ndjson`).
- Lossless re-encoding verified via disposal-composited RGBA frame hashes + per-frame delay + total duration + canvas size + `webpmux -info` compression field, across 18 samples spanning all 7 script types and both small (~68 KB) and large (~810 KB) originals.
- `mirror.ts` smoke-tested end-to-end (fetch → checksum → optimize → checksum → manifest) on a 5-character / 108-asset slice and separately on a citation-inline-image case (丞): 0 failures, checksums reproduced deterministically on rerun.
- `historical-scripts.ts`: 13 unit tests (stroke resolution/ordering, citation rewrite, shared-media-asset preservation across two different characters, source-script chronological ordering, `found: false` skip, fail-loud on unmapped/failed stroke and citation assets, multi-scalar rejection, deterministic key ordering, no-PUA output, missing-records-file and missing-manifest errors) — all passing, including a targeted real-data check (a standalone mirror run against just 戌/酉's real records and citations, confirming both characters keep their shared 說文古文 form after the fix). Full test suite 245 pass / 0 fail. `tsc -b`, `eslint .`, and `lsc check --backend=dafny` all clean.
- Citation-rewrite performance validated at corpus scale: a synthetic 45,000-row / 3,000-character manifest (matching the real corpus's shape) compiles in 53 ms after switching from a whole-map scan per citation to a targeted per-citation regex extraction + `Map.get`.
- Full acquisition run (46,531 URLs, pre-citation-inline-fix) launched in background; a second resumable pass will backfill the 466 citation-inline URLs once the first completes.
