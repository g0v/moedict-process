moedict-process
===============

教育部重編國語辭典資料處理。把官方 `.xlsx` 原檔轉成 JSON，再寫入 sqlite3。
Bun / TypeScript implementation (see the legacy Python 2 port below).

Requirements
------------

* [Bun](https://bun.com/) ≥ 1.3
* 編譯 `better-sqlite3` 需要 Xcode Command Line Tools（macOS）或 build-essential（Linux）

```sh
bun install
```

Source data
-----------

官方資料放在 [`g0v/moedict-data`](https://github.com/g0v/moedict-data)。先放到 `dict_revised/`：

```sh
mkdir dict_revised
cd dict_revised
wget https://raw.githubusercontent.com/g0v/moedict-data/master/dict_revised/dict_revised_1.xlsx
cd ..
```

Build
-----

產出 `dict-revised.json`：

```sh
bun run parse
```

產出 `dict-revised.sqlite3`：

```sh
bun run to-sqlite
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
bun run test            # vitest, all unit + integration
bun run test:coverage   # v8 coverage report, thresholds: 90% stmts / 85% branches
bun run stryker         # mutation testing (Stryker)
bun run typecheck       # tsc strict
bun run lint            # eslint
```

Dedup behaviour — 花枝招展 bug
----------------------------

原本 `parse.py:post_processing()` 以 `json.dumps(h)` 做 heteronym 去重，碰到
`b` 欄位一份 ASCII 空白、一份 U+3000 全形空白的雙胞胎條目時判定為不同，
兩份都留下，導致下游 `moedict.tw` 同一詞條顯示兩次釋義（影響
33,699 個詞彙，如「花枝招展」、「耀眼」、「退件」）。

新版 `src/dedup.ts` 改以正規化後的 `(bopomofo, pinyin)` 做識別鍵；相同
鍵出現多次時，保留序列化後較長、內容較完整的那份。既有輕聲 / 非輕聲
變體（同 `audio_id` 但 bopomofo 不同）不受影響。

Legacy Python implementation
----------------------------

舊版 Python 2 實作（`parse.py`、`sementic.py`、`convert_json_to_sqlite.py`）
暫時保留在 repo 根目錄供對照；新的流程請用上面的 `bun run` 指令。待 TS 版
驗證通過後會移除 Python 版本。

See also
--------

* Data source: https://github.com/g0v/moedict-data/tree/master/dict_revised
* Project site: http://3du.tw/ ( https://g0v.hackpad.tw/3du.tw-ZNwaun62BP4 )
* Bug tracker: https://github.com/g0v/moedict-process/issues
* Slack: g0v-tw #moedict <https://app.slack.com/client/T02G2SXKM/C8DEZ566S>
