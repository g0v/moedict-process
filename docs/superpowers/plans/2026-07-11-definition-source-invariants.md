# Definition Source Invariants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the legacy/modern definition-source mapping with LemmaScript and make `parseHeteronym` exclusively consume that mapping so modern 多音參見 column 16 cannot become definitions.

**Architecture:** Add a verified, allocation-free `definitionSourceColumn(rowLength, source)` selector to the already verified Excel module. Remove definition and notes indices from the general `ColumnMap`; `parseHeteronym` routes its primary and optional editorial inputs only through the selector. LemmaScript proves the selector mapping, focused tests prove parser consumption, and a before/after full-workbook semantic diff characterizes all changed entries.

**Tech Stack:** Bun 1.3+, TypeScript 5.7, `bun:test`, SheetJS, LemmaScript 0.5.13 with Dafny backend.

## Global Constraints

- Modern rows (`rowLength >= 18`) select column 15 for primary definitions and `-1` for the absent editorial source.
- Legacy rows (`rowLength < 18`) select column 10 for primary definitions and column 11 for editorial notes.
- Modern column 16 must never be selected as a definition source.
- The selector parameter is `source: number` with a LemmaScript precondition, not the unsupported numeric-literal union `0 | 1`.
- The selector allocates no arrays, objects, tags, or provenance records.
- Do not add marker-shaped output filters.
- Preserve legacy editorial-note behavior.
- Treat `parseHeteronym`, regex parsing, SheetJS decoding, and object assembly as tested trust boundaries; do not claim LemmaScript verifies them.
- Skip project-wide formatter, lint, and test commands until the final verification phase.

---

### Task 1: Verified definition-source selector

**Files:**
- Modify: `src/excel.ts:7-14`
- Modify: `tests/excel.test.ts:1-83`

**Interfaces:**
- Consumes: `rowLength: number`, where `rowLength >= 0`; `source: number`, where `source === 0 || source === 1`.
- Produces: `export function definitionSourceColumn(rowLength: number, source: number): number`.
- Contract: modern rows map slots to `15, -1`; legacy rows map slots to `10, 11`; modern rows never return `16`.

- [ ] **Step 1: Add failing selector tests**

Change the import in `tests/excel.test.ts` and add the following block after `cellTypeToCtype` tests:

```ts
import {
  cellTypeToCtype,
  definitionSourceColumn,
  iterateSheetRows,
} from '../src/excel';

// ...existing tests...

describe('definitionSourceColumn', () => {
  it('routes modern rows only to definitions column 15', () => {
    expect(definitionSourceColumn(18, 0)).toBe(15);
    expect(definitionSourceColumn(18, 1)).toBe(-1);
    expect(definitionSourceColumn(20, 0)).toBe(15);
    expect(definitionSourceColumn(20, 1)).toBe(-1);
  });

  it('routes legacy rows to definitions column 10 and editorial column 11', () => {
    expect(definitionSourceColumn(14, 0)).toBe(10);
    expect(definitionSourceColumn(14, 1)).toBe(11);
    expect(definitionSourceColumn(17, 0)).toBe(10);
    expect(definitionSourceColumn(17, 1)).toBe(11);
  });
});
```

- [ ] **Step 2: Run the selector tests and confirm the red state**

Run:

```bash
bun test tests/excel.test.ts
```

Expected: FAIL because `definitionSourceColumn` is not exported by `src/excel.ts`.

- [ ] **Step 3: Implement the verified selector**

Add immediately after `cellTypeToCtype` in `src/excel.ts`:

```ts
/** Select a definition-bearing source column: 0=primary, 1=legacy editorial notes. */
export function definitionSourceColumn(rowLength: number, source: number): number {
  //@ verify
  //@ requires rowLength >= 0
  //@ requires source === 0 || source === 1
  //@ ensures (rowLength >= 18 && source === 0) ==> \result === 15
  //@ ensures (rowLength >= 18 && source === 1) ==> \result === -1
  //@ ensures (rowLength < 18 && source === 0) ==> \result === 10
  //@ ensures (rowLength < 18 && source === 1) ==> \result === 11
  //@ ensures rowLength >= 18 ==> \result !== 16
  if (source === 0) return rowLength >= 18 ? 15 : 10;
  return rowLength >= 18 ? -1 : 11;
}
```

- [ ] **Step 4: Run focused runtime and formal verification**

Run:

```bash
bun test tests/excel.test.ts
bun run verify
```

Expected: Excel tests PASS; LemmaScript/Dafny exits 0 and proves `definitionSourceColumn` without type-lowering errors.

- [ ] **Step 5: Commit the verified selector**

```bash
git add src/excel.ts tests/excel.test.ts
git commit -m "feat: verify definition source columns"
```

---

### Task 2: Route parser definitions exclusively through the selector

**Files:**
- Modify: `src/types.ts:38-50`
- Modify: `src/parse.ts:160-249`
- Modify: `tests/parse.test.ts:1-414`

**Interfaces:**
- Consumes: `definitionSourceColumn(rowLength, 0 | 1)` from Task 1; the runtime calls use numeric constants, while the function signature remains `source: number`.
- Produces: `parseHeteronym(cells)` where modern definitions originate only from column 15 and legacy definitions originate from columns 10 and 11.
- Removes: `ColumnMap.definitions` and `ColumnMap.notes`.

- [ ] **Step 1: Replace the incorrect modern-notes test with failing boundary tests**

Refactor the local modern fixture so definition metadata is not represented as `keyof ColumnMap`:

```ts
type ModernRowOverrides = Partial<Record<keyof import('../src/types').ColumnMap, unknown>> & {
  definitions?: unknown;
  crossReference?: unknown;
};

function modernRow(overrides: ModernRowOverrides = {}): SourceCell[] {
  const row: SourceCell[] = new Array(20).fill(null).map(() => empty());
  row[0] = cell('花枝招展');
  row[2] = cell(2);
  row[4] = cell('');
  row[5] = cell(0);
  row[6] = cell(0);
  row[8] = cell('ㄏㄨㄚ ㄓ ㄓㄠ ㄓㄢˇ');
  row[11] = cell('huā zhī zhāo zhǎn');
  row[13] = cell('');
  row[14] = cell('');
  row[15] = cell(overrides.definitions ?? '形容花木枝葉迎風搖擺。');
  row[16] = overrides.crossReference === undefined ? empty() : cell(overrides.crossReference);

  const map = {
    title: 0,
    term_type: 2,
    radical: 4,
    stroke_count: 5,
    non_radical_stroke_count: 6,
    bopomofo: 8,
    pinyin: 11,
    synonyms: 13,
    antonyms: 14,
  } satisfies Record<keyof import('../src/types').ColumnMap, number>;
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'definitions' || key === 'crossReference') continue;
    row[map[key as keyof typeof map]] = cell(value);
  }
  return row;
}
```

Replace the old “appends notes block” test and the ctype-0 notes test with:

```ts
it('ignores modern multi-pronunciation metadata, including internal IDs', () => {
  const row = modernRow({
    definitions: '化育萬物的大自然。',
    crossReference: '(二)ㄗㄠˋ ．ㄏㄨㄚ\n（095030026）',
  });
  const { heteronym } = parseHeteronym(row);
  expect(heteronym.definitions).toEqual([{ def: '化育萬物的大自然。' }]);
});

it('ignores fullwidth modern multi-pronunciation metadata', () => {
  const row = modernRow({
    definitions: '從高處往下看。',
    crossReference: '（二）ㄌㄧㄣˋ',
  });
  const { heteronym } = parseHeteronym(row);
  expect(heteronym.definitions).toEqual([{ def: '從高處往下看。' }]);
});

it('preserves legacy editorial notes from column 11', () => {
  const row: SourceCell[] = new Array(14).fill(null).map(() => empty());
  row[0] = cell(2);
  row[2] = cell('舊格式');
  row[6] = cell('ㄐㄧㄡˋ ㄍㄜˊ ㄕˋ');
  row[7] = cell('jiù gé shì');
  row[10] = cell('[名]主義。');
  row[11] = cell('[動]附義。');
  const { heteronym } = parseHeteronym(row);
  expect(heteronym.definitions).toEqual([
    { def: '主義。', type: '名' },
    { def: '附義。', type: '動' },
  ]);
});
```

- [ ] **Step 2: Run parser tests and confirm the red state**

Run:

```bash
bun test tests/parse.test.ts
```

Expected: the two modern boundary tests FAIL because column 16 still becomes definitions; the legacy test passes and guards behavior that must remain.

- [ ] **Step 3: Remove definition sources from the general column map**

Delete these properties from `ColumnMap` in `src/types.ts`:

```ts
definitions: number;
notes: number;
```

Delete the matching `definitions` and `notes` members from `LEGACY_COLUMNS` and `MODERN_COLUMNS` in `src/parse.ts`.

- [ ] **Step 4: Make the selector the parser's exclusive routing boundary**

Import the selector in `src/parse.ts`:

```ts
import { definitionSourceColumn } from './excel';
```

Replace the current definition initialization and notes append path with:

```ts
const definitionsColumn = definitionSourceColumn(cells.length, 0);
const editorialColumn = definitionSourceColumn(cells.length, 1);
const heteronym: Heteronym = {
  bopomofo: cellText(cells, col.bopomofo),
  pinyin: cellText(cells, col.pinyin),
  definitions: parseDefs(cellText(cells, definitionsColumn)),
};

associateToDefs('synonyms', normalizeText(cellText(cells, col.synonyms)), heteronym.definitions!);
associateToDefs('antonyms', normalizeText(cellText(cells, col.antonyms)), heteronym.definitions!);

if (editorialColumn >= 0) {
  const editorialCell = cells[editorialColumn];
  if (editorialCell && editorialCell.ctype !== 0) {
    heteronym.definitions!.push(...parseDefs(cellText(cells, editorialColumn)));
  }
}
```

Do not add a fallback path that reads modern column 16.

- [ ] **Step 5: Run focused parser, integration, and type checks**

Run:

```bash
bun test tests/parse.test.ts tests/integration.test.ts
bun run typecheck
bun run verify
```

Expected: all focused tests PASS; TypeScript exits 0; LemmaScript/Dafny exits 0.

- [ ] **Step 6: Commit parser routing**

```bash
git add src/types.ts src/parse.ts tests/parse.test.ts
git commit -m "fix: exclude pronunciation metadata from definitions"
```

---

### Task 3: Full-workbook semantic verification and cleanup

**Files:**
- Modify if findings require clarification: `docs/superpowers/specs/2026-07-11-definition-source-invariants-design.md`
- No permanent comparison script; use `/tmp` artifacts so repository code remains focused.

**Interfaces:**
- Consumes: the current official workbook, a baseline JSON generated before Task 2, and a fixed JSON generated after Task 2.
- Produces: evidence that all changed entries are explained by removal of column-16 metadata, including any different heteronym survivor selected by `dedupeHeteronyms`.

- [ ] **Step 1: Generate the fixed full-workbook output**

Using the same workbook and source directory used for the baseline investigation, run:

```bash
MOEDICT_SOURCE_DIR=/tmp/issue100-source \
MOEDICT_OUTPUT=/tmp/issue100-dict-revised-fixed.json \
bun run parse
```

Expected: 163,920 rows parse into 161,194 entries and the fixed JSON is written.

- [ ] **Step 2: Compare every changed entry semantically**

Use a one-off JavaScript comparison over `/tmp/issue100-dict-revised.json` and `/tmp/issue100-dict-revised-fixed.json` with this logic:

```js
const fs = await import('node:fs/promises');
const before = JSON.parse(await fs.readFile('/tmp/issue100-dict-revised.json', 'utf8'));
const after = JSON.parse(await fs.readFile('/tmp/issue100-dict-revised-fixed.json', 'utf8'));
const byTitle = (entries) => new Map(entries.map((entry) => [entry.title, entry]));
const beforeByTitle = byTitle(before);
const afterByTitle = byTitle(after);
const changed = [];
for (const [title, oldEntry] of beforeByTitle) {
  const newEntry = afterByTitle.get(title);
  if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
    changed.push({ title, before: oldEntry, after: newEntry });
  }
}
const marker = /^（\d+）$|^（[一二三四五六七八九十]）[˙ˇˊˋㄅ-ㄩㄚ-ㄦ]/u;
const stripMarkers = (entry) => ({
  ...entry,
  heteronyms: entry.heteronyms.map((heteronym) => ({
    ...heteronym,
    definitions: heteronym.definitions?.filter((definition) => !marker.test(definition.def)),
  })),
});
const unexplained = changed.filter(({ before: oldEntry, after: newEntry }) =>
  JSON.stringify(stripMarkers(oldEntry)) !== JSON.stringify(newEntry),
);
console.log(JSON.stringify({ changed: changed.length, unexplained }, null, 2));
if (unexplained.length > 0) process.exitCode = 1;
```

Expected first pass: report every changed title and explicitly expose any non-marker differences caused by `dedupeHeteronyms`; do not assume `unexplained` is empty.

If `unexplained` is non-empty, inspect each complete before/after entry. Classify it as intended only when the surviving heteronym differs solely because the removed cross-reference metadata previously made a duplicate serialize longer; otherwise stop and revise the routing design or dedupe ordering. Record the final count and characterization in the implementation summary.

- [ ] **Step 3: Assert zero leaked metadata after the fix**

Scan every fixed definition with both known patterns:

```js
const leaked = [];
for (const entry of after) {
  for (const heteronym of entry.heteronyms ?? []) {
    for (const definition of heteronym.definitions ?? []) {
      if (marker.test(definition.def)) leaked.push({ title: entry.title, def: definition.def });
    }
  }
}
console.log({ leakedDefinitions: leaked.length, leaked });
if (leaked.length > 0) process.exitCode = 1;
```

Expected: `leakedDefinitions: 0`.

- [ ] **Step 4: Run final focused verification**

Run:

```bash
bun test tests/excel.test.ts tests/parse.test.ts tests/integration.test.ts
bun run typecheck
bun run verify
```

Expected: all selected tests pass with zero failures; TypeScript exits 0; LemmaScript/Dafny exits 0.

- [ ] **Step 5: Commit the amended spec and implementation plan**

```bash
git add docs/superpowers/specs/2026-07-11-definition-source-invariants-design.md \
  docs/superpowers/plans/2026-07-11-definition-source-invariants.md
git commit -m "docs: plan verified definition routing"
```
