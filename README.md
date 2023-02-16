moedict-process
===============

Setup
-----
* Prerequirement: python, sqlite3

        $ pip install -r requirements.txt

* data

        $ mkdir dict_revised
        $ cd dict_revised
        $ wget https://raw.githubusercontent.com/g0v/moedict-data/master/dict_revised/dict_revised_1.xlsx

Build
-----
* Generate dict-revised.json:

        $ make json

* Generate dict-revised.sqlite3:

        $ make db

See also
--------
* Data Source https://github.com/g0v/moedict-data/tree/master/dict_revised
* Project site http://3du.tw/ ( https://g0v.hackpad.tw/3du.tw-ZNwaun62BP4 )
* Bug report or feedback here https://github.com/g0v/moedict-process/issues
* IRC: FreeNet #g0v.tw
* Slack: g0v-tw #moedict https://app.slack.com/client/T02G2SXKM/C8DEZ566S
