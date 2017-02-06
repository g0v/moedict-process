#!/usr/local/bin/python
# -*- coding: utf-8 -*-
import sys
import os
import re
import codecs
import traceback
import logging
import json
import collections
import optparse

import sementic

import xlrd

basic_data = {}
heteronym_data = collections.defaultdict(list)

bpmf0 = u'˙'
bpmf1 = u'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ'
bpmf2 = u'ㄧㄨㄩ'
bpmf3 = u'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'
bpmf4 = u'ˇˊˋ'
re_bpmf = u'[%s%s%s%s%s]' % (bpmf0, bpmf1, bpmf2, bpmf3, bpmf4)


def setup_logging():
    formatter = logging.Formatter(
        '%(levelname)-8s [%(asctime)s %(filename)s:%(lineno)s] %(message)s')
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


def parse_def(text, definition):
    """
    """
    try:
        classifies = []
        sentences = []
        for s in sementic.split_sentence(text):
            c = sementic.classify_sentence(s)
            classifies.append(c)
            sentences.append(s)
            logging.debug('classify %s: %s' % (c, s))

        if re.search(r'0[^0]+0', ''.join(map(str, classifies))):
            logging.warn('complex definition')
            return

        while classifies and classifies[-1] != 0:
            c = classifies.pop()
            s = sentences.pop()
            if c == 1:
                if 'example' not in definition:
                    definition['example'] = []
                definition['example'].insert(0, s)
            elif c == 2:
                if 'quote' not in definition:
                    definition['quote'] = []
                definition['quote'].insert(0, s)
            elif c == 3:
                if 'link' not in definition:
                    definition['link'] = []
                definition['link'].insert(0, s)

        definition['def'] = ''.join(sentences)

    except sementic.UnbalanceBrances:
        pass


def parse_defs(detail):
    lines = detail.splitlines()
    definitions = []
    pos = ''
    for item in lines:
        if not item:
            continue
        logging.debug('def_item=%s' % item)
        m = re.match(ur'\[(.*)\]', item)
        if m and m.group(1):
            pos = m.group(1)
            continue

        definition = {'def': item}

        if pos:
            definition['type'] = pos

        parse_def(definition['def'], definition)

        definitions.append(definition)

    return definitions


def associate_to_defs(key, text, defs):
    while text:
        m = re.match(ur'^((?:\d+\.)*)(.*)', text)
        if not m:
            logging.error('bad syntax %s: %s' % (key, text))
            return
        v = m.group(2).replace(u'、', u',').strip()
        text = text[len(m.group()):]

        if m.group(1) == '':
            defs[0][key] = v
        else:
            for num in re.findall(ur'(\d+)\.', m.group(1)):
                idx = int(num)
                for d in defs:
                    m1 = re.match(ur'^(\d+)\.(.*)', d['def'])
                    if m1 and m1.group(1):
                        defIndex = int(m1.group(1))
                        if idx == defIndex:
                            if key in defs[idx - 1]:
                                defs[idx - 1][key] += ',' + v
                            else:
                                defs[idx - 1][key] = v


def parse_heteronym(cells):
    # 0:字詞屬性 1:字詞號 2:字詞名 3:部首字 4:部首外筆畫數 
    # 5:總筆畫數  6:注音一式  7:漢語拼音  8:相似詞 9:相反詞
    # 10:釋義  11:編按  12:多音參見訊息  13:異體字
    heteronym = dict(
        bopomofo=cells[6].value,
        pinyin=cells[7].value,
        definitions=parse_defs(normalize(cells[10].value))
    )
    associate_to_defs('synonyms', normalize(
        cells[8].value), heteronym['definitions'])
    associate_to_defs('antonyms', normalize(
        cells[9].value), heteronym['definitions'])

    if cells[11].ctype != 0:  #0: XL_CELL_EMPTY
        heteronym['definitions'] += parse_defs(cells[11].value)

    for item in heteronym['definitions']:
        item['def'] = re.sub(ur'^\d+\.(.*)', ur'\1', item['def'])

    basic = dict(
        stroke_count=int(cells[5].value),
        non_radical_stroke_count=int(cells[4].value),
        title=normalize(cells[2].value),
        radical=normalize(cells[3].value),
    )

    if int(cells[0].value) is 2: #字詞屬性 1表單字，2表複詞
        del basic['stroke_count']
        del basic['non_radical_stroke_count']
        del basic['radical']

    for k, v in heteronym.items():
        if not v:
            del heteronym[k]
    return basic, heteronym


def json_dumps(o):
    s = json.dumps(o, sort_keys=True, ensure_ascii=False, indent=1)

    s = re.sub(r'\n( +)',
               lambda m: '\n' + '\t' * len(m.group(1)),
               s)
    s = s.replace(' \n', '\n')
    return s


def normalize(s):
    if not (isinstance(s, unicode) or isinstance(s, str)):
        return ""
    s = re.sub(r'&(.*?)\._104_0\.gif;', lambda m: "{[%s]}" % (m.group(1).split('&')[-1]), s)
    return s


def process_excel(filename):
    try:
        book = xlrd.open_workbook(filename)
        sh = book.sheet_by_index(0)
        for rx in range(1, sh.nrows):
            basic, heteronym = parse_heteronym(sh.row(rx))
            title = basic['title']
            logging.debug('title = ' + title)

            if title in basic_data:
                if basic_data[title] != basic:
                    logging.warn('basic data mismatch')
                    logging.warn('basic data 1: ' + json_dumps(basic))
                    logging.warn('basic data 2: ' +
                                 json_dumps(basic_data[title]))
                    # workaround for
                    # https://github.com/g0v/moedict-process/issues/11
                    if len(str(heteronym_data)) > len(str(heteronym)):
                        basic = basic_data[title]

            basic_data[title] = basic
            heteronym_data[title].append(heteronym)

            logging.debug(json_dumps(basic))
            logging.debug(json_dumps(heteronym))
    except AssertionError:
        logging.exception('parse fail')
        return False
    return True


def dump_json():
    logging.info('dump_json')
    with codecs.open('dict-revised.json', 'w', 'utf8') as f:
        for k in basic_data.keys():
            basic_data[k]['heteronyms'] = heteronym_data[k]
        jn = json_dumps(sorted(basic_data.values(),
                               key=lambda x: x['title']))
        f.write(jn + '\n')


def post_processing():
    logging.info('dedup heteronyms')
    for title, hs in heteronym_data.items():
        hs_new = []
        known = set()
        for h in hs:
            jn = json.dumps(h)
            if jn in known:
                continue
            known.add(jn)
            hs_new.append(h)
        heteronym_data[title] = hs_new

    logging.info('remove phonetic index')
    for title, hs in heteronym_data.items():
        assert hs

        # order by <1>,<2>,...
        hs.sort(key=lambda h: h.get('bopomofo'))

        known_bpmf = set()
        for h in hs:
            # remove <1>
            if not h.get('bopomofo'):
                continue
            for k in ('bopomofo', 'pinyin'):
                if re.match(ur'^\([一二三四五六七八九十]\)', h[k]):
                    h[k] = re.sub(ur'^\([一二三四五六七八九十]\)', '', h[k])
            known_bpmf.add(h['bopomofo'])

        # remove <1> from definition
        for h in hs:
            defs = h['definitions']
            defs_new = []
            for d in defs:
                m = re.match(ur'^(\([一二三四五六七八九十]\))(.+)', d['def'])
                if m and re.search(re_bpmf, m.group(2)):
                    # TODO verify consistency
                    continue
                defs_new.append(d)
            if len(defs) != len(defs_new):
                h['definitions'] = defs_new


def rawdata_iter():
    for root, dirs, files in os.walk('dict_revised'):
        # if count_parsed >= 1000:
        #    break
        logging.info(root)
        dirs.sort()
        for fn in sorted(files):
            if not fn.endswith('.xls'):
                continue
            path = os.path.join(root, fn)
            logging.debug(path)
            yield path


def main():
    setup_logging()

    count_parsed = 0
    count_file = 0
    try:
        for rawdata in rawdata_iter():
            count_file += 1
            if process_excel(rawdata):
                count_parsed += 1
            logging.debug('parsed %d/%d' % (count_parsed, count_file))

        post_processing()
        dump_json()
    finally:
        logging.info('%d files, parsed %d' % (count_file, count_parsed))

if __name__ == '__main__':
    main()
