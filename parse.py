#!/usr/local/bin/python
# -*- coding: utf-8 -*-
import sys
import os
import re
import codecs
import sqlite3
import traceback
import logging

import fontmap

def setup_logging():
    formatter = logging.Formatter('%(levelname)-8s [%(asctime)s %(filename)s:%(lineno)s] %(message)s')
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)

    sh = logging.StreamHandler(codecs.getwriter('utf8')(sys.stderr))
    sh.setLevel(logging.INFO)
    sh.setFormatter(formatter)
    logger.addHandler(sh)

    fh = logging.FileHandler('parse.log', mode='w', encoding='utf8')
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(formatter)
    logger.addHandler(fh)


# TODO load existing data from db
word_to_id = {}

dict_id = 1 # moedict

pos_list = u'''
名⃞
動⃞
形⃞
副⃞
助⃞
介⃞
嘆⃞
連⃞
代⃞
'''.strip().split()

class DB:
    def __init__(self):
        self.conn = sqlite3.connect('development.sqlite3')

    # TODO insert dict
    def insert(self, sql, *bind):
        c = self.conn.cursor()
        c.execute(sql, bind)
        c.close()
        return c.lastrowid

    def query(self, sql, *bind):
        c = self.conn.cursor()
        c.execute(sql, bind)
        result = c.fetchall()
        c.close()
        return result

    def close(self):
        self.conn.commit()
        self.conn.close()


def strip(html):
    html = html.strip()
    m = re.search(ur'^(&nbsp;)*(.*?)(&nbsp;)*$', html)
    return m.group(2)

def parse_title(title, d):
    m = re.search(ur'''<span class="key">(?P<title>.+?)　　<span class="lable">部首</span>　(?P<radical>.+?)　<span class="lable">部首外筆畫</span>　(?P<non_radical_stroke_count>\d+)　<span class="lable">總筆畫</span>　(?P<stroke_count>\d+)''', title)
    if m:
        d.update(m.groupdict())
        return

    m = re.match(ur'''<span class="key">(?P<title>.+)''', title)
    if m:
        d.update(m.groupdict())
        return

    d['title'] = title

def parse_detail(detail, d):
    detail = detail.strip()
    logging.debug('detail=%s' % repr(detail))
    #print 'detail=>', repr(detail)
    items = detail.split('<tr>')

    results = []
    for item in items:
        if not item:
            continue
        state = 0
        idx = 0
        result = ['']
        #print 'item', item
        for x in re.split(ur'((?:</td>)|<td[^>]*>)', item):
            x = strip(x)
            if x == '':
                continue
            if x.startswith('<td'):
                if state == 0:
                    state = 1
                else:
                    idx += 1
                    result.append('')
            elif x == '</td>':
                idx += 1
                result.append('')
                state = 0
            else:
                result[idx] += x
        #print 'result', result
        #for i, x in enumerate(result):
        #    print i, x
        results.append(result)
    #print results
    return results

def parse(html):
    m = re.search(
    ur'''
<table width="90%" border="1" cellspacing="1" cellpadding="1">
  <tr>
    <td colspan="2">&nbsp;(\d+)\.　(?P<title>.*?)</td>
  </tr>
  <tr>
    <td colspan="2" width="100%">&nbsp;<span class="lable">注音一式</span>(?P<bopomofo>.*?)</td></tr><tr>
    <td width="50%">&nbsp;<span class="lable">注音二式</span>(?P<bopomofo2>.*?)</td>
</td>
    <td width="50%">&nbsp;<span class="lable">通用拼音</span>(?P<tongyong_pinyin>.*?)</td>
  </tr>
(?:  <tr>
    <td>&nbsp;<span class="lable">相似詞</span>　<span class="key">(?P<synonyms>[\s\S]*?)</td>
    <td>&nbsp;<span class="lable">相反詞</span>　<span class="key">(?P<antonyms>[\s\S]*?)</td>
  </tr>
)?  <tr>
    <td colspan="2">
      <table border="0" valign="top">
<span class="key">(?:</td>)?(?P<detail>[\s\S]*?)</table>
    </td>
  </tr>
</table>
''', html)
    assert m, 'firsr level parse fail'
    d = dict(m.groupdict())

    parse_title(d['title'], d)
    d['detail'] = parse_detail(d['detail'], d)

    logging.debug('title = '+d['title'])

    for k, v in d.items():
        if not v:
            v = ''
        logging.debug('%s: %s' % (k, v))
    return d

def insert_db(d, db):
    time_zero = '2000-01-01 00:00:00.000000'
    if d['title'] in word_to_id:
        entry_id = word_to_id[d['title']]
    else:
        entry_id = db.insert('INSERT INTO entries '
                ' (title, radical, stroke_count, non_radical_stroke_count, dict_id, created_at, updated_at) '
                ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                d['title'],
                d.get('radical'),
                d.get('stroke_count'),
                d.get('non_radical_stroke_count'),
                dict_id,
                time_zero,
                time_zero,
                    )
        word_to_id[d['title']] = entry_id

    logging.debug('entry_id=%d' % entry_id)

    heteronym_id = db.insert('INSERT INTO heteronyms '
            ' (entry_id, bopomofo, bopomofo2, pinyin, created_at, updated_at)'
            ' VALUES(?,?,?,?,?,?)',
            entry_id,
            d['bopomofo'],
            d['bopomofo2'],
            '',
            time_zero,
            time_zero)

    logging.debug('heteronym_id=%d' % heteronym_id)

    pos = ''
    for line in d['detail']:
        definition = None
        #print 'line', line
        for i, x in enumerate(line):
            #print i, x
            if x in pos_list:
                pos = x
            elif x:
                definition = x
        if not definition:
            continue

        db.insert('INSERT INTO definitions '
                ' (heteronym_id, type, def, example, created_at, updated_at, synonyms, antonyms) '
                ' VALUES(?,?,?,?,?,?,?,?)',
                heteronym_id,
                pos,
                definition,
                '',
                time_zero,
                time_zero,
                d.get('synonyms'),
                d.get('antonyms'),
                )

def process_file(fn, db):
    logging.debug(fn)
    try:
        try:
            with codecs.open(fn, 'r', 'big5') as f:
                content = f.read()
        except UnicodeDecodeError:
            logging.exception('bad big5 char?')
            return False
        content = fontmap.substitute(content)
        d = parse(content)
        insert_db(d, db)
    except AssertionError:
        logging.exception('parse fail')
        return False
    return True

def main():
    setup_logging()
    fontmap.init()

    count_parsed = 0
    count_file = 0
    db = DB()
    try:
        for root, dirs, files in os.walk('data'):
            logging.info(root)
            dirs.sort()
            for fn in sorted(files):
                if not fn.endswith('.html'):
                    continue
                path = os.path.join(root, fn)
                count_file += 1
                if process_file(path, db):
                    count_parsed += 1
                logging.debug('parsed %d/%d' % (count_parsed, count_file))
                #if c >= 1:
                #    return
    finally:
        logging.info('%d files, parsed %d' % (count_file, count_parsed))
        db.close()

if __name__ == '__main__':
    main()
