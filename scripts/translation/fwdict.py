#!/usr/bin/env python3
# -*- coding: utf8 -*-
"""Shared CEDICT-format loaders and MOE-aware gloss ordering."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from typing import Any

FWDICT_RE = re.compile(
    r"(?P<tradi>[^ ]+) +(?P<simpl>[^ ]+) +\[(?P<pinyin>[^\]]+)\] +(?P<def>\/.*)$",
    re.UNICODE,
)

_COMBINING_TONE = {
    "\u0304": "1",  # macron  ā
    "\u0301": "2",  # acute   á
    "\u030c": "3",  # caron   ǎ
    "\u0300": "4",  # grave   à
}

# Explicit syllable separators shared by MOE (space) and CEDICT (space / rare ').
_BOUNDARY_CHARS = set(" \t'’ʻʹˈ‧·")


def _normalize_token(raw: str) -> list[str]:
    """Normalize one boundary-delimited token into one or more numbered syllables.

    A token is usually one syllable (MOE ``niǎo``, CEDICT ``niao3``). CEDICT
    occasionally writes compact multi-syllable tokens (``shi2ke4``); those are
    split on tone digits.

    Boundary-less tone-marked multisyllables (``tiáopèi``) are **not**
    syllabified. Multiple tone marks in one token become an opaque key that
    preserves every mark (so ``tiáopèi`` ≠ ``tiàopèi``) and cannot match
    spaced/numbered pinyin — fail-safe unmatched rather than last-tone-wins.
    """
    if not raw:
        return []
    text = raw.lower().replace("u:", "ü")
    text = re.sub(r"(?<=[nl])v", "ü", text)
    text = unicodedata.normalize("NFD", text)

    chars: list[str] = []
    tone_mark_count = 0
    explicit_digit = False
    for ch in text:
        if ch in _COMBINING_TONE:
            tone_mark_count += 1
            # Emit immediately after the base letter so multiple marks stay distinct.
            chars.append(_COMBINING_TONE[ch])
            continue
        if ch == "\u0308":
            if chars and chars[-1] == "u":
                chars[-1] = "v"
            continue
        if ch.isalpha():
            chars.append("v" if ch == "ü" else ch)
            continue
        if ch.isdigit() and ch in "12345":
            chars.append(ch)
            explicit_digit = True
            continue

    run = "".join(chars)
    if not run:
        return []

    # Multiple tone marks without explicit CEDICT digits → opaque multi-syllable
    # token (no guessed boundaries).
    if tone_mark_count >= 2 and not explicit_digit:
        return ["!" + run]

    # Single tone mark on a syllable with trailing finals: digit may sit mid-run
    # (n i 3 a o). Move the sole tone digit to the end of the letter cluster.
    if tone_mark_count == 1 and not explicit_digit:
        letters = [c for c in run if c.isalpha()]
        digits = [c for c in run if c.isdigit()]
        if letters and digits:
            run = "".join(letters) + digits[-1]

    parts = re.findall(r"[a-z]+[1-5]?", run)
    out: list[str] = []
    for p in parts:
        if not p:
            continue
        if p[-1] not in "12345":
            p = p + "5"
        out.append(p)
    return out



def normalize_pinyin(value: str | None) -> str:
    """Canonical pinyin key matching CEDICT numbered form to MOE tone-marked form.

    - case-insensitive
    - ``u:`` / ``ü`` / CEDICT ``v`` (after n/l) → ``v``
    - tone marks → digit; explicit digits kept; unmarked syllable → ``5``
    - spaces and apostrophes become canonical boundary ``'`` so
      ``xī'ān`` / ``xī ān`` / ``xi1 an1`` match each other but never ``xiān``
    - compact CEDICT runs with tone digits (``shi2ke4``) split on those digits
    - no heuristic syllabification of boundary-less tone-marked multisyllables
    """
    if value is None:
        return ""
    text = str(value).strip().lower()
    if not text:
        return ""

    chunks: list[str] = []
    buf: list[str] = []
    for ch in text:
        if ch in _BOUNDARY_CHARS:
            if buf:
                chunks.append("".join(buf))
                buf = []
            if chunks and chunks[-1] != "'":
                chunks.append("'")
            continue
        buf.append(ch)
    if buf:
        chunks.append("".join(buf))

    syllables: list[str] = []
    for tok in chunks:
        if tok == "'":
            if syllables and syllables[-1] != "'":
                syllables.append("'")
            continue
        for syl in _normalize_token(tok):
            syllables.append(syl)
            syllables.append("'")

    while syllables and syllables[-1] == "'":
        syllables.pop()
    while syllables and syllables[0] == "'":
        syllables.pop(0)
    collapsed: list[str] = []
    for p in syllables:
        if p == "'" and collapsed and collapsed[-1] == "'":
            continue
        collapsed.append(p)
    return "".join(collapsed)


def read_dict(infile: str) -> dict[str, list[dict[str, Any]]]:
    """Load CEDICT-format file as form → [{pinyin, defs}, ...] in source order."""
    fwdict: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with open(infile, "r", encoding="utf8") as handle:
        for line in handle:
            line = line.strip()
            if line == "" or line[0] == "#":
                continue
            match = FWDICT_RE.search(line)
            if not match:
                print(line)
                continue
            # Keep empty segments from `//` (legacy split behaviour). Filtering
            # them would change the gloss multiset, not just order.
            defs = match.group("def").replace("(u.E.)", "")[1:-1].split("/")
            fwdict[match.group("tradi")].append(
                {"pinyin": match.group("pinyin"), "defs": defs}
            )
    return fwdict


def order_glosses(
    groups: list[dict[str, Any]],
    heteronyms: list[dict[str, Any]] | None,
) -> list[str]:
    """Order gloss strings by MOE heteronym order.

    The result is a permutation of the input multiset of gloss strings:
    same strings, same counts, order only. Never a filter.

    Fail-safe (deliberate): when no source pinyin matches any MOE reading,
    keep source order and do not blank. Wrong lead is the bug we fix;
    dropping real glosses would be worse.
    """
    flat: list[tuple[str | None, str]] = []
    for group in groups:
        py = group.get("pinyin")
        for d in group.get("defs") or []:
            flat.append((py if isinstance(py, str) else None, d))

    if not flat:
        return []

    moe_keys: list[str] = []
    for h in heteronyms or []:
        if not isinstance(h, dict):
            continue
        raw = h.get("pinyin")
        key = normalize_pinyin(raw if isinstance(raw, str) else None)
        if key:
            moe_keys.append(key)

    if not moe_keys:
        # No readings to order by — source order (fail-safe).
        return [d for _, d in flat]

    used = [False] * len(flat)
    ordered: list[str] = []

    for mk in moe_keys:
        for i, (py, d) in enumerate(flat):
            if used[i]:
                continue
            if normalize_pinyin(py) == mk:
                ordered.append(d)
                used[i] = True

    for i, (_py, d) in enumerate(flat):
        if not used[i]:
            ordered.append(d)

    return ordered


def inject_translations(
    moedict: list,
    cedict: dict[str, list[dict[str, Any]]],
    cfdict: dict[str, list[dict[str, Any]]],
    handedict: dict[str, list[dict[str, Any]]],
) -> None:
    for entry in moedict:
        form = entry["title"]
        heteronyms = entry.get("heteronyms") or []
        for lang, fwdict in [
            ("English", cedict),
            ("francais", cfdict),
            ("Deutsch", handedict),
        ]:
            if form not in fwdict:
                continue
            ordered = order_glosses(fwdict[form], heteronyms)
            if not ordered:
                continue
            if "translation" not in entry:
                entry["translation"] = {}
            entry["translation"][lang] = ordered
            entry[lang] = ordered[0]
