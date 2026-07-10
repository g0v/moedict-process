# Translation pipeline scripts

Python 3 ports of the legacy `moedict-webkit/translation-data/` helpers.
The py2 originals (`xml2txt.py`, `txt2json.py`, `csld2json.py`) are slated
for retirement once pack retirement lands in `moedict-process`.

## Provenance

| Script | Origin | Notes |
|--------|--------|-------|
| `xml2txt.py` | `moedict-webkit/translation-data/xml2txt.py` | Ported 2026-07-09; CLI args added |
| `txt2json.py` | `moedict-webkit/translation-data/txt2json.py` | Ported 2026-07-09; CLI args added |
| `csld2json.py` | `moedict-webkit/translation-data/csld2json.py` | py2→py3 port 2026-07-10 |

Behavior matches the webkit Makefile `translation` / `csld` targets:

- `xml2txt.py` — `cfdict.xml` → `cfdict.txt` (cedict-format lines)
- `txt2json.py` — merge `cedict.txt`, `cfdict.txt`, `handedict.txt` into
  `dict-revised.json` → `moe-translation.json` (aka `dict-revised-translated.json`)
- `csld2json.py` — same merge into `moedict-data-csld/dict-csld.json` →
  `csld-translation.json` (pack `c` input)

## Dependencies

- Python 3.9+
- `lxml` (only `xml2txt.py`)

## Inputs and outputs

### xml2txt.py

| Flag | Default | Role |
|------|---------|------|
| `--input-xml` | `./translation-data/cfdict.xml` | CFDICT XML source |
| `--output-txt` | `./translation-data/cfdict.txt` | cedict-format text |

### txt2json.py

| Flag | Default | Role |
|------|---------|------|
| `--cedict` | `./translation-data/cedict.txt` | English (CEDICT) |
| `--cfdict` | `./translation-data/cfdict.txt` | French (CFDICT) |
| `--handedict` | `./translation-data/handedict.txt` | German (Handedict) |
| `--moedict` | `./moedict-data/dict-revised.json` | 國語辭典 JSON array |
| `--output` | `./translation-data/moe-translation.json` | Enriched JSON |

### csld2json.py

Same dictionary flags as `txt2json.py`; defaults target CSLD:

| Flag | Default |
|------|---------|
| `--moedict` | `./moedict-data-csld/dict-csld.json` |
| `--output` | `./translation-data/csld-translation.json` |

## Invocation

From a checkout with translation inputs laid out like webkit:

```bash
# Step 1: XML → text (only when refreshing cfdict.txt from XML)
python3 scripts/translation/xml2txt.py \
  --input-xml translation-data/cfdict.xml \
  --output-txt translation-data/cfdict.txt

# Step 2: 國語辭典 + translations
python3 scripts/translation/txt2json.py \
  --cedict translation-data/cedict.txt \
  --cfdict translation-data/cfdict.txt \
  --handedict translation-data/handedict.txt \
  --moedict moedict-data/dict-revised.json \
  --output moedict-data/dict-revised-translated.json

# CSLD pack input
python3 scripts/translation/csld2json.py \
  --cedict translation-data/cedict.txt \
  --cfdict translation-data/cfdict.txt \
  --handedict translation-data/handedict.txt \
  --moedict moedict-data-csld/dict-csld.json \
  --output /tmp/moedict-csld-out/dict-csld.json
```

## Tests

Synthetic fixtures under `tests/fixtures/translation/`; run:

```bash
bun test tests/translation.test.ts
```
