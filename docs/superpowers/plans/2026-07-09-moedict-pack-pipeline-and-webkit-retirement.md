# moedict Pack Pipeline Port + moedict-webkit Retirement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan spans two repositories; read cross-repo paths relative to a shared parent (`~/w/` in the original workspace).

**Goal:** Port the moedict pack factory (`json2prefix`, `autolink`/`worker`, `link2pack`, plus index/special/pinyin generators) from `g0v/moedict-webkit` (LiveScript/Perl/Python 2) into LemmaScript-annotated TypeScript in `g0v/moedict-process`; then retire the obsolete `moedict-webkit` server/build code and freeze the legacy `moedict.org` static frontend.

**Architecture:**
- Pure, stateless pack models live in `src/pack/*.ts` and carry LemmaScript `//@` specs; the Dafny backend verifies the models it can reach.
- JS `RegExp` execution, `JSON.stringify` formatting, audio-map heuristics, and file-system I/O are explicit **trust boundaries** covered by golden-output and property tests, not by LemmaScript.
- A thin unverified orchestration layer (`src/pack/pipeline.ts`, `src/bin/pack.ts`) reads the canonical JSON produced by `moedict-process parse` (and the language-specific JSONs from `g0v/moedict-data-*`) and writes the same `a/`, `t/`, `h/`, `c/`, `pack/`, `pcck/`, `phck/`, `ptck/`, `index.json`, `xref.json`, `@*.json`, `=*.json`, and `lookup/pinyin/` trees as the legacy pipeline.
- Golden-output regression tests compare the new pipeline to a frozen legacy run, byte-for-byte where possible, with documented exceptions only where the legacy output is nondeterministic or wrong.

**Tech Stack:** Bun, TypeScript, LemmaScript (Dafny backend), `bun:test`, `node:fs`.

## Global Constraints

- All pack algorithms must be ordinary TypeScript annotated with LemmaScript `//@` specs; generated Dafny/Lean artifacts may need proof additions.
- No maintained code in LiveScript, Perl, Python 2, or HFS+ filesystem workarounds.
- `parse` and `pack` must remain distinct subcommands in `moedict-process`.
- Golden-output tests must diff `bun run pack` output against the legacy `moedict-webkit` pipeline output.
- Pack-format contract must be documented for `moedict.tw`, `moedict-app`, and legacy `moedict.org`.
- Obsolete `moedict-webkit` server/frontend build code (`server.ls`, gulp/webpack, ZappaJS, etc.) is removed; the static frontend source is frozen.
- APFS Unicode normalization filename collisions must be handled in code, not by requiring HFS+ partitions.
- PR triage: close Dependabot major bumps for obsolete server/build deps; review/forward-port #315 (`靑`→`青` radical) and #316 (license links).
- Downstream consumers:
  - `moedict.tw` consumes `data/dictionary/{pack,pcck,phck,ptck,a,c,h,t,search-index,translation-data,lookup/pinyin}`.
  - `moedict-app/scripts/prepare-data.sh` copies from `moedict.tw/data/dictionary`.
  - `moedict.org` is served from `g0v/moedict-app` gh-pages; frontend assets originate in `moedict-webkit`.

## File Structure

In `g0v/moedict-process`:

- `src/pack/types.ts` — entry/heteronym shapes used by the pack pipeline.
- `src/pack/codepoint.ts` — Unicode codepoint/grapheme helpers and sorting.
- `src/pack/autolink.ts` — JSON key minification (`grok`), PUA/IDS substitution maps, LTM regex replacement, and legacy escape roundtrip.
- `src/pack/prefix.ts` — prefix-trie construction, `lenToTitles`, `lenToRegex` generation, `abbrevToTitle`.
- `src/pack/bucket.ts` — bucket index from first character, title normalization for filenames.
- `src/pack/serializer.ts` — deterministic JSON serialization matching legacy output.
- `src/pack/io.ts` — unverified file-system trust boundary and output directory layout.
- `src/pack/pipeline.ts` — orchestration: read inputs, run verified models, call I/O.
- `src/pack/special.ts` — special pack/index generation (`=*.json`, `@*.json`, `index.json`, `xref.json`).
- `src/pack/pinyin.ts` — pinyin-token lookup generation.
- `src/bin/pack.ts` — CLI entry for `bun run pack`.
- `tests/pack/` — unit and property tests for verified models; golden-output regression tests.
- `tests/pack/fixtures/legacy/` — frozen output of the legacy `moedict-webkit` pipeline.
- `docs/pack-format-contract.md` — contract for downstream consumers.
- `LemmaScript-files.txt` — list of files passed to `lsc check` / `tools/check.sh dafny`.
- `.github/workflows/lemmascript.yml` — CI for LemmaScript verification.

In `g0v/moedict-webkit`:

- `README.md` and `CLAUDE.md` updated to say the repo is frozen/archived.
- `server.ls`, `gulpfile.ls`, `webpack.config.js`, obsolete `package.json` deps, and `Makefile` server/pack targets removed.
- `index.html`, `index.jade`, `main.ls`, `view.ls`, `sass/`, `fonts/`, `js/`, `fxos/` kept as frozen static-frontend source.
- Untracked `moedict-app/`, `cci-memoir-draft.md`, `cci-memoir-research-notes.md` dealt with (move or add to `.gitignore`) before archive.

## Phase 0: Tooling, Fixtures, and Contract

### Task 0.1: Add LemmaScript toolchain and CI skeleton

**Files:**
- Create: `moedict-process/LemmaScript-files.txt`
- Create: `moedict-process/.github/workflows/lemmascript.yml`
- Modify: `moedict-process/package.json` — add `pack` script and `lemmascript` dev dependency
- Modify: `moedict-process/.gitignore` — ignore `*.dfy.gen`, `*.dfy`, `*.types.lean`, `*.spec.lean`, `*.def.lean`, `*.proof.lean`

**Interfaces:**
- `bun run pack` will eventually run `src/bin/pack.ts`.
- `bun run verify` (new) runs `lsc check --backend=dafny` over `LemmaScript-files.txt`.
- `bun run test` already runs `bun test`.

- [ ] **Step 1: Install LemmaScript and verify it runs**

Run:

```sh
cd moedict-process
npm view lemmascript version      # e.g. 0.5.13
npm install -g lemmascript@0.5.13
lsc --version
```

Expected: `lsc` prints a version (or help); if the exact version is not on npm, clone LemmaScript as a sibling and alias `npx tsx ../LemmaScript/tools/src/lsc.ts`.

- [ ] **Step 2: Add scripts and dependency**

Modify `package.json` (or run `bun add -d lemmascript@0.5.13` and then edit `scripts`):


```json
{
  "name": "moedict-process",
  "version": "2.0.0",
  "description": "教育部重編國語辭典資料處理 (Bun/TypeScript)",
  "type": "module",
  "scripts": {
    "pack": "bun run src/bin/pack.ts",
    "verify": "lsc check --backend=dafny",
    "verify:regen": "lsc regen --backend=dafny",
    "build": "tsc -b --noEmit",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint .",
    "parse": "bun run src/bin/parse.ts",
    "to-sqlite": "bun run src/bin/to-sqlite.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "stryker": "stryker run"
  },
  "dependencies": {
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@stryker-mutator/core": "^8.7.1",
    "@stryker-mutator/typescript-checker": "^8.7.1",
    "@types/bun": "^1.1.14",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint": "^9.18.0",
    "lemmascript": "0.5.13",
    "typescript": "^5.7.3"
  },
  "engines": {
    "bun": ">=1.3.0"
  }
}
```

Pin to the exact version from `npm view lemmascript version` (currently `0.5.13`) and commit the lockfile.

- [ ] **Step 3: Create `LemmaScript-files.txt`**

Create `moedict-process/LemmaScript-files.txt` with initial content:

```text
src/pack/codepoint.ts
src/pack/bucket.ts
src/pack/prefix.ts
```

- [ ] **Step 4: Add CI workflow**

Create `moedict-process/.github/workflows/lemmascript.yml`:

```yaml
name: LemmaScript
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: setup dafny
        uses: dafny-lang/setup-dafny-action@v1
        with:
          dafny-version: '4.9.0'
      - run: npm install -g lemmascript
      - run: bun install
      - run: bun run build
      - run: bun run verify
      - run: bun test
```

- [ ] **Step 5: Ignore generated proof artifacts**

Append to `moedict-process/.gitignore`:

```text
# LemmaScript generated files
*.dfy.gen
*.dfy
*.types.lean
*.spec.lean
*.def.lean
*.proof.lean
```

(Keep only `.ts` source under version control; `.dfy` files are proof additions. The plan intentionally starts with no `.dfy` files and adds them as verification matures.)

- [ ] **Step 6: Run CI skeleton and commit**

Run:

```sh
cd moedict-process
bun install
bun run build
```

Expected: passes (no verified files yet).

```bash
git add package.json LemmaScript-files.txt .github/workflows/lemmascript.yml .gitignore
git commit -m "chore: add LemmaScript toolchain and pack script skeleton"
```

**Acceptance:** `bun run build` passes and `bun run verify` runs without crashing (it may report nothing if no files are marked with `//@ verify`).

---

### Task 0.2: Produce golden-output fixtures from the legacy pipeline

**Files:**
- Create: `moedict-process/tests/pack/fixtures/legacy/.gitattributes` (if using LFS)
- Create: `moedict-process/tests/pack/fixtures/legacy/README.md`
- Modify: `moedict-process/.gitignore`

**Interfaces:**
- `tests/pack/fixtures/legacy/{a,t,h,c,pack,pcck,phck,ptck}/` — legacy output trees.
- `tests/pack/fixtures/legacy/lookup/pinyin/` — legacy pinyin lookup trees.
- `tests/pack/fixtures/legacy/index.json`, `xref.json`, `@*.json`, `=*.json` — legacy special files.

- [ ] **Step 1: Reproduce legacy output**

In a throwaway environment with the legacy toolchain installed (Node.js with `livescript`, Perl 5, Python 2.7, `xz`), run:

```sh
cd moedict-webkit
git checkout <current-main>
npm install
make checkout
make full
# If make full fails on csld, run the per-language targets manually:
#   make twblg; make hakka; make translation; make pinyin
```

Then capture the relevant outputs. The exact list to capture:

```sh
mkdir -p tests/pack/fixtures/legacy/{a,t,h,c,pack,pcck,phck,ptck,lookup/pinyin/a,lookup/pinyin/t,lookup/pinyin/h,lookup/pinyin/c}
cp -r a/* tests/pack/fixtures/legacy/a/
cp -r t/* tests/pack/fixtures/legacy/t/
cp -r h/* tests/pack/fixtures/legacy/h/
cp -r c/* tests/pack/fixtures/legacy/c/
cp -r pack/* tests/pack/fixtures/legacy/pack/
cp -r pcck/* tests/pack/fixtures/legacy/pcck/
cp -r phck/* tests/pack/fixtures/legacy/phck/
cp -r ptck/* tests/pack/fixtures/legacy/ptck/
cp -r lookup/pinyin/a/* tests/pack/fixtures/legacy/lookup/pinyin/a/
cp -r lookup/pinyin/t/* tests/pack/fixtures/legacy/lookup/pinyin/t/
cp -r lookup/pinyin/h/* tests/pack/fixtures/legacy/lookup/pinyin/h/
cp -r lookup/pinyin/c/* tests/pack/fixtures/legacy/lookup/pinyin/c/
cp a/index.json tests/pack/fixtures/legacy/index.json 2>/dev/null || true
cp a/xref.json tests/pack/fixtures/legacy/xref.json 2>/dev/null || true
cp a/@*.json tests/pack/fixtures/legacy/ 2>/dev/null || true
cp a/=*.json tests/pack/fixtures/legacy/ 2>/dev/null || true
cp t/index.json tests/pack/fixtures/legacy/t-index.json 2>/dev/null || true
```

If a full `make full` is too heavy, capture at least the `a` (Mandarin) tree plus a representative `t` tree, and document the gap. The golden test should still assert exact match on whatever is captured.

- [ ] **Step 2: Record fixture provenance**

Create `tests/pack/fixtures/legacy/README.md`:

```markdown
# Legacy pack fixtures

Generated from `g0v/moedict-webkit` at commit `<SHA>` using `make full`.
Toolchain versions:
- Node.js: `<version>`
- livescript: `1.6.0`
- Perl: `<version>`
- Python: `<version>`

These fixtures are the oracle for `bun run pack` golden-output tests. Do not edit by hand.
```

- [ ] **Step 3: Store fixtures**

If the fixture tree is large, add to `.gitattributes`:

```text
tests/pack/fixtures/legacy/** filter=lfs diff=lfs merge=lfs -text
```

Otherwise commit directly. Run:

```sh
cd moedict-process
git add tests/pack/fixtures/legacy .gitattributes
git commit -m "test(pack): add legacy golden-output fixtures"
```

**Acceptance:** `tests/pack/fixtures/legacy/` is non-empty and contains at least the `a/` and `pack/` subtrees; `README.md` records the exact legacy commit and toolchain versions.

---

### Task 0.3: Write the pack-format contract

**Files:**
- Create: `moedict-process/docs/pack-format-contract.md`

**Interfaces:**
- Document: input files, output directory layout, file formats, Unicode normalization rules, and ordering guarantees.

- [ ] **Step 1: Draft contract**

Create `docs/pack-format-contract.md` with these sections:

```markdown
# Pack Format Contract

## Inputs
- `dict-revised.json` (from `moedict-process parse` or `moedict-data`)
- `dict-twblg.json`, `dict-twblg-ext.json` (臺語)
- `dict-hakka.json` (客語)
- `dict-csld.json` (兩岸詞典)
- `dict-concised.audio.json` (國語 audio map, optional)

## Outputs
- `a/`, `t/`, `h/`, `c/` — one JSON file per entry, named by entry title with `~` and `` ` `` removed.
- `pack/`, `ptck/`, `phck/`, `pcck/` — bucket files named `<bucket>.txt`. Each file is a single-line JSON object keyed by title.
- `index.json`, `xref.json` in `a/` (and `t/index.json` for 臺語) when the source data provides them.
- `=@<category>.json` and `@*.json` special files for categories and radicals.
- `lookup/pinyin/<lang>/<pinyin-type>/<token>.json` — pinyin-token to title list.

## Ordering and normalization
- Titles are sorted by Unicode codepoint (not UTF-16 code unit).
- Bucket index = `firstCharCodeUnit(title) % 1024` for `a`, `% 128` for `t/h/c`. This computation is performed in `autolink.ls` (line 77); `link2pack.pl` only groups entries by the precomputed bucket and sorts titles within each bucket.
- Filenames containing IDS characters (`⿰⿸⿺`) are skipped entirely. If two titles normalize to the same NFD filename, the first is kept and the duplicate is skipped before both the individual `.json` file write and the bucket entry append, matching `link2pack.pl` lines 47–49. Unsubstituted `{[hex]}` tokens and variant selectors are filtered upstream by `isSkippedTitle` (autolink/prefix) before the writer is reached.
```

- [ ] **Step 2: Review against consumer repos**

Read `g0v/moedict.tw` data loading code and `g0v/moedict-app/scripts/prepare-data.sh` to confirm the listed paths and formats. Update the contract if paths differ.

- [ ] **Step 3: Commit**

```bash
git add docs/pack-format-contract.md
git commit -m "docs(pack): add pack-format contract for consumers"
```

**Acceptance:** The contract accurately describes the input/output layout and is reviewed against at least `moedict.tw` and `moedict-app/scripts/prepare-data.sh`.

---

## Phase 1: Verified Core Models (LemmaScript)

### Task 1.1: Unicode codepoint helpers

**Files:**
- Create: `moedict-process/src/pack/codepoint.ts`
- Create: `moedict-process/tests/pack/codepoint.test.ts`

**Interfaces:**
- `codepointCount(s: string): number` — number of Unicode codepoints, matching `json2prefix.ls` line 50.
- `firstCharCodeUnit(s: string): number` — first UTF-16 code unit, or low surrogate value for surrogate pairs, matching `autolink.ls` lines 71-75.
- `codepointCompare(a: string, b: string): number` — reuse `src/process.ts` `codepointCompare`.

- [ ] **Step 1: Write the failing unit test**

`tests/pack/codepoint.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { codepointCount, firstCharCodeUnit, codepointCompare } from '~/pack/codepoint';

describe('codepointCount', () => {
  it('counts BMP and supplementary chars', () => {
    expect(codepointCount('abc')).toBe(3);
    expect(codepointCount('中')).toBe(1);
    expect(codepointCount('𠀀')).toBe(1); // U+20000
    expect(codepointCount('a𠀀b')).toBe(3);
  });
});

describe('firstCharCodeUnit', () => {
  it('returns first code unit for BMP and low surrogate offset for pairs', () => {
    expect(firstCharCodeUnit('中')).toBe(0x4e2d);
    const s = '𠀀';
    expect(s.length).toBe(2);
    expect(firstCharCodeUnit(s)).toBe(s.charCodeAt(1) - 0xdc00);
  });
});

describe('codepointCompare', () => {
  it('orders by codepoint', () => {
    expect(codepointCompare('b', 'a') > 0).toBe(true);
    expect(codepointCompare('U+FA3E', 'U+2000D') < 0).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```sh
bun test tests/pack/codepoint.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pack/codepoint.ts`**

```ts
/**
 * Count Unicode codepoints in a JS string.
 * Matches json2prefix.ls: `it.length - it.split(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g).length + 1`
 */
export function codepointCount(s: string): number {
  //@ verify
  //@ requires s.length >= 0
  //@ ensures \result >= 0
  return s.length - s.split(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g).length + 1;
}

/**
 * Return the first UTF-16 code unit used for bucket indexing.
 * For a lone surrogate pair, returns the low surrogate value minus 0xDC00,
 * matching autolink.ls lines 71-75.
 */
export function firstCharCodeUnit(s: string): number {
  //@ verify
  //@ requires s.length > 0
  const first = s.charCodeAt(0);
  if (0xD800 <= first && first <= 0xDBFF) {
    return s.charCodeAt(1) - 0xDC00;
  }
  return first;
}

export { codepointCompare } from '~/process';
```

- [ ] **Step 4: Run tests and verify pass**

```sh
bun test tests/pack/codepoint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run LemmaScript check**

```sh
bun run verify
```

Expected: `codepointCount` and `firstCharCodeUnit` generate Dafny and either verify immediately or produce VCs to prove. Adjust `//@` annotations or `*.dfy` proof additions until green.

- [ ] **Step 6: Commit**

```bash
git add src/pack/codepoint.ts tests/pack/codepoint.test.ts
git commit -m "feat(pack): add verified Unicode codepoint helpers"
```

**Acceptance:** `bun test tests/pack/codepoint.test.ts` passes and `bun run verify` reports zero errors for `src/pack/codepoint.ts`.

---

### Task 1.2: Bucket index and title normalization

**Files:**
- Create: `moedict-process/src/pack/bucket.ts`
- Create: `moedict-process/tests/pack/bucket.test.ts`

**Interfaces:**
- `bucketIndex(title: string, lang: Lang): number` — matches `autolink.ls` line 77.
- `filenameForTitle(title: string): string` — remove `` ` `` and `~`, matching `link2pack.pl` line 47.
- `isSkippedTitle(title: string): boolean` — skip unsubstituted `{[hex]}`, variants `\uDB40[\uDD00-\uDD0F]`, and IDS `⿰⿸⿺`.
- `class FileTitleAcceptor` with `acceptFileTitle(title: string): boolean` — tracks NFD-normalized filenames and rejects titles containing IDS `⿰⿸⿺` or which duplicate an already accepted filename, matching `link2pack.pl` lines 47–49.

```ts
export type Lang = 'a' | 't' | 'h' | 'c';
```

- [ ] **Step 1: Write the failing test**

`tests/pack/bucket.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { bucketIndex, filenameForTitle, isSkippedTitle } from '~/pack/bucket';

describe('bucketIndex', () => {
  it('matches legacy modulus', () => {
    expect(bucketIndex('中', 'a')).toBe(0x4e2d % 1024);
    expect(bucketIndex('中', 't')).toBe(0x4e2d % 128);
    const s = '𠀀';
    expect(bucketIndex(s, 'a')).toBe((s.charCodeAt(1) - 0xdc00) % 1024);
  });
});

describe('filenameForTitle', () => {
  it('removes backtick and tilde', () => {
    expect(filenameForTitle('`中~')).toBe('中');
    expect(filenameForTitle('abc')).toBe('abc');
  });
});

describe('isSkippedTitle', () => {
  it('skips IDS and unsubstituted tokens', () => {
    expect(isSkippedTitle('⿰木木')).toBe(true);
    expect(isSkippedTitle('{[4e2d]}')).toBe(true);
    expect(isSkippedTitle('正常')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `src/pack/bucket.ts`**

```ts
import type { Lang } from './types';
import { firstCharCodeUnit } from './codepoint';

export function bucketIndex(title: string, lang: Lang): number {
  //@ verify
  //@ requires title.length > 0
  //@ requires lang === 'a' || lang === 't' || lang === 'h' || lang === 'c'
  //@ ensures \result >= 0
  const modulus = lang === 'a' ? 1024 : 128;
  return firstCharCodeUnit(title) % modulus;
}

export function filenameForTitle(title: string): string {
  //@ verify
  //@ ensures \result === title.replace(/[`~]/g, '')
  return title.replace(/[`~]/g, '');
}

const SKIP_PATTERN = /\{\[[0-9a-f]{4}\]\}|\uDB40[\uDD00-\uDD0F]|[⿰⿸⿺]/;

export function isSkippedTitle(title: string): boolean {
  //@ verify
  return SKIP_PATTERN.test(title);
}
```

(For LemmaScript, `RegExp.test` may not be in the verified fragment; wrap the predicate with `//@ assume` only if the predicate itself is tested by golden/property tests. Prefer implementing the skip predicate as a verified loop over codepoints.)

- [ ] **Step 3: Add filename acceptor**

Add a `FileTitleAcceptor` class in `src/pack/bucket.ts` for the I/O layer to use. This is not verified by LemmaScript, but property-tested. It must match `link2pack.pl` lines 47–49 exactly: after removing `` ` `` and `~` from the payload `"t"` value, expand `{[hex]}` tokens, then skip filenames containing an IDS character `⿰⿸⿺`, and skip duplicate NFD filenames. Do not canonicalize to the first title; do not write a file or append a bucket entry for rejected titles.

```ts
export class FileTitleAcceptor {
  private seen = new Set<string>();

  acceptFileTitle(fileTitle: string): boolean {
    if (/[⿰⿸⿺]/.test(fileTitle)) return false;
    const normalized = fileTitle.normalize('NFD');
    if (this.seen.has(normalized)) return false;
    this.seen.add(normalized);
    return true;
  }
}
```

Test it:

```ts
it('accepts first title and rejects duplicates by NFD', () => {
  const acceptor = new FileTitleAcceptor();
  const nfc = 'é';
  const nfd = 'e\u0301';
  expect(acceptor.acceptFileTitle(nfc)).toBe(true);
  expect(acceptor.acceptFileTitle(nfd)).toBe(false);
});

it('rejects IDS filenames', () => {
  const acceptor = new FileTitleAcceptor();
  expect(acceptor.acceptFileTitle('⿰亻恩')).toBe(false);
});
```

- [ ] **Step 4: Run tests and verify**

```sh
bun test tests/pack/bucket.test.ts
bun run verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pack/bucket.ts tests/pack/bucket.test.ts
git commit -m "feat(pack): add bucket index and title normalization helpers"
```

**Acceptance:** `bucketIndex` matches legacy output for all first characters; `FileTitleAcceptor` accepts first titles, rejects NFD duplicates, and rejects IDS filenames; `bun run verify` is green.

---

### Task 1.3: Prefix trie and `lenToRegex` model

**Files:**
- Create: `moedict-process/src/pack/prefix.ts`
- Create: `moedict-process/tests/pack/prefix.test.ts`

**Interfaces:**
- `buildPrefixTrie(entries: GrokEntry[]): PrefixTrie`
- `buildLenToRegex(trie: PrefixTrie, lang: Lang): LenToRegexResult`
- `abbrevToTitle: Map<string, string>` — maps abbreviated title to original title.

A `PackEntry` is the raw input object with `{ title: string; heteronyms?: unknown[]; [key: string]: unknown }`. `grokJson` minifies keys and applies a PUA map to produce `GrokEntry` with `{ t: string; h?: unknown[]; [key: string]: unknown }`. The pack pipeline operates on `GrokEntry`.

- [ ] **Step 1: Define types**

`src/pack/types.ts`:

```ts
export type Lang = 'a' | 't' | 'h' | 'c';

/** Raw entry as it appears in moedict-data JSON files. */
export interface PackEntry {
  title: string;
  heteronyms?: unknown[];
  [key: string]: unknown;
}

/** Entry after `grok` key minification (t/h/b/p/... keys). Used by the pack pipeline. */
export interface GrokEntry {
  t: string;
  h?: unknown[];
  [key: string]: unknown;
}

export interface PrefixTrie {
  [prefix: string]: string; // value is "|suffix1|suffix2|..." from json2prefix.ls
}

export interface LenToRegexResult {
  lenToRegex: Record<number, string>;
  abbrevToTitle: Record<string, string>;
  lenToTitles: Record<number, string[]>;
}
```

- [ ] **Step 2: Port `buildPrefixTrie` from `json2prefix.ls` lines 27-48**

```ts
import { codepointCount } from './codepoint';
import { isSkippedTitle } from './bucket';
import type { GrokEntry, PrefixTrie } from './types';

export function buildPrefixTrie(entries: readonly GrokEntry[]): PrefixTrie {
  const prefix: PrefixTrie = {};
  for (const entry of entries) {
    const title = entry.t;
    if (isSkippedTitle(title)) continue;
    const first = title.charCodeAt(0);
    const preLen = (0xD800 <= first && first <= 0xDBFF) ? 2 : 1;
    const pre = title.slice(0, preLen);
    const post = title.slice(preLen);
    if (post.length) {
      prefix[pre] = (prefix[pre] ?? '') + '|' + post;
    } else {
      prefix[pre] = (prefix[pre] ?? '');
    }
  }
  return prefix;
}
```

- [ ] **Step 3: Port `buildLenToRegex` from `json2prefix.ls` lines 57-98**

The function returns a map from length to regex string, plus `abbrevToTitle` and `lenToTitles`. The exact regex generation is the legacy algorithm; port it line-by-line and validate against golden fixtures.

```ts
export function buildLenToRegex(trie: PrefixTrie, _lang: Lang): LenToRegexResult {
  const abbrevToTitle: Record<string, string> = {};
  const lenToTitles: Record<number, string[]> = {};

  for (const [k, v] of Object.entries(trie)) {
    const prefixLength = codepointCount(k);
    const suffixes = v.split('|');
    for (let suffix of suffixes) {
      const abbrevIndex = suffix.indexOf('(');
      if (abbrevIndex >= 0) {
        const orig = suffix;
        suffix = suffix.slice(0, abbrevIndex);
        abbrevToTitle[k + suffix] = k + orig;
      }
      const len = prefixLength + suffix.length;
      if (!lenToTitles[len]) lenToTitles[len] = [];
      lenToTitles[len].push(k + suffix);
    }
  }

  const lenToRegex: Record<number, string> = {};
  const lens: number[] = [];
  for (const [len, titles] of Object.entries(lenToTitles)) {
    const length = Number(len);
    lens.push(length);
    // Legacy LiveScript `titles.sort!` uses UTF-16 code-unit order; preserve it
    // for regex alternative ordering. Golden tests will catch any divergence.
    titles.sort();
    const joined = titles.join('|');
    lenToRegex[length] = joined.replace(/[-[\]{}()*+?.,\\#\s]/g, '\\$&');
  }
  lens.sort((a, b) => b - a);

  // Optimized regex for the shortest lengths, matching json2prefix.ls lines 75-98.
  for (const len of [2, 3, 4]) {
    const titles = lenToTitles[len];
    if (!titles) continue;
    let cur = '';
    let re = '';
    for (const t of titles) {
      let one = t.slice(0, 1);
      let two = t.slice(1);
      const code = one.charCodeAt(0);
      if (0xD800 <= code && code <= 0xDBFF) {
        one = t.slice(0, 2);
        two = t.slice(2);
      }
      if (one === cur) {
        if (len !== 2) re += '|';
        re += two;
      } else {
        if (len === 2) {
          re += ']|' + one + '[' + two;
        } else {
          re += ')|' + one + '(' + two;
        }
      }
      cur = one;
    }
    if (len === 2) {
      re = re.replace(/\[(.|[\uD800-\uDBFF].)\]/g, '$1');
    } else {
      re = re.replace(/\(([^|]+)\)/g, '$1');
    }
    re = re.slice(2).replace(/[-{}*+?.,\\#\s]/g, '\\$&');
    if (len === 2) re += ']';
    else re += ')';
    lenToRegex[len] = re;
  }

  return { lenToRegex, abbrevToTitle, lenToTitles };
}
```

For LemmaScript, annotate the postcondition:

```ts
//@ requires Object.keys(trie).length >= 0
//@ ensures Object.keys(\result.lenToRegex).length >= 0
//@ ensures Object.keys(\result.abbrevToTitle).length >= 0
```

(Note: the exact regex string construction is not verified by LemmaScript; it is a trust boundary tested by golden/property tests because it depends on JS `RegExp` behavior and complex string escaping.)

- [ ] **Step 4: Write property tests**

`tests/pack/prefix.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { buildPrefixTrie, buildLenToRegex } from '~/pack/prefix';

describe('buildPrefixTrie', () => {
  it('groups titles by first character', () => {
    const trie = buildPrefixTrie([
      { t: '中央' },
      { t: '中間' },
      { t: '中' },
    ]);
    expect(trie['中']).toContain('央');
    expect(trie['中']).toContain('間');
    expect(trie['中']).toContain('');
  });
});

describe('buildLenToRegex', () => {
  it('covers every title length', () => {
    const entries = [{ t: '中央' }, { t: '中間' }, { t: '人民' }];
    const trie = buildPrefixTrie(entries);
    const result = buildLenToRegex(trie, 'a');
    for (const entry of entries) {
      const len = [...entry.t].length; // codepoint length
      expect(result.lenToTitles[len]).toContain(entry.t);
    }
  });
});
```

- [ ] **Step 5: Run tests and verify**

```sh
bun test tests/pack/prefix.test.ts
bun run verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pack/types.ts src/pack/prefix.ts tests/pack/prefix.test.ts
git commit -m "feat(pack): add prefix-trie and lenToRegex model"
```

**Acceptance:** Property tests show every title is represented in `lenToTitles`; golden fixtures match for `lenToRegex.json` and `lenToRegex.2.json`, etc.

### Task 1.4: Canonical JSON and C-locale ordering

**Files:**
- Create: `moedict-process/src/pack/serializer.ts`
- Create: `moedict-process/tests/pack/serializer.test.ts`

**Interfaces:**
- `canonicalJson(value: unknown): string` — sorted object keys, no extra whitespace, matching `sort-json.pl` `JSON->new->utf8->canonical`.
- `cLocaleCompare(a: string, b: string): number` — compare UTF-8 byte sequences, equivalent to `env LC_ALL=C sort`.

- [ ] **Step 1: Implement canonical JSON**

`src/pack/serializer.ts`:

```ts
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON matching Perl JSON::XS canonical output. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, sortedReplacer);
}
```

- [ ] **Step 2: Implement C-locale string comparison**

```ts
export function cLocaleCompare(a: string, b: string): number {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const len = Math.min(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    if (ab[i] !== bb[i]) return ab[i] - bb[i];
  }
  return ab.length - bb.length;
}
```

- [ ] **Step 3: Write tests**

`tests/pack/serializer.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { canonicalJson, cLocaleCompare } from '~/pack/serializer';

describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('cLocaleCompare', () => {
  it('matches LC_ALL=C byte order', () => {
    expect(cLocaleCompare('10', '2') < 0).toBe(true); // '1' < '2'
    expect(cLocaleCompare('中央', '中国') !== 0).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests and commit**

```sh
bun test tests/pack/serializer.test.ts
git add src/pack/serializer.ts tests/pack/serializer.test.ts
git commit -m "feat(pack): add canonical JSON and C-locale ordering"
```

**Acceptance:** `canonicalJson` output matches `sort-json.pl` on the same input; `cLocaleCompare` reproduces `env LC_ALL=C sort` order for the golden fixture `a.txt` lines.

---

## Phase 2: Unverified Transformation Pipeline

### Task 2.1: JSON key minification, LTM autolink, and legacy escape roundtrip

**Files:**
- Create: `moedict-process/src/pack/autolink.ts`
- Create: `moedict-process/tests/pack/autolink.test.ts`

**Interfaces:**
- `minifyKeys(json: string): string` — key-shortening regex map from `autolink.ls` lines 28-53.
- `PUA2UNI_JSON2PREFIX: Record<string, string>` — IDS-to-char map used by `json2prefix.ls`.
- `PUA2UNI_AUTOLINK: Record<string, string>` — IDS-to-char map used by `autolink.ls` (differs from the json2prefix map for three entries).
- `grokJson(raw: string, puaMap: Record<string, string>): GrokEntry[]` — apply key minification and a PUA map to a raw JSON string.
- `escapeLegacy(s: string): string` and `unescapeLegacy(s: string): string` — polyfills for the deprecated JS globals used in `worker.ls`.
- `expandPuaTokens(input: string): string` — replace `{[hex]}` with decoded UTF-8 char, matching `link2pack.pl` line 40.
- `buildLenToRegexMap(lenToRegex: Record<number, string>): LenToRegexMap`
- `autolinkLine(idx: number, title: string, entry: GrokEntry, lenToRegex: LenToRegexMap): string` — returns one `idx <esc-title> <payload>` line.

The LTM replacement and JSON serialization are trust boundaries; they are tested by golden/differential tests, not verified by LemmaScript.

- [ ] **Step 1: Implement key minification and grok loader**

`src/pack/autolink.ts`:

```ts
import { codepointCount } from './codepoint';
import { canonicalJson } from './serializer';
import type { GrokEntry } from './types';

const KEY_REPLACEMENTS: [RegExp, string][] = [
  [/"bopomofo2": "[^"]*",/g, ''],
  [/"heteronyms":/g, '"h":'],
  [/"bopomofo":/g, '"b":'],
  [/"pinyin":/g, '"p":'],
  [/"definitions":/g, '"d":'],
  [/"stroke_count":/g, '"c":'],
  [/"non_radical_stroke_count":/g, '"n":'],
  [/"def":/g, '"f":'],
  [/"title":/g, '"t":'],
  [/"radical":/g, '"r":'],
  [/"example":/g, '"e":'],
  [/"link":/g, '"l":'],
  [/"synonyms":/g, '"s":'],
  [/"antonyms":/g, '"a":'],
  [/"quote":/g, '"q":'],
  [/"trs":/g, '"T":'],
  [/"alt":/g, '"A":'],
  [/"vernacular":/g, '"V":'],
  [/"combined":/g, '"C":'],
  [/"dialects":/g, '"D":'],
  [/"id":/g, '"_":'],
  [/"audio_id":/g, '"=":'],
  [/"specific_to":/g, '"S":'],
];

export function minifyKeys(json: string): string {
  let result = json;
  for (const [re, replacement] of KEY_REPLACEMENTS) {
    result = result.replace(re, replacement);
  }
  return result;
}

/** Map used by json2prefix.ls for prefix/lenToRegex generation. */
export const PUA2UNI_JSON2PREFIX: Record<string, string> = {
  '⿰𧾷百': '𬦀',
  '⿸疒哥': '󿗧',
  '⿰亻恩': '𫣆',
  '⿰虫念': '𬠖',
  '⿺皮卜': '󿕅',
};

/** Map used by autolink.ls for payload generation. Differs for three IDS strings. */
export const PUA2UNI_AUTOLINK: Record<string, string> = {
  '⿰𧾷百': '󾜅',
  '⿸疒哥': '󿗧',
  '⿰亻恩': '󿌇',
  '⿰虫念': '󿑂',
  '⿺皮卜': '󿕅',
};

export function grokJson(raw: string, puaMap: Record<string, string>): GrokEntry[] {
  const grokked = minifyKeys(raw).replace(
    /[⿰⿸⿺](?:𧾷|.)./g,
    (ids) => puaMap[ids] ?? ids,
  );
  return JSON.parse(grokked) as GrokEntry[];
}
```

- [ ] **Step 2: Implement legacy escape helpers and PUA expansion**

```ts
/** Polyfill for the deprecated JS `escape` used in worker.ls. */
export function escapeLegacy(s: string): string {
  return s.replace(/[^A-Za-z0-9@*_+\-./]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code < 256) {
      return `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return `%u${code.toString(16).toUpperCase().padStart(4, '0')}`;
  });
}

/** Polyfill for the deprecated JS `unescape` used in worker.ls. */
export function unescapeLegacy(s: string): string {
  return s.replace(/%u([0-9a-fA-F]{4})|%([0-9a-fA-F]{2})/g, (_match, u, h) => {
    if (u !== undefined) {
      return String.fromCharCode(parseInt(u, 16));
    }
    return String.fromCharCode(parseInt(h, 16));
  });
}

export function expandPuaTokens(input: string): string {
  return input.replace(/\{\[([a-f0-9]{4,5})\]\}/g, (_match, hex) => {
    const code = parseInt(hex, 16);
    return String.fromCodePoint(code);
  });
}
```

- [ ] **Step 3: Implement LTM replacement**

```ts
export interface LenToRegexMap {
  [length: number]: RegExp;
}

export function buildLenToRegexMap(lenToRegex: Record<number, string>): LenToRegexMap {
  const map: LenToRegexMap = {};
  for (const [len, re] of Object.entries(lenToRegex)) {
    map[Number(len)] = new RegExp(re, 'g');
  }
  return map;
}

export function autolinkLine(
  idx: number,
  title: string,
  entry: GrokEntry,
  lenToRegex: LenToRegexMap,
): string {
  // Ported from worker.ls lines 23-33.
  let chunk = canonicalJson({ ...entry, t: '' }).replace(
    /.[\u20E3\u20DE\u20DF\u20DD]/g,
    (c) => escapeLegacy(c),
  );

  const lengths = Object.keys(lenToRegex).map(Number).sort((a, b) => b - a);

  // Longest-to-shortest LTM replacement inside the JSON payload.
  for (const len of lengths) {
    const re = lenToRegex[len];
    if (!re) continue;
    chunk = chunk.replace(re, (match) => escapeLegacy('`' + match + '~'));
  }

  const esc = escapeLegacy(title);
  const titleCodes = codepointCount(title);

  let linkedTitle = title;
  for (const len of lengths) {
    if (len >= titleCodes) continue;
    const re = lenToRegex[len];
    if (!re) continue;
    linkedTitle = linkedTitle.replace(re, (match) => escapeLegacy('`' + match + '~'));
  }

  const payload = unescapeLegacy(chunk).replace(
    /"t":""/,
    `"t":"${unescapeLegacy(linkedTitle)}"`,
  );
  return `${idx} ${esc} ${payload}`;
}
```

- [ ] **Step 4: Write differential tests**

`tests/pack/autolink.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { minifyKeys, escapeLegacy, unescapeLegacy, expandPuaTokens, buildLenToRegexMap, autolinkLine } from '~/pack/autolink';

describe('minifyKeys', () => {
  it('shortens known keys', () => {
    expect(minifyKeys('{"heteronyms":[],"title":"x"}')).toBe('{"h":[],"t":"x"}');
  });
});

describe('escapeLegacy roundtrip', () => {
  it('is a no-op for CJK', () => {
    const s = '中央';
    expect(unescapeLegacy(escapeLegacy(s))).toBe(s);
  });
});

describe('expandPuaTokens', () => {
  it('decodes bracket hex', () => {
    expect(expandPuaTokens('{[4e2d]}')).toBe('中');
  });
});

describe('autolinkLine', () => {
  it('produces a line with escaped title and linked title', () => {
    const line = autolinkLine(7, '中央', { t: '中央', h: [] }, { 2: /中央/g });
    expect(line.startsWith('7 %u4E2D%u592E ')).toBe(true);
    expect(line).toContain('"t":"中央"');
  });
});
```

- [ ] **Step 5: Run tests and commit**

```sh
bun test tests/pack/autolink.test.ts
git add src/pack/autolink.ts tests/pack/autolink.test.ts
git commit -m "feat(pack): add autolink key minification and LTM replacement"
```

**Acceptance:** `autolinkLine` produces output identical to legacy `worker.js` for a sampled set of entries from the golden fixtures; `bun test` passes.

### Task 2.2: Pack assembly and I/O trust boundary

**Files:**
- Create: `moedict-process/src/pack/io.ts`
- Modify: `moedict-process/src/pack/bucket.ts` — export `FileTitleAcceptor`

**Interfaces:**
- `PackWriter` class — writes individual entry JSONs and pack bucket files.
- `PackWriter.writeEntry(lang, bucket, bucketTitle, fileTitle, payload)`
- `PackWriter.finalize()` — flushes `p${lang}ck/<bucket>.txt` files.

`bucketTitle` is the escaped title used as the JSON object key inside the bucket file (matching `link2pack.pl` `$title`, the second field of the input line). `fileTitle` is derived from the payload `"t"` value with `` ` `` and `~` removed, used to name the individual `lang/<fileTitle>.json` file.

- [ ] **Step 1: Implement `PackWriter`**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Lang } from './types';
import { filenameForTitle, FileTitleAcceptor } from './bucket';
import { cLocaleCompare } from './serializer';

const PACK_DIR: Record<Lang, string> = {
  a: 'pack',
  t: 'ptck',
  h: 'phck',
  c: 'pcck',
};

export class PackWriter {
  private acceptors = new Map<Lang, FileTitleAcceptor>();
  private prepack = new Map<string, string[]>();
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  writeEntry(
    lang: Lang,
    bucket: number,
    bucketTitle: string,
    fileTitle: string,
    payload: string,
  ): void {
    let acceptor = this.acceptors.get(lang);
    if (!acceptor) {
      acceptor = new FileTitleAcceptor();
      this.acceptors.set(lang, acceptor);
    }
    if (!acceptor.acceptFileTitle(fileTitle)) return;

    const filename = filenameForTitle(fileTitle);
    const langDir = path.join(this.outputDir, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const entryPath = path.join(langDir, `${filename}.json`);
    // Legacy link2pack.pl substitution before writing.
    const processedPayload = payload.replace(/`\{~/g, '{');
    fs.writeFileSync(entryPath, processedPayload);

    const key = `${lang}:${bucket}`;
    if (!this.prepack.has(key)) this.prepack.set(key, []);
    this.prepack.get(key)!.push(`\n,"${bucketTitle}":${processedPayload}`);
  }

  finalize(): void {
    for (const [key, parts] of this.prepack) {
      const [lang, bucket] = key.split(':') as [Lang, string];
      const dir = path.join(this.outputDir, PACK_DIR[lang]);
      fs.mkdirSync(dir, { recursive: true });
      parts.sort(cLocaleCompare);
      let body = parts.join('');
      body = body.replace(/^\n,/, '{');
      body += '\n}\n';
      fs.writeFileSync(path.join(dir, `${bucket}.txt`), body);
    }
  }
}
```

- [ ] **Step 2: Add I/O unit tests**

`tests/pack/io.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { PackWriter } from '~/pack/io';

describe('PackWriter', () => {
  let out: string;
  beforeEach(() => { out = fs.mkdtempSync(path.join(tmpdir(), 'pack-')); });
  afterEach(() => { fs.rmSync(out, { recursive: true, force: true }); });

  it('writes entry and bucket', () => {
    const writer = new PackWriter(out);
    writer.writeEntry('a', 7, '%u4E2D%u592E', '中央', '{"t":"中央"}');
    writer.finalize();
    expect(fs.existsSync(path.join(out, 'a', '中央.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'pack', '7.txt'))).toBe(true);
  });

  it('skips NFD-duplicate and IDS filenames without writing files or bucket entries', () => {
    const writer = new PackWriter(out);
    const aDir = path.join(out, 'a');
    writer.writeEntry('a', 7, 'first', 'é', '{"t":"é"}');
    writer.writeEntry('a', 7, 'duplicate', 'e\u0301', '{"t":"e\u0301"}');
    writer.writeEntry('a', 7, 'ids', '⿰亻恩', '{"t":"⿰亻恩"}');
    writer.finalize();

    const files = fs.readdirSync(aDir);
    expect(files.length).toBe(1);
    expect(fs.existsSync(path.join(aDir, '⿰亻恩.json'))).toBe(false);

    const bucket = fs.readFileSync(path.join(out, 'pack', '7.txt'), 'utf8');
    expect(bucket).toContain('"first":');
    expect(bucket).not.toContain('"duplicate":');
    expect(bucket).not.toContain('"ids":');
  });
});
```

- [ ] **Step 3: Run tests and commit**

```sh
bun test tests/pack/io.test.ts
git add src/pack/io.ts tests/pack/io.test.ts
git commit -m "feat(pack): add PackWriter I/O trust boundary"
```

**Acceptance:** `PackWriter` produces individual files and bucket files matching the structure of the legacy fixtures for the `a` language at minimum; bucket entries are sorted by `cLocaleCompare`.

### Task 2.3: Special packs and indexes (`special2pack`, `cat2special`, `twblg_index`)

**Files:**
- Create: `moedict-process/src/pack/special.ts`
- Create: `moedict-process/tests/pack/special.test.ts`

**Interfaces:**
- `buildSpecialPacks(lang: Lang, outputDir: string)` — equivalent to `special2pack.pl`.
- `buildCategoryFiles(dictCat: { name: string; entries: string[] }[], outputDir: string)` — equivalent to `cat2special.ls`.
- `buildTwblgIndex(csvPath: string, outputPath: string)` — equivalent to `twblg_index.py`.

- [ ] **Step 1: Port `special2pack.pl` to TypeScript**

```ts
export function buildSpecialPacks(lang: Lang, outputDir: string): void {
  // For each special prefix (=, @) and lang, read lang/<special>*.json,
  // strip whitespace, escape `=` as %3D and non-ASCII as %uXXXX,
  // and write p${lang}ck/<special>.txt as a single-line JSON object.
}
```

- [ ] **Step 2: Port `cat2special.ls`**

```ts
export function buildCategoryFiles(dictCat: { name: string; entries: string[] }[], outputDir: string): void {
  for (const { name, entries } of dictCat) {
    fs.writeFileSync(path.join(outputDir, `=${name}`), JSON.stringify(entries));
  }
}
```

- [ ] **Step 3: Port `twblg_index.py`**

```ts
export async function buildTwblgIndex(csvPath: string, outputPath: string): Promise<void> {
  // Read 詞目總檔.csv, filter rows where column 1 in ['1','2','5','25'] and
  // title does not contain ⿰⿸, collect column 2, sort unique, write JSON.
}
```

- [ ] **Step 4: Add tests and commit**

Compare `buildSpecialPacks` output to `pack/@.txt`, `pack/=%uXXXX.txt`, `t/index.json` fixtures.

```sh
bun test tests/pack/special.test.ts
git add src/pack/special.ts tests/pack/special.test.ts
git commit -m "feat(pack): add special packs and index generation"
```

**Acceptance:** Output files exist and byte-match legacy fixtures for `@.txt` and `t/index.json`.

---

## Phase 3: CLI and Pipeline Integration

### Task 3.1: Implement `bun run pack`

**Files:**
- Create: `moedict-process/src/pack/pipeline.ts`
- Create: `moedict-process/src/bin/pack.ts`

**Interfaces:**
- `runPack(options: PackOptions): Promise<void>`
- `PackOptions { lang: Lang | 'all'; inputDir: string; outputDir: string; }`

- [ ] **Step 1: Implement pipeline orchestration**

```ts
// src/pack/pipeline.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Lang, GrokEntry } from './types';
import { buildPrefixTrie, buildLenToRegex } from './prefix';
import { grokJson, expandPuaTokens, buildLenToRegexMap, autolinkLine, PUA2UNI_JSON2PREFIX, PUA2UNI_AUTOLINK } from './autolink';
import { PackWriter } from './io';
import { bucketIndex, isSkippedTitle } from './bucket';
import { cLocaleCompare, canonicalJson } from './serializer';
import { buildSpecialPacks, buildTwblgIndex, buildCategoryFiles } from './special';

export interface PackOptions {
  lang: Lang | 'all';
  inputDir: string;
  outputDir: string;
}

export async function runPack(options: PackOptions): Promise<void> {
  const langs: Lang[] = options.lang === 'all' ? ['a', 't', 'h', 'c'] : [options.lang];
  for (const lang of langs) {
    const entriesForPrefix = loadGrokEntries(lang, options.inputDir, PUA2UNI_JSON2PREFIX);
    const entriesForAutolink = loadGrokEntries(lang, options.inputDir, PUA2UNI_AUTOLINK);

    const trie = buildPrefixTrie(entriesForPrefix);
    const { lenToRegex, abbrevToTitle } = buildLenToRegex(trie, lang);

    // Write lenToRegex JSON files for worker/autolink compatibility.
    for (const [len, re] of Object.entries(lenToRegex)) {
      fs.writeFileSync(path.join(options.outputDir, `${lang}/lenToRegex.${len}.json`), canonicalJson({ [len]: re }));
    }
    fs.writeFileSync(path.join(options.outputDir, `${lang}/lenToRegex.json`), canonicalJson({ lenToRegex }));
    fs.writeFileSync(path.join(options.outputDir, `${lang}/precomputed.json`), canonicalJson({ abbrevToTitle }));

    const regexMap = buildLenToRegexMap(lenToRegex);
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const entry of entriesForAutolink) {
      const title = entry.t;
      if (isSkippedTitle(title)) continue;
      if (seen.has(title)) continue;
      seen.add(title);
      const bucket = bucketIndex(title, lang);
      const line = autolinkLine(bucket, title, entry, regexMap);
      lines.push(line);
    }

    // Equivalent to `perl sort-json.pl | env LC_ALL=C sort`.
    lines.sort(cLocaleCompare);

    const writer = new PackWriter(options.outputDir);
    for (const line of lines) {
      const match = line.match(/^(\d+) (\S+) (.+)$/);
      if (!match) throw new Error(`malformed autolink line: ${line.slice(0, 80)}`);
      const [, bucketStr, bucketTitle, payload] = match;
      const bucket = Number(bucketStr);
      const expandedPayload = expandPuaTokens(payload);
      const titleMatch = expandedPayload.match(/"t":"([^"]+)"/);
      const fileTitle = (titleMatch?.[1] ?? '').replace(/[`~]/g, '');
      writer.writeEntry(lang, bucket, bucketTitle, fileTitle, expandedPayload);
    }
    writer.finalize();

    buildSpecialPacks(lang, options.outputDir);
    if (lang === 't') {
      await buildTwblgIndex(
        path.join(options.inputDir, 'moedict-data-twblg/uni/詞目總檔.csv'),
        path.join(options.outputDir, 't/index.json'),
      );
    }
  }

  // Category files come from dict-cat.json.
  const dictCatPath = path.join(options.inputDir, 'moedict-data/dict-cat.json');
  if (fs.existsSync(dictCatPath)) {
    buildCategoryFiles(JSON.parse(fs.readFileSync(dictCatPath, 'utf8')), options.outputDir);
  }
}

function loadGrokEntries(lang: Lang, inputDir: string, puaMap: Record<string, string>): GrokEntry[] {
  const paths: string[] = [];
  switch (lang) {
    case 'a': paths.push(path.join(inputDir, 'dict-revised.json')); break;
    case 't':
      paths.push(path.join(inputDir, 'dict-twblg.json'));
      paths.push(path.join(inputDir, 'dict-twblg-ext.json'));
      break;
    case 'h': paths.push(path.join(inputDir, 'dict-hakka.json')); break;
    case 'c': paths.push(path.join(inputDir, 'dict-csld.json')); break;
  }
  const all: GrokEntry[] = [];
  for (const p of paths) {
    const raw = fs.readFileSync(p, 'utf8');
    all.push(...grokJson(raw, puaMap));
  }
  return all;
}
```

- [ ] **Step 2: Implement CLI**

`src/bin/pack.ts`:

```ts
#!/usr/bin/env bun
import { runPack, type PackOptions } from '~/pack/pipeline';

const langArg = process.argv[2] ?? 'all';
const inputDir = process.env.MOEDICT_PACK_INPUT ?? 'dict_data';
const outputDir = process.env.MOEDICT_PACK_OUTPUT ?? 'pack';

if (!['a', 't', 'h', 'c', 'all'].includes(langArg)) {
  console.error('Usage: bun run pack [a|t|h|c|all]');
  process.exit(1);
}

await runPack({ lang: langArg as PackOptions['lang'], inputDir, outputDir });
```

- [ ] **Step 3: Run on `a` and inspect output**

```sh
bun run pack a
```

Expected: creates `a/` and `pack/` directories; `pack/7.txt` etc. exist.

- [ ] **Step 4: Commit**

```bash
git add src/pack/pipeline.ts src/bin/pack.ts
git commit -m "feat(pack): add bun run pack orchestration"
```

**Acceptance:** `bun run pack a` completes without crashing and produces a directory tree isomorphic to the legacy `a/` + `pack/` fixtures.

## Phase 4: Golden-Output Tests and CI

### Task 4.1: Write the golden-output test harness

**Files:**
- Create: `moedict-process/tests/pack/golden-output.test.ts`

**Interfaces:**
- Compare `bun run pack` output to `tests/pack/fixtures/legacy/` recursively, file-by-file.
- Generate a diff report for mismatches.

- [ ] **Step 1: Implement harness**

```ts
import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { runPack } from '~/pack/pipeline';

const FIXTURES = 'tests/pack/fixtures/legacy';

describe('golden output', () => {
  it('matches legacy pack output for a', async () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'pack-'));
    await runPack({ lang: 'a', inputDir: process.env.MOEDICT_PACK_INPUT ?? 'dict_data', outputDir: out });
    compareTrees(path.join(FIXTURES, 'a'), path.join(out, 'a'));
    compareTrees(path.join(FIXTURES, 'pack'), path.join(out, 'pack'));
    fs.rmSync(out, { recursive: true, force: true });
  });
});

function compareTrees(expected: string, actual: string): void {
  const expectedFiles = walk(expected).sort();
  const actualFiles = walk(actual).sort();
  expect(actualFiles).toEqual(expectedFiles);
  for (const rel of expectedFiles) {
    const e = fs.readFileSync(path.join(expected, rel), 'utf8');
    const a = fs.readFileSync(path.join(actual, rel), 'utf8');
    if (e !== a) {
      throw new Error(`Mismatch in ${rel}:\n${diffLines(e, a).slice(0, 500)}`);
    }
  }
}

function walk(dir: string): string[] { /* recursive readdir */ }
function diffLines(a: string, b: string): string { /* simple line diff */ }
```

- [ ] **Step 2: Run and fix mismatches**

```sh
bun test tests/pack/golden-output.test.ts
```

Expected: FAIL initially. Iterate on `serializer.ts`, `autolink.ts`, `io.ts` until the diff is empty or documented.

- [ ] **Step 3: Document accepted differences**

If any differences are intentional (e.g., legacy nondeterminism, bug fixes), add them to `docs/pack-format-contract.md` under "Known differences from legacy output".

- [ ] **Step 4: Commit**

```bash
git add tests/pack/golden-output.test.ts
git commit -m "test(pack): add golden-output regression harness"
```

**Acceptance:** `bun test tests/pack/golden-output.test.ts` passes for the captured `a` fixtures; any `t/h/c` gaps are documented as skipped tests with a note linking to the fixture-capture issue.

---

### Task 4.2: Wire CI and final verification

**Files:**
- Modify: `moedict-process/.github/workflows/lemmascript.yml` (or create `ci.yml`)

- [ ] **Step 1: Add full CI pipeline**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
      - run: bun run lint
      - run: bun run test
      - run: bun run verify
```

- [ ] **Step 2: Ensure fixtures are available in CI**

If fixtures are committed directly, no extra step. If they are in LFS, add `lfs: true` to checkout. If they are too large, generate them in CI from a pinned legacy Docker image and skip storing in the repo.

- [ ] **Step 3: Run full verification locally**

```sh
bun run build
bun run lint
bun run test
bun run verify
```

- [ ] **Step 4: Commit and tag**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(pack): add full test and verification pipeline"
```

**Acceptance:** CI passes on a branch and the `pack` command is ready for downstream staging.

---

## Phase 5: moedict-webkit Retirement

### Task 5.1: PR triage in moedict-webkit

**Files:**
- `g0v/moedict-webkit` GitHub issues/PRs.

- [ ] **Step 1: Close obsolete Dependabot major bumps**

Close PRs #352, #348, #347, #334, #331, #330, #259 with a comment such as:

> This repository's build/server stack is being retired; the dependency is no longer maintained here. Pack generation has moved to `g0v/moedict-process` and the static frontend is frozen.

- [ ] **Step 2: Forward-port #315 (`靑`→`青`)**

Determine whether the radical correction belongs in data (`g0v/moedict-data`), normalization (`moedict-process/src/normalize.ts`), or the pack pipeline. Apply it in the correct repo and close #315 with a reference.

- [ ] **Step 3: Forward-port #316 (license links)**

If the license links are in `about.html` or `README.md`, update them in `moedict-webkit` before freezing. If the links are now owned by `moedict-app` gh-pages, open/comment on the issue there.

**Acceptance:** All listed Dependabot PRs are closed with an explanation; #315 and #316 are either applied or explicitly reassigned to the correct repo.

---

### Task 5.2: Remove obsolete server/build code

**Files:**
- Modify: `moedict-webkit/package.json`
- Modify: `moedict-webkit/Makefile`
- Modify: `moedict-webkit/README.md`
- Modify: `moedict-webkit/CLAUDE.md`
- Delete: `moedict-webkit/server.ls`, `gulpfile.ls` (if present), `webpack.config.js` (if present), `gulpfile.*`, `cordova/` (if not used by `moedict-app`)

- [ ] **Step 1: Clean `package.json`**

Remove obsolete deps and scripts:

```json
{
  "name": "moedict-webkit",
  "description": "Legacy static frontend source for moedict.org (frozen).",
  "version": "0.0.1",
  "scripts": {},
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Reduce `Makefile`**

Remove all pack/server targets. Keep only documentation targets or delete the file if unnecessary.

- [ ] **Step 3: Update README/CLAUDE**

Add a banner:

```markdown
# ⚠️ Frozen

This repository no longer builds dictionary packs. Pack generation lives in `g0v/moedict-process`. The files here are the frozen static-frontend source for `moedict.org`, served via `g0v/moedict-app` gh-pages.
```

Remove the HFS+ requirement from `CLAUDE.md`.

- [ ] **Step 4: Delete obsolete source files**

```bash
rm moedict-webkit/server.ls
rm -f moedict-webkit/gulpfile.ls moedict-webkit/webpack.config.js
# Remove any gulp/webpack/node-specific config no longer needed.
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: retire server and build toolchain; freeze static frontend"
```

**Acceptance:** `moedict-webkit` no longer contains `server.ls`, gulp/webpack configs, or pack Makefile targets; README/CLAUDE clearly state the repo is frozen.

---

### Task 5.3: Deal with untracked files

**Files:**
- `moedict-webkit/cci-memoir-draft.md`
- `moedict-webkit/cci-memoir-research-notes.md`
- `moedict-webkit/moedict-app/` (untracked)

- [ ] **Step 1: Move or archive memoir files**

If these are user drafts, move them to a personal repo or add to `.gitignore` and remove from the working tree. Do not commit them to the archived project repo.

- [ ] **Step 2: Remove or explain `moedict-app/`**

If `moedict-app/` is a stale checkout, delete it. If it is needed, document why and either commit it to `g0v/moedict-app` or add it to `.gitignore`.

- [ ] **Step 3: Commit cleanup**

```bash
git add .gitignore
git commit -m "chore: clean untracked drafts and stale moedict-app checkout"
```

**Acceptance:** `git status` in `moedict-webkit` is clean except for intentional ignored build artifacts.

---

### Task 5.4: Archive/rename and redirect checks

**Files:**
- GitHub repo settings for `g0v/moedict-webkit`
- `g0v/moedict-app` deployment settings (gh-pages)
- `g0v/moedict.tw` data paths

- [ ] **Step 1: Stage new pack output in downstream repos**

Update `moedict.tw` to consume `moedict-process` pack output (e.g., via Git submodule or CI artifact) instead of `moedict-webkit`. Update `moedict-app/scripts/prepare-data.sh` accordingly.

- [ ] **Step 2: Verify `moedict.org` URLs and SEO**

Before archiving, run a crawl of `www.moedict.org` from `moedict-app` gh-pages staging. Confirm that:
- `/a/中央.json` and similar entry URLs still resolve.
- `/pack/7.txt` bucket URLs still resolve.
- No 404s appear for top 1000 query paths from access logs.

- [ ] **Step 3: Archive or rename `moedict-webkit`**

Options:
1. **Archive** the repo (GitHub "Archive this repository"). No redirects needed beyond GitHub's automatic ones.
2. **Rename** to `g0v/moedict-legacy-frontend` and leave a stub `README.md` in `g0v/moedict-webkit` explaining the move. This preserves stars/issues but breaks some old URLs.

Recommended: archive without rename first; if a rename is later desired, do it after a 30-day observation window.

- [ ] **Step 4: Document final state**

Update `moedict-process/README.md` to mention `bun run pack` and link to `docs/pack-format-contract.md`.

- [ ] **Step 5: Final commit and close tracking**

```bash
git add README.md
git commit -m "docs: document pack command and downstream contract"
```

**Acceptance:** `moedict.org` serves correctly from `moedict-app` gh-pages using new pack output; `moedict-webkit` is archived or clearly marked frozen; no 404 regressions in top 1000 paths.

---

## Verification

- `bun run build` passes.
- `bun run lint` passes.
- `bun run test` passes, including golden-output tests for the captured legacy fixtures.
- `bun run verify` passes (or reports only expected proof gaps with issues filed).
- `bun run pack a` produces a directory tree isomorphic to the legacy `a/` + `pack/` output.
- `moedict-webkit` no longer contains `server.ls`, pack Makefile targets, or obsolete build deps.
- `moedict.org` top paths are smoke-tested after downstream staging.

## Rollout

1. Merge pack factory into `moedict-process` `main`.
2. Update `moedict.tw` to pull pack output from `moedict-process`.
3. Update `moedict-app/scripts/prepare-data.sh`.
4. Stage `moedict.org` on `moedict-app` gh-pages.
5. Smoke-test top paths.
6. Archive `moedict-webkit`.

## Rollback

- If `bun run pack` output diverges from legacy and cannot be reconciled, keep the legacy pipeline in `moedict-webkit` for one extra release while fixing `moedict-process`. Do not archive `moedict-webkit` until golden tests pass.
- If `moedict.org` staging shows 404s, revert `moedict-app` gh-pages to the previous commit and investigate path mappings.

## Follow-ups

- Generate `lookup/pinyin/` in the new pipeline and add it to golden tests.
- Add `c` language golden fixtures.
- Evaluate renaming `moedict-webkit` to `moedict-legacy-frontend`.
- File LemmaScript toolchain issues for any unsupported TypeScript idioms encountered.

## Decision Log

- **Pack factory home:** `g0v/moedict-process` as a `pack` subcommand, separate from `parse`, because it keeps the data-processing toolchain in one repo and reduces cross-repo friction.
- **Implementation language:** LemmaScript-annotated TypeScript, not a separate runtime language. Ordinary TypeScript is annotated with `//@` specs; Dafny backend generates verification conditions. JS `RegExp`, `JSON.stringify`, and file I/O remain unverified trust boundaries.
- **Golden-output fixtures:** Frozen legacy `make full` output is the oracle. Byte-for-byte matching is required unless a difference is documented as a bug fix or nondeterminism.
- **APFS filename handling:** Use an in-memory `FileTitleAcceptor` (per-language `Set` of NFD-normalized filenames) instead of an HFS+ partition. It rejects filenames containing IDS characters (`⿰⿸⿺`) and rejects NFD duplicates entirely before both file write and bucket append, matching `link2pack.pl` lines 47–49. Unsubstituted `{[hex]}` tokens and variant selectors remain filtered upstream by `isSkippedTitle`.
- **Canonical JSON and C-locale ordering:** `bun run pack` sorts `idx title payload` lines and bucket entries by UTF-8 byte comparison (`cLocaleCompare`) and writes canonical JSON, matching `perl sort-json.pl | env LC_ALL=C sort`.
- **Legacy frontend ownership:** `moedict.org` static frontend source remains in `moedict-webkit` but is frozen; deployment flows through `g0v/moedict-app` gh-pages.

## Spec Coverage

| Requirement from context | Task |
|---|---|
| Pack factory in LemmaScript TS in `moedict-process` | Tasks 0.1, 1.1–1.3, 2.1–2.3, 3.1 |
| `parse` and `pack` distinct | Task 3.1 (new `bun run pack` script) |
| Golden-output tests | Tasks 0.2, 4.1 |
| Pack-format contract | Task 0.3 |
| Remove LiveScript/Perl/Python 2/HFS+ | Tasks 1.1–2.3, 5.2 |
| Legacy frontend frozen | Task 5.2, 5.4 |
| Server code retired | Task 5.2 |
| PR triage #315/#316 and Dependabot | Task 5.1 |
| APFS normalization handled | Task 1.2 |
| Downstream consumers updated | Task 5.4 |
