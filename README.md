moedict-process
===============

Setup
-----
* Prerequirement: python, sqlite3

* HTML tarball

        $ mkdir crawl
        $ cd crawl
        $ wget http://kcwu.csie.org/~kcwu/moedict/dict-revised.rawhtml.201301.tar.bz2

Build
-----
* Generate dict-revised.json:

        $ make json

* Generate dict-revised.sqlite3:

        $ make db

See also
--------
* Data files http://kcwu.csie.org/~kcwu/moedict/
* Project site http://3du.tw/ ( https://hackpad.com/3du.tw-UJJETE2igdi )
* Bug report or feedback here https://github.com/g0v/moedict-process/issues
* IRC: FreeNet #g0v.tw
