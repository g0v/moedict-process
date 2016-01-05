moedict-process
===============

Setup
-----
* Prerequirement: python, sqlite3

* data

        $ mkdir dict_revised
        $ cd dict_revised
        $ wget https://raw.githubusercontent.com/g0v/moedict-data/master/dict_revised/dict_revised_1.xls https://raw.githubusercontent.com/g0v/moedict-data/master/dict_revised/dict_revised_2.xls https://raw.githubusercontent.com/g0v/moedict-data/master/dict_revised/dict_revised_3.xls

Build
-----
* Generate dict-revised.json:

        $ make json

* Generate dict-revised.sqlite3:

        $ make db

See also
--------
* Data Source https://github.com/g0v/moedict-data/tree/master/dict_revised
* Project site http://3du.tw/ ( https://g0v.hackpad.com/3du.tw-ZNwaun62BP4 )
* Bug report or feedback here https://github.com/g0v/moedict-process/issues
* IRC: FreeNet #g0v.tw
