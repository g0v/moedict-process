# Definition Source Invariants

## Problem

The modern 18-column revised-dictionary workbook stores definitions in column 15 and multi-pronunciation cross-reference metadata in column 16. The parser currently maps column 16 as `notes` and passes it to `parseDefs`. Its later phonetic cleanup removes most cross-reference lines but leaves standalone internal IDs such as `（095030026）` and fullwidth markers such as `（二）ㄌㄧㄣˋ` as user-visible definitions.

The legacy workbook has different semantics: column 10 contains definitions and column 11 contains editorial notes that must remain eligible to become definitions. The fix must preserve this legacy behavior while making modern column 16 unreachable from definition parsing.

## Decision

Put the proof at the routing boundary. A verified, zero-allocation helper will be the sole authority for selecting definition-bearing source columns. It accepts the row length and a source slot:

- slot `0`: primary definitions
- slot `1`: optional legacy editorial notes

Its contract is:

| Row format | Slot 0 | Slot 1 |
|---|---:|---:|
| modern, `rowLength >= 18` | `15` | `-1` |
| legacy, `rowLength < 18` | `10` | `11` |

The `-1` sentinel means that the source is absent. The helper also proves explicitly that modern rows never select column 16.

`parseHeteronym` must use the helper's results directly. It always parses slot 0. It parses slot 1 only when the returned index is non-negative and the cell is present. `ColumnMap` will no longer classify modern column 16 as editorial notes.

## LemmaScript properties

The selector will carry verified preconditions and postconditions equivalent to:

```text
requires rowLength >= 0
requires source == 0 || source == 1

rowLength >= 18 && source == 0 ==> result == 15
rowLength >= 18 && source == 1 ==> result == -1
rowLength < 18 && source == 0 ==> result == 10
rowLength < 18 && source == 1 ==> result == 11
rowLength >= 18 ==> result != 16
```

These properties establish the source-provenance invariant for every `parseDefs` call made by `parseHeteronym`:

```text
modern definitions originate only from column 15
legacy definitions originate only from columns 10 or 11
```

The proof deliberately does not classify strings such as `（digits）`. Marker exclusion would prove a symptom and could reject legitimate text while allowing future metadata formats to leak.

## Runtime structure

The selector performs only integer comparisons and returns an integer. It allocates no arrays, objects, tags, or provenance records per spreadsheet row.

`pickColumnMap` remains responsible for non-definition columns. Definition-source routing is removed from that general map so the verified helper cannot be bypassed accidentally by a misleading `notes` field.

## Verification boundaries

LemmaScript proves the column-routing relationship. SheetJS cell decoding, regular-expression definition parsing, and TypeScript object assembly remain trusted runtime boundaries and require behavioral tests.

Focused tests will establish:

1. A modern row parses column 15 and ignores non-empty column 16.
2. A legacy row parses both column 10 definitions and column 11 editorial notes.
3. Exact `造化`-shaped modern rows do not emit internal IDs.
4. Fullwidth multi-pronunciation metadata does not become a definition.
5. The real current workbook produces zero definitions matching the known leaked metadata shapes after parsing.
6. `bun run verify` proves the selector contracts.

## Non-goals

- Preserving multi-pronunciation cross-reference metadata in the output schema.
- Adding output regex filters for internal IDs or phonetic markers.
- Refactoring `parseDefs`, heteronym deduplication, or pack serialization.
- Changing legacy editorial-note behavior.
