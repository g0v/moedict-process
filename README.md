moedict-process
===============

Setup
-----
* Put moedict HTML data in data/
* Put moedict font image in images/

Run
---
1. copy db/development.sqlite3 from https://github.com/albb0920/dict-3du 
or run
 $ sqlite3 development.sqlite3 < dict-revised.schema
2. ./parse.py
