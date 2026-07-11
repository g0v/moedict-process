# Variants Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile a provenance-aware, no-PUA variants sidecar for the Mandarin pack.

**Architecture:** `moedict-data/variants` stores immutable source/provenance inputs; `moedict-process/src/pack/variants.ts` parses and validates them; `packLang('a')` emits separate `a/variants/index.json` and sharded group records. Existing dictionary payloads remain unchanged.

**Tech Stack:** Bun, TypeScript, canonical JSON, Vitest/Bun tests.

## Global Constraints

- kcwu and MOE-derived inputs are `unknown-pending-clarification` license status.
- Builds never fetch network data.
- Unresolved glyphs remain symbolic; literal disallowed PUA is rejected.
- A child educode never appears under its parent codepoint in `resolvedGlyphs`.
- Existing pack payloads and golden output remain unchanged.

### Task 1: Add provenance-bearing fixture input

**Files:**
- Create: `moedict-data/variants/README.md`, `manifest.json`, `kcwu-list-2013.txt`, `resolution-overlay.json`, `headword-observations.json`

- [ ] Add a minimal checked-in fixture source with license status and provenance, including rows A00001, A00001-001, A00001-003, A00001-004, A00021-001 and N00517–N00520. Keep raw and authored resolution fields separate.
- [ ] Document source URLs, unknown licensing, symbolic PUA/image semantics, and snapshot date.

### Task 2: Implement pure variants compiler

**Files:**
- Create: `src/pack/variants.ts`
- Test: `tests/pack/variants.test.ts`

**Interfaces:**
- `compileVariants(input: VariantsInput): VariantsOutput`
- `writeVariantsIndex(inputDir: string, outputDir: string): void`

- [ ] Write failing tests for filename decoding, symbolic PUA, GlyphWiki overlay, conflicts, separate indexes, deterministic order, N observations, and no-PUA output.
- [ ] Implement parsing of five-column kcwu rows and hex filename decoding.
- [ ] Apply overlay only to the row's own educode; never infer child codepoints from parent groups.
- [ ] Emit `resolvedGlyphs`, `headwordGroups`, and group records with symbolic unresolved references.
- [ ] Validate Unicode scalars, reject conflicts, canonicalize ordering, and assert no literal PUA.
- [ ] Run `bun test tests/pack/variants.test.ts`.

### Task 3: Wire the sidecar into packing

**Files:**
- Modify: `src/pack/pipeline.ts`
- Test: `tests/pack/variants.test.ts` or focused pipeline coverage

- [ ] Call `writeVariantsIndex(inputDir, outputDir)` after `writer.finalize()` only for `lang === 'a'`.
- [ ] Leave `t/h/c` output and existing pack payloads unchanged.
- [ ] Run focused pack/variant tests and `bun run typecheck`.

### Task 4: Validate output and update source documentation

**Files:**
- Modify: `moedict-data/variants/README.md`
- Test: focused variants and pipeline tests

- [ ] Verify generated sidecars contain no disallowed PUA and that unresolved rows are symbolic.
- [ ] Verify deterministic reruns produce byte-identical JSON.
- [ ] Run the touched test files and typecheck; do not claim full-suite status unless run.
