#!/usr/bin/env python3
# -*- coding: utf8 -*-
"""Merge cedict/cfdict/handedict translations into a moedict JSON array."""

from __future__ import annotations

import argparse
import codecs
import json
import re
from collections import defaultdict as dd

FWDICT_RE = re.compile(
    r"(?P<tradi>[^ ]+) +(?P<simpl>[^ ]+) +\[(?P<pinyin>[^\]]+)\] +(?P<def>\/.*)$",
    re.UNICODE,
)


def read_dict(infile: str) -> dd:
    fwdict: dd = dd(list)
    with codecs.open(infile, "r", "utf8") as handle:
        for line in handle:
            line = line.strip()
            if line == "" or line[0] == "#":
                continue
            match = FWDICT_RE.search(line)
            if not match:
                print(line)
                continue
            fwdict[match.group("tradi")].extend(
                match.group("def").replace("(u.E.)", "")[1:-1].split("/")
            )
    return fwdict


def inject_translations(
    moedict: list,
    cedict: dd,
    cfdict: dd,
    handedict: dd,
) -> None:
    for entry in moedict:
        form = entry["title"]
        for lang, fwdict in [
            ("English", cedict),
            ("francais", cfdict),
            ("Deutsch", handedict),
        ]:
            if form in fwdict:
                if "translation" not in entry:
                    entry["translation"] = {}
                entry["translation"][lang] = fwdict[form]
                entry[lang] = fwdict[form][0]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inject cedict/cfdict/handedict translations into moedict JSON."
    )
    parser.add_argument(
        "--cedict",
        default="./translation-data/cedict.txt",
        help="CEDICT text (default: ./translation-data/cedict.txt)",
    )
    parser.add_argument(
        "--cfdict",
        default="./translation-data/cfdict.txt",
        help="CFDICT text (default: ./translation-data/cfdict.txt)",
    )
    parser.add_argument(
        "--handedict",
        default="./translation-data/handedict.txt",
        help="Handedict text (default: ./translation-data/handedict.txt)",
    )
    parser.add_argument(
        "--moedict",
        default="./moedict-data/dict-revised.json",
        help="Source moedict JSON array (default: ./moedict-data/dict-revised.json)",
    )
    parser.add_argument(
        "--output",
        default="./translation-data/moe-translation.json",
        help="Enriched output JSON (default: ./translation-data/moe-translation.json)",
    )
    args = parser.parse_args()

    cedict = read_dict(args.cedict)
    handedict = read_dict(args.handedict)
    cfdict = read_dict(args.cfdict)

    with open(args.moedict, encoding="utf-8") as handle:
        moedict = json.load(handle)

    inject_translations(moedict, cedict, cfdict, handedict)

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(moedict, handle)


if __name__ == "__main__":
    main()
