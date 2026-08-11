#!/usr/bin/env python3
# -*- coding: utf8 -*-
"""Merge cedict/cfdict/handedict translations into CSLD moedict JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fwdict import inject_translations, read_dict  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inject cedict/cfdict/handedict translations into CSLD moedict JSON."
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
        default="./moedict-data-csld/dict-csld.json",
        help="Source CSLD moedict JSON (default: ./moedict-data-csld/dict-csld.json)",
    )
    parser.add_argument(
        "--output",
        default="./translation-data/csld-translation.json",
        help="Enriched output JSON (default: ./translation-data/csld-translation.json)",
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
