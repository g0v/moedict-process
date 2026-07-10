#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Parse CFDICT XML into cedict-format lines (ported from moedict-webkit)."""

from __future__ import annotations

import argparse
import codecs
import re
from collections import defaultdict as dd

from lxml import etree

PINYIN_RE = re.compile(r"(?P<py>[^\]1-5A-Z]+\d)", re.UNICODE)
ALPHA_RE = re.compile(r"(?P<alpha>[A-Z]+)", re.UNICODE)


def read_xml_dict(infile: str) -> list[dd]:
    with codecs.open(infile, "r", "utf-8", "ignore") as handle:
        parser = etree.XMLParser(recover=True)
        tree = etree.parse(handle, parser=parser)
        root = tree.getroot()
        words: list[dd] = []
        for word in root.iter("word"):
            parsed_word: dd = dd(list)
            for ele in word.iter():
                if ele.tag is not None and ele.text is not None:
                    text = ele.text.strip(" ")
                    if ele.tag == "py":
                        text = PINYIN_RE.sub(r"\g<py> ", text, re.UNICODE)
                        text = ALPHA_RE.sub(r"\g<alpha> ", text, re.UNICODE)
                        text = text.rstrip(" ")
                    parsed_word[ele.tag].append(text)
            words.append(parsed_word)
    return words


def write_cfdict_txt(words: list[dd], outfile: str) -> None:
    with codecs.open(outfile, "w", "utf-8") as handle:
        for item in words:
            if len(item["trad"]) > 0:
                line = (
                    item["trad"][0]
                    + " "
                    + item["simp"][0]
                    + " ["
                    + item["py"][0]
                    + "] "
                )
                for trans in item["fr"]:
                    line = line + "/" + trans
                if len(item["fr"]) > 0:
                    line = line + "/"
                handle.write(line)
                handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert CFDICT XML to cedict-format text lines."
    )
    parser.add_argument(
        "--input-xml",
        default="./translation-data/cfdict.xml",
        help="Source CFDICT XML (default: ./translation-data/cfdict.xml)",
    )
    parser.add_argument(
        "--output-txt",
        default="./translation-data/cfdict.txt",
        help="Destination cedict-format text (default: ./translation-data/cfdict.txt)",
    )
    args = parser.parse_args()
    words = read_xml_dict(args.input_xml)
    write_cfdict_txt(words, args.output_txt)


if __name__ == "__main__":
    main()
