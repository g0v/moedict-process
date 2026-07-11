# ID-aware Taiwanese Cross-references

## Problem

`src/pack/xref.ts` reads `x-華語對照表.csv` but discards column 2, `詞條編號`, before generating reverse Taiwanese-to-Mandarin cross-references. The generated `t/xref.json` groups only by Taiwanese title and comma-encodes all Mandarin targets. Polyphonic titles therefore lose the association between a target word and its Taiwanese heteronym.

For `照`, the source distinguishes heteronyms `9746` and `9747`, but the current output flattens their reverse mappings to `"依照,按照,,證照"`. No consumer can reconstruct the reading association reliably after this loss.

## Decision

Treat every accepted TWBLG correspondence as the semantic triple:

```text
(mandarin, taiwaneseTitle, heteronymId)
```

The forward Mandarin-to-Taiwanese map retains its legacy string format and deduplicates by `(mandarin, taiwaneseTitle)`. The reverse Taiwanese-to-Mandarin map makes a clean cutover to explicit records grouped by Taiwanese title:

```json
{
  "a": {
    "照": [
      { "id": "9746", "word": "依照" },
      { "id": "9746", "word": "按照" },
      { "id": "9747", "word": "照" },
      { "id": "9746", "word": "證照" }
    ]
  }
}
```

Reverse records deduplicate by the complete triple and preserve first-source order. Identity correspondences remain explicit words rather than the legacy empty-string sentinel. This representation lets consumers group or render records by heteronym ID without semantic inference.

## Directional deduplication

Forward and reverse projections have different identities and must execute independently:

- forward identity: `(mandarin, taiwaneseTitle)`
- reverse identity: `(taiwaneseTitle, heteronymId, mandarin)`

The current early `continue` based on the forward map must not suppress reverse insertion. A Mandarin term may legitimately map to two heteronyms sharing one Taiwanese title; forward output should contain the title once while reverse output must retain both IDs.

Exact duplicate triples collapse. Records with the same title and word but different IDs remain distinct.

## LemmaScript boundary

A verified unit models an accepted correspondence triple and its reverse projection. LemmaScript proves the information-preserving scalar relationships that are within its verified subset:

```text
accepted(mandarin, taiwaneseTitle, heteronymId)
  requires all three strings are non-empty

reverseId(accepted) == heteronymId
reverseWord(accepted) == mandarin
```

The TypeScript grouping loop is structured around this verified projection so no reverse record can be emitted without passing through it.

The collection-level invariant is:

```text
flatten(reverseGroups) == dedupe(acceptedTriples)
```

with reverse group identity `(taiwaneseTitle, heteronymId)`. LemmaScript proves the per-triple projection; focused behavioral tests prove grouping, order, complete-triple deduplication, and flattening over collections. CSV decoding, Mandarin-title membership, the existing digit filter, canonical JSON serialization, and filesystem output remain trusted runtime boundaries.

The verified helper must not allocate temporary provenance containers beyond the reverse record required by the output contract. It must preserve the input string values exactly; normalization is not introduced.

## Input acceptance

A TWBLG row is accepted only when:

- Mandarin title, heteronym ID, and Taiwanese title are non-empty;
- the Mandarin title exists in the supplied Mandarin title set;
- the Taiwanese title passes the existing digit exclusion.

Malformed or ineligible rows remain omitted. No new normalization or CSV dialect change is part of this work.

## Output compatibility

`t/xref.json` is intentionally a breaking schema change from `Record<string, string>` to `Record<string, Array<{ id: string; word: string }>>` inside its `a` section.

`a/xref.json` retains its existing Taiwanese forward-map format, including empty-string identity components, because that direction does not select a Taiwanese heteronym. Hakka xref generation and output remain unchanged.

## Verification

Focused tests establish:

1. CSV column 2 survives as every reverse record's `id`.
2. Two rows for one Taiwanese title with different IDs remain distinct.
3. A duplicated `(mandarin, taiwaneseTitle)` forward relation does not suppress a distinct reverse ID relation.
4. Exact duplicate triples collapse while preserving first-source order.
5. Identity rows emit their Mandarin word explicitly in reverse output.
6. Flattening reverse groups reproduces the accepted triples after complete-triple deduplication.
7. Existing Mandarin-to-Taiwanese bytes remain unchanged for equivalent fixtures.
8. Hakka output remains unchanged.
9. `bun run verify` proves the scalar projection contracts.
10. The focused xref test suite and typecheck pass.

## Non-goals

- Changing the Mandarin-to-Taiwanese xref schema.
- Changing Hakka cross-references.
- Updating web consumers in this repository change.
- Inferring heteronym IDs from titles, readings, or definitions.
- Adding compatibility sidecars, aliases, or dual reverse representations.
