# Historical Scripts WebP Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the complete historical-scripts mirror so every successful raster asset is a lossless WebP while preserving pixels, animation timing, provenance, citations, and offline compilation.

**Architecture:** The temporary acquisition tool remains the single owner of source-format sniffing, WebP conversion, output naming, and manifest checksums. The process compiler adds a WebP-path gate and keeps semantic fields (`webp`, `preview`, and `image`) unchanged. A fresh generation is mirrored and packaged; the old mixed-format generation is never mutated in place.

**Tech Stack:** Bun/TypeScript, `gif2webp`, `cwebp`, `ffmpeg` for the confirmed BMP fallback, `dwebp`, Pillow/libwebp for pixel audits, tar/zstd, Bun tests, TypeScript, ESLint, Dafny/LemmaScript.

## Global Constraints

- Every successful mirror output MUST end in `.webp`.
- Still-image conversion MUST use `cwebp -lossless -m 6 -exact`.
- GIF animation conversion MUST remain `gif2webp -min_size -m 6 -mt`.
- BMP handling MUST be gated on magic bytes `42 4D`; other unrecognized formats MUST hard-fail.
- No lossy recompression, resizing, frame dropping, palette reduction, or dual-format output.
- `historical-records.ndjson` source fields remain unchanged (`gif`, `jpg`, and `image`).
- The exact 鼓 override remains `集成6500(鼓\uF4BD作父辛觶)` → `集成6500(鼓𦎫作父辛觶)`.
- Builds consume pinned local inputs only; no network access is added to `moedict-process`.
- The release archive remains unpublished until written licensing/scope confirmation or an explicit informed-risk decision.
- Do not stage or commit the pre-existing `/Users/au/w/moedict-data/dict-revised-translated.json` user file.

---

### Task 1: Add compiler WebP-path gate and regression tests

**Files:**
- Modify: `src/pack/historical-scripts.ts:13-30,90-156` — rename mirror-role vocabulary and enforce WebP local paths.
- Modify: `tests/pack/historical-scripts.test.ts:22-72,121-230` — update fixture paths and add rejection/coverage tests.

**Interfaces:**
- Consumes: Existing `MirrorManifestRow` values from `mirror-manifest.ndjson`.
- Produces: `compileHistoricalScripts()` that rejects any successful manifest path not ending in `.webp`, while preserving `strokes[].webp`, `strokes[].preview`, and `sources[].forms[].image` semantics.

- [ ] **Step 1: Write failing tests for the new path contract.**

Update the fixture manifest paths from `.jpg`/`.png` to `.webp`, update expected compiler output accordingly, and add:

```ts
it('rejects a successful manifest asset that is not WebP', () => {
  const nonWebpManifest = manifestFixture
    .map((line) => line.replace('media/1/source1.webp', 'media/1/source1.png'))
    .join('\n');
  expect(() => compileHistoricalScripts(recordsText, nonWebpManifest)).toThrow('must end in .webp');
});

it('emits only WebP paths for stroke previews, source forms, and inline citation images', () => {
  const output = compileHistoricalScripts(recordsText, manifestText);
  const paths = [
    ...Object.values(output).flatMap((entry) => entry.strokes.flatMap((stroke) => Object.values(stroke))),
    ...Object.values(output).flatMap((entry) => entry.sources.flatMap((source) => source.forms.flatMap((form) => [form.image]))),
  ].filter((value): value is string => typeof value === 'string');
  expect(paths.every((value) => value.endsWith('.webp'))).toBe(true);
});
```

Use `.webp` fixture paths for `kai`, `jia`, `source1`, and `inline1` so the second test exercises every emitted asset class. Keep the input citation HTML unchanged except for its rewritten local URL.

- [ ] **Step 2: Run the focused test to verify the new assertions fail.**

Run:

```bash
bun test tests/pack/historical-scripts.test.ts
```

Expected: failure because the compiler currently accepts `.jpg`/`.png` manifest paths and does not enforce the WebP-only contract.

- [ ] **Step 3: Implement the minimal compiler gate.**

Add a private helper near `resolveLocalPath()`:

```ts
function assertWebpLocalPath(localPath: string, context: string): string {
  if (!localPath.endsWith('.webp')) {
    throw new Error(`Historical-scripts ${context} mirror path must end in .webp: ${localPath}`);
  }
  return localPath;
}
```

Call it only after a successful manifest row resolves a local path, before returning it from `resolveLocalPath()`. Rename `MirrorRole` values to `stroke-animation`, `stroke-preview`, `source-form`, and `citation-inline`; keep `HistoricalRecordStroke.jpg` unchanged. Update the `StrokeEntry.preview` comment to state that the field always points to a WebP path after this generation cutover.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run:

```bash
bun test tests/pack/historical-scripts.test.ts
```

Expected: all historical-scripts tests pass, including the new non-WebP rejection and all-WebP output tests.

- [ ] **Step 5: Commit the compiler contract and tests.**

```bash
git add src/pack/historical-scripts.ts tests/pack/historical-scripts.test.ts
git commit -m "test: require WebP historical mirror paths"
```

---

### Task 2: Convert every mirror role to WebP

**Files:**
- Modify: `/tmp/moedict-linguipedia-historical-20260711/mirror.ts:6-32,47-95,97-99` — source-role vocabulary, WebP output naming, and still-image optimizer.
- Test: `/tmp/moedict-linguipedia-historical-20260711/webp-cutover-smoke.ts` — create a disposable conversion smoke test for JPEG, PNG, and BMP fixtures.

**Interfaces:**
- Consumes: A fetched source byte buffer and `Job.role`.
- Produces: `{ tool, ok, localRel }` where every successful `localRel` ends in `.webp`.

- [ ] **Step 1: Add a failing disposable conversion smoke test.**

Create a temporary script that invokes the mirror optimizer against three local fixtures (one real JPEG, one PNG, and the known BMP payload), decodes each emitted WebP with `dwebp`, and compares RGBA pixels with Pillow. The test must assert:

```text
JPEG output suffix: .webp
PNG output suffix: .webp
BMP output suffix: .webp
JPEG decoded pixels: identical
PNG decoded RGBA pixels: identical
BMP decoded pixels: identical
```

Run it before modifying `mirror.ts`; expected failure because JPEG/PNG currently emit `.jpg`/`.png` and the optimizer has no unified WebP path.

- [ ] **Step 2: Make output naming and roles WebP-only.**

Change the acquisition tool’s role type to:

```ts
type Role = 'stroke-animation' | 'stroke-preview' | 'source-form' | 'citation-inline';
```

Make `outPathFor()` always receive/use `webp` as its output extension. Keep source extension selection for temporary downloads based on the upstream URL/role so JPEG, PNG, GIF, and BMP bytes remain distinguishable during validation.
Before the smoke script imports the optimizer, make the acquisition module testable without starting a full mirror run: export `optimize` and `outPathFor`, and replace the unconditional `await main();` with `if (import.meta.main) await main();`. The smoke script imports these exports, writes fixtures under a temporary directory, calls `optimize(job, tmpFile, outDir)`, and removes the directory in a `finally` block.

- [ ] **Step 3: Replace static optimizers with lossless WebP.**

Use these exact commands:

```ts
// JPEG and PNG:
['cwebp', '-lossless', '-m', '6', '-exact', tmpFile, '-o', outAbs]

// GIF animation:
['gif2webp', '-min_size', '-m', '6', '-mt', tmpFile, '-o', outAbs]
```

For a `stroke-preview` payload:

```ts
const isRealJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
const isBmp = bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
```

- If JPEG: invoke `cwebp -lossless -m 6 -exact`.
- If BMP: convert to a temporary PNG with `ffmpeg -y -loglevel error -i`, then invoke `cwebp -lossless -m 6 -exact` on that PNG, remove the temporary PNG, and record the tool as BMP→PNG→WebP lossless.
- Otherwise: return a hard `format-sniff` failure.

For `source-form` and `citation-inline`, invoke `cwebp -lossless -m 6 -exact` directly on the PNG bytes. All successful manifest rows record `.webp` paths and the exact conversion tool string.

- [ ] **Step 4: Run the smoke test to verify it passes.**

Run:

```bash
bun /tmp/moedict-linguipedia-historical-20260711/webp-cutover-smoke.ts
```

Expected: all three formats emit `.webp`, and decoded RGBA pixels match exactly.

- [ ] **Step 5: Commit the durable compiler-side changes.**

The temporary acquisition script is an input-side release tool and is not committed to `moedict-process`. Commit only the process compiler/tests from Task 1; retain the exact mirror script in the release staging workspace and include its command description in release metadata.

---

### Task 3: Rebuild and audit the complete WebP mirror

**Files:**
- Create: `/tmp/moedict-linguipedia-historical-20260711/source-catalog-webp-v2/` — fresh mirror output and manifest.
- Create: `/tmp/moedict-linguipedia-historical-20260711/webp-audit.py` — disposable full-corpus media audit.

**Interfaces:**
- Consumes: Existing pinned `historical-records.ndjson`, `known-gaps.json`, `citation-overrides.json`, and provenance.
- Produces: A clean WebP-only source catalog with append-only manifest and 46,934 successful assets / 63 reviewed failures expected from the existing acquisition evidence.

- [ ] **Step 1: Stage a fresh input directory without copying old media.**

Copy only records, known gaps, citation overrides/provenance, source metadata, and provenance into the new directory. Do not copy the existing `media/`, `mirror-manifest.ndjson`, or `mirror-state.json`; stale `.jpg`/`.png` files must not survive.

- [ ] **Step 2: Run the updated mirror from scratch.**

Run:

```bash
MIRROR_CONCURRENCY=6 bun /tmp/moedict-linguipedia-historical-20260711/mirror.ts /tmp/moedict-linguipedia-historical-20260711/source-catalog-webp-v2
```

Expected: all successful local paths end in `.webp`; the known 63 permanent failures remain failed rather than becoming successful placeholder assets.

- [ ] **Step 3: Audit every latest manifest row.**

The audit must latest-row-wins deduplicate by URL, then assert:

```text
manifest parses completely
46,997 unique URLs
46,934 latest status="ok"
63 latest status="failed"
0 missing successful files
0 successful size mismatches
0 successful optimizedSha256 mismatches
0 successful local paths ending in .jpg or .png
```

For every successful row, compare filesystem size to `optimizedBytes` and stream SHA-256 against `optimizedSha256`. Failed rows are excluded from required-file validation.

- [ ] **Step 4: Run full real-data pixel spot checks.**

For the 16 known BMP-derived assets, compare decoded source BMP RGBA pixels with decoded output WebP RGBA pixels. For stratified JPEG and PNG samples, decode both input and output and compare dimensions and RGBA pixels. Record the result in the release audit output; do not add lossy fallbacks.

- [ ] **Step 5: Compile the fresh catalog offline.**

Run:

```bash
rm -rf /tmp/moedict-linguipedia-historical-20260711/packaged-output-webp-v2
bun -e '
import { writeHistoricalScriptsIndex } from "/Users/au/w/moedict-process/src/pack/historical-scripts.ts";
writeHistoricalScriptsIndex(
  "/tmp/moedict-linguipedia-historical-20260711/source-catalog-webp-v2",
  "/tmp/moedict-linguipedia-historical-20260711/packaged-output-webp-v2",
);
'
```

Expected: all 3,000 characters compile; `鼓` emits `集成6500(鼓𦎫作父辛觶)`; all `strokes[].preview`, `strokes[].webp`, and `sources[].forms[].image` paths end in `.webp`; canonical output contains no literal PUA and no upstream URL.

---

### Task 4: Update docs, package metadata, and archive generation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-historical-scripts-mirror-design.md` — record WebP-only output and final verification counts.
- Create: `/Users/au/w/moedict-data/releases/historical-scripts-v2.json` — release metadata.
- Create: `/Users/au/w/moedict-data/releases/historical-scripts-v2.tar.zst.sha256` — basename-only archive checksum.
- Modify: `/Users/au/w/moedict-data/.gitignore` only if needed — continue ignoring `releases/*.tar.zst`.

**Interfaces:**
- Consumes: The fresh WebP source catalog from Task 3.
- Produces: A clean, metadata-free, generation-qualified archive ready for later license-approved attachment.

- [ ] **Step 1: Update the historical mirror design document.**

Replace the mixed-extension statements with the measured WebP-only contract. Record the final counts, exact WebP conversion commands, the exact 鼓 override, and the fact that the archive remains unpublished pending the license gate.

- [ ] **Step 2: Create archive metadata before compression.**

Write `release.json` inside the archive with:

```json
{
  "name": "moedict-historical-scripts",
  "version": "v2",
  "records": "historical-records.ndjson",
  "mediaManifest": "mirror-manifest.ndjson",
  "knownGaps": "known-gaps.json",
  "citationOverrides": "citation-overrides.json",
  "allSuccessfulOutputs": ".webp"
}
```

Retain provenance and citation-override evidence in the archive.

- [ ] **Step 3: Build a reproducible archive.**

Run with macOS metadata disabled:

```bash
COPYFILE_DISABLE=1 tar -C /tmp/moedict-linguipedia-historical-20260711/source-catalog-webp-v2 \
  -cf /tmp/moedict-linguipedia-historical-20260711/historical-scripts-v2.tar \
  historical-records.ndjson mirror-manifest.ndjson known-gaps.json \
  citation-overrides.json citation-overrides-provenance.json source.json release.json media
COPYFILE_DISABLE=1 tar -C /tmp/moedict-linguipedia-historical-20260711 \
  -rf /tmp/moedict-linguipedia-historical-20260711/historical-scripts-v2.tar provenance
zstd -T0 -19 -f /tmp/moedict-linguipedia-historical-20260711/historical-scripts-v2.tar \
  -o /Users/au/w/moedict-data/releases/historical-scripts-v2.tar.zst
(cd /Users/au/w/moedict-data/releases && sha256sum historical-scripts-v2.tar.zst > historical-scripts-v2.tar.zst.sha256)
```

- [ ] **Step 4: Extract the archive and repeat the audit.**

Extract only the new archive into a clean directory, verify its checksum, rerun the complete media audit, and compile from the extracted directory. The archive itself is not considered verified until the extracted copy passes all Task 3 checks.

- [ ] **Step 5: Commit metadata without committing the payload.**

```bash
cd /Users/au/w/moedict-data
git add releases/historical-scripts-v2.json releases/historical-scripts-v2.tar.zst.sha256 .gitignore
git commit -m "data: stage WebP-only historical scripts v2 metadata"
```

Do not use `git add -A`; leave the pre-existing `dict-revised-translated.json` untouched. Do not publish or upload the archive until the license gate is separately satisfied.

---

### Task 5: Run repository validation and final release handoff

**Files:**
- Test: `tests/pack/historical-scripts.test.ts`
- Verify: `/tmp/moedict-linguipedia-historical-20260711/source-catalog-webp-v2`
- Verify: `/Users/au/w/moedict-data/releases/historical-scripts-v2.tar.zst`

- [ ] **Step 1: Run focused compiler tests.**

```bash
bun test tests/pack/historical-scripts.test.ts
```

Expected: all focused tests pass, including the WebP-path rejection and output-path coverage.

- [ ] **Step 2: Run repository validation.**

```bash
bun test
bun run lint
bun run typecheck
bun run verify
```

Expected: zero test failures, clean ESLint, clean TypeScript, and zero Dafny errors.

- [ ] **Step 3: Verify the release metadata/checksum state.**

```bash
(cd /Users/au/w/moedict-data/releases && sha256sum -c historical-scripts-v2.tar.zst.sha256)
```

Expected: `historical-scripts-v2.tar.zst: OK`.

- [ ] **Step 4: Record the final handoff.**

Report the measured WebP media bytes, archive bytes, successful/failed asset counts, compiler counts, PUA/upstream-reference scan, and validation output. State explicitly that the archive remains staged and unpublished until license authorization.
