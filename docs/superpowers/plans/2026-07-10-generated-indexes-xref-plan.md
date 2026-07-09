# Generated Indexes and Cross-References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace checked-in legacy a/h index artifacts with deterministic generated indexes, and reproduce cross-language xrefs from their explicit upstream side inputs.

**Architecture:** `src/pack/index.ts` owns a language-neutral index writer. It receives emitted titles, deduplicates exact titles, rejects non-curated PUA through the existing gate, and orders Unicode scalar sequences deterministically. `src/pack/xref.ts` owns the three legacy xref directions: Taiwanese CSV produces the `t` section in `a/xref.json` and the `a` section in `t/xref.json`; historical Hakka WIP produces the `h` section in `a/xref.json` and the `a` section in `h/xref.json`. Its comma-delimited strings preserve empty components, whose frontend meaning is “same title.”

**Tech Stack:** TypeScript, Bun test runner, Node `fs`/`path`; existing `canonicalJson`, `assertNoPua`, and pipeline pack writer.

## Global Constraints

- Generate a/h indexes from emitted entries; do not preserve or copy legacy checked-in index artifacts.
- Index order is Unicode scalar-value lexicographic order, not locale/ICU order.
- Keep existing Taiwanese index behavior unchanged.
- Read cross-reference sources only from explicit files in `inputDir`: `x-華語對照表.csv` and `work-in-progress.json`.
- Do not infer correspondence data from dictionary definitions or fixture output.
- Emit no xref direction when its required source is absent; seed the historical `萌` ↔ `發穎` correspondence in the Taiwanese transform.
- Preserve xref's legacy sectioned object wire shape and comma-delimited values exactly; empty components are semantic.
- Compare xrefs as parsed JSON semantics, never by legacy Perl hash serialization order.
- Tests must be red before their production implementation and cover absent source input, valid source generation, output direction, filters, and deterministic serialization.

---

### Task 1: Deterministic Mandarin and Hakka indexes

**Files:**
- Create: `src/pack/index.ts`
- Modify: `src/pack/pipeline.ts`
- Create: `tests/pack/index.test.ts`
- Modify: `tests/pack/golden-output.test.ts`
- Modify: `docs/pack-format-contract.md`

**Interfaces:**
- Produces `writeGeneratedIndex(lang: 'a' | 'h', titles: readonly string[], outputDir: string): void`.
- `runPack` calls it after duplicate removal and before special-pack assembly.
- The writer creates `<outputDir>/<lang>/index.json` with `canonicalJson(sortedUniqueTitles) + '\n'`.

- [ ] **Step 1: Write failing index tests**

```ts
it('writes sorted unique Unicode-scalar titles', () => {
  writeGeneratedIndex('a', ['𠮷', '乙', '甲', '甲'], out);
  expect(readJson(out, 'a/index.json')).toEqual(['乙', '甲', '𠮷']);
});

it('rejects uncurated PUA titles with index context', () => {
  expect(() => writeGeneratedIndex('h', ['\u{F0009}'], out)).toThrow('PUA');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/pack/index.test.ts`

Expected: failure because `~/pack/index` and `writeGeneratedIndex` do not exist.

- [ ] **Step 3: Implement the minimal index writer**

```ts
export function compareUnicodeScalars(left: string, right: string): number {
  const l = Array.from(left);
  const r = Array.from(right);
  for (let i = 0; i < Math.min(l.length, r.length); i++) {
    const diff = l[i]!.codePointAt(0)! - r[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return l.length - r.length;
}

export function writeGeneratedIndex(lang: 'a' | 'h', titles: readonly string[], outputDir: string): void {
  const index = [...new Set(titles)].sort(compareUnicodeScalars);
  const content = `${canonicalJson(index)}\n`;
  assertNoPua(content, `${lang}/index.json`);
  fs.mkdirSync(path.join(outputDir, lang), { recursive: true });
  fs.writeFileSync(path.join(outputDir, lang, 'index.json'), content);
}
```

Wire calls only for `lang === 'a' || lang === 'h'`, passing the same unique emitted titles used for pack records.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test tests/pack/index.test.ts tests/pack/golden-output.test.ts`

Expected: all focused assertions pass; current a/h fixture comparisons remain semantic-new-contract exclusions until Task 3 updates them.

- [ ] **Step 5: Commit**

```bash
git add src/pack/index.ts src/pack/pipeline.ts tests/pack/index.test.ts tests/pack/golden-output.test.ts docs/pack-format-contract.md
git commit -m "feat(pack): generate deterministic Mandarin and Hakka indexes"
```

### Task 2: Source-driven Taiwanese and Hakka xrefs

**Files:**
- Create: `src/pack/xref.ts`
- Modify: `src/pack/pipeline.ts`
- Create: `tests/pack/xref.test.ts`
- Modify: `docs/pack-format-contract.md`

**Interfaces:**
- Produces `writeXrefs(inputDir: string, outputDir: string, mandarinTitles: ReadonlySet<string>): void`.
- `x-華語對照表.csv` provides CSV rows `華語,詞條編號,詞條名稱`; it writes `a/xref.json` as `{ t: Record<string, string> }` and `t/xref.json` as `{ a: Record<string, string> }`. Empty comma components and the seeded `萌` ↔ `發穎` row are preserved.
- `work-in-progress.json` is an array with `詞目` and `對應華語`; it merges `{ h: Record<string, string> }` into `a/xref.json` after filtering emitted Mandarin keys, and writes `h/xref.json` as `{ a: Record<string, string> }`. The reverse Hakka map retains every target and autolinks recognized Mandarin targets.

- [ ] **Step 1: Write failing xref tests**

```ts
it('does not emit xrefs without explicit side sources', () => {
  writeXrefs(emptyInput, out, new Set(['萌']));
  expect(fs.existsSync(path.join(out, 'a', 'xref.json'))).toBe(false);
});

it('writes the legacy Taiwanese sectioned objects and preserves empty components', () => {
  writeFile('x-華語對照表.csv', '華語,詞條編號,詞條名稱\n萌,1,發穎\n同僚,2,同事\n不存在,3,無\n');
  writeXrefs(input, out, new Set(['萌', '同僚']));
  expect(readJson(out, 'a/xref.json')).toEqual({ t: { 萌: '發穎', 同僚: '同事,' } });
  expect(readJson(out, 't/xref.json')).toEqual({ a: { 發穎: '萌', 同事: '同僚' } });
});

it('writes Hakka M2H filtering and H2M autolinking asymmetrically', () => {
  writeFile('work-in-progress.json', JSON.stringify([{ 詞目: '【細人仔】', 對應華語: '小孩、兒童' }]));
  writeXrefs(input, out, new Set(['小孩']));
  expect(readJson(out, 'a/xref.json')).toEqual({ h: { 小孩: '細人仔' } });
  expect(readJson(out, 'h/xref.json')).toEqual({ a: { 細人仔: '`小孩~、兒童' } });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/pack/xref.test.ts`

Expected: failure because `~/pack/xref` and `writeXrefs` do not exist.

- [ ] **Step 3: Implement only the specified transformations**

Parse CSV with a BOM-safe line reader and preserve each source row's term order. Emit the legacy sectioned objects, not title-keyed language objects. In the Taiwanese transform, append a comma after every non-final CSV term, retain empty components, and seed `萌` ↔ `發穎`. Normalize Hakka `詞目` by removing `【`/`】`; M2H filters Mandarin keys through `mandarinTitles`, while H2M retains every `對應華語` target and applies legacy backtick/tilde autolinks to recognized Mandarin targets. Serialize each xref file with `canonicalJson` plus one trailing newline; object-key normalization is intentional because legacy Perl hash order was not canonical.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test tests/pack/xref.test.ts`

Expected: all three source/absence/direction tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pack/xref.ts src/pack/pipeline.ts tests/pack/xref.test.ts docs/pack-format-contract.md
git commit -m "feat(pack): generate cross-language xrefs from source data"
```

### Task 3: Full-language semantic golden verification

**Files:**
- Modify: `tests/pack/golden-output.test.ts`
- Modify: `docs/pack-format-contract.md`

**Interfaces:**
- The harness runs `runPack` separately for `a`, `t`, and `h` when the corresponding source input exists.
- For `a/index.json` and `h/index.json`, assert the generated semantic/new-contract fixture explicitly rather than legacy checked-in order.
- For each xref file, parse and compare the legacy sectioned objects and comma-delimited values semantically; all other generated files remain byte comparisons.

- [ ] **Step 1: Write failing multi-language golden test**

```ts
it('compares every generated language output', async () => {
  for (const lang of ['a', 't', 'h'] as const) await runAndCompare(lang);
  expect(comparedPaths).toContain('t/index.json');
  expect(comparedPaths).toContain('a/xref.json');
  expect(comparedPaths).toContain('h/xref.json');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `MOEDICT_PACK_INPUT=../moedict-data bun test tests/pack/golden-output.test.ts`

Expected: fail because the current harness only runs Mandarin and filters a/ plus pack/.

- [ ] **Step 3: Implement semantic comparison and update fixture contract**

Replace the a/ plus pack/ filter with explicit generated-path selection. Use `JSON.parse` equality only for xrefs. Keep raw byte comparison for entries, buckets, specials, and `t/index.json`. Regenerate a/h index expected files from the specified scalar-order contract or provide test-local expected arrays; do not replace them with legacy artifacts.

- [ ] **Step 4: Run full verification**

Run:

```bash
MOEDICT_PACK_INPUT=../moedict-data MOEDICT_PACK_CONCURRENCY=18 bun test tests/pack/golden-output.test.ts
bun run build
bun test
```

Expected: full-source golden pass; TypeScript build clean; complete suite passes.

- [ ] **Step 5: Commit**

```bash
git add tests/pack/golden-output.test.ts docs/pack-format-contract.md tests/pack/fixtures
git commit -m "test(pack): verify generated metadata across languages"
```
