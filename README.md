moedict-process
===============

教育部重編國語辭典資料處理。把官方 `.xlsx` 原檔轉成 JSON，再寫入 sqlite3。
Bun / TypeScript implementation.

Requirements
------------

* [Bun](https://bun.com/) ≥ 1.3
* Optional: `xz` on `PATH` if you want `dict-revised.json.xz` (skipped otherwise)

```sh
bun install
```

Source data
-----------

官方資料放在 [`g0v/moedict-data`](https://github.com/g0v/moedict-data)。先放到 `dict_revised/`：

```sh
mkdir dict_revised
cd dict_revised
wget https://raw.githubusercontent.com/g0v/moedict-data/main/dict_revised/dict_revised_1.xlsx
cd ..
```

Build
-----

產出 `dict-revised.json.xz`：

```sh
bun run parse
# or: make json
```

產出 `dict-revised.sqlite3`：

```sh
bun run to-sqlite
# or: make db
```

環境變數可覆寫預設路徑：

| 變數 | 預設值 |
|------|--------|
| `MOEDICT_SOURCE_DIR` | `dict_revised` |
| `MOEDICT_OUTPUT` | `dict-revised.json` |
| `MOEDICT_JSON` | `dict-revised.json` |
| `MOEDICT_DB` | `dict-revised.sqlite3` |
| `MOEDICT_SCHEMA` | `dict-revised.schema` |

Tests & coverage
----------------

```sh
bun test                 # bun:test, all unit + integration
bun run test:coverage    # coverage report
bun run stryker          # mutation testing (Stryker command runner → bun test)
bun run typecheck        # tsc strict
bun run lint             # eslint
```

Dedup behaviour — 花枝招展 bug
----------------------------

舊版以整份 heteronym 序列化字串做去重，碰到 `b` 欄位一份 ASCII 空白、一份
U+3000 全形空白的雙胞胎條目時判定為不同，兩份都留下，導致下游 `moedict.tw`
同一詞條顯示兩次釋義（影響 33,699 個詞彙，如「花枝招展」、「耀眼」、「退件」）。

`src/dedup.ts` 改以正規化後的 `(bopomofo, pinyin)` 做識別鍵；相同鍵出現多次時，
保留序列化後較長、內容較完整的那份。既有輕聲 / 非輕聲變體（同 `audio_id` 但
bopomofo 不同）不受影響。

Stable output conventions
-------------------------

為保持字典 JSON 順序穩定，本實作固定：

- `JSON.stringify` 手動 sort keys
- Array / title sort 以 Unicode codepoint 比較，非 UTF-16 code unit
  （`U+FA3E` 的相容漢字 vs `U+2000D` 等超平面字的排序會錯）
- `parseDefs` 的 line-strip **不**剝除 U+FEFF（與 `String.prototype.trim()` 不同），
  否則帶 BOM 的條目會被誤分類

詳見 `src/process.ts::codepointCompare` 與 `src/parse.ts::stripDefLine`。

See also
--------

* Data source: https://github.com/g0v/moedict-data/tree/main/dict_revised
* Project site: http://3du.tw/ ( https://g0v.hackpad.tw/3du.tw-ZNwaun62BP4 )
* Bug tracker: https://github.com/g0v/moedict-process/issues
* Slack: g0v-tw #moedict <https://app.slack.com/client/T02G2SXKM/C8DEZ566S>
