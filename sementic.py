#!/usr/local/bin/python
# -*- coding: utf-8 -*-
import re
import logging

class UnbalanceBrances(Exception):
    pass

def split_sentence(s):
    u'''
    >>> map(len, split_sentence(u"架子，放置器物的木器。木架上分不同形狀的許多層小格，格內可放入各種器皿、用具。儒林外史˙第二十三回：「又走進去，大殿上{[8e50]}子倒的七橫八豎。」紅樓夢˙第八十五回：「麝月便走去在裡間屋裡{[8e50]}子上頭拿了來。」亦作「格子」、「{[8e50]}子」。"))
    [11, 28, 37, 37, 19]

    >>> map(len, split_sentence(u"栝樓的別名。見「栝樓」條。"))
    [6, 7]

    >>> map(len, split_sentence(u"如：「一則新聞」、「一則廣告」。"))
    [16]
    '''
    sentences = []
    snt = ''
    wait = []
    pairs = {
            u'「': u'」',
            u'『': u'』',
            }
    for i, c in enumerate(s):
        snt += c
        if c in pairs:
            wait.append(pairs[c])
        if wait and wait[-1] == c:
            wait.pop()

        if not wait and any([
            re.search(ur'。$', snt),
            re.search(ur'：「.*」$', snt),
            ]) and (s[i+1:i+2] not in u'、。'):
            sentences.append(snt)
            snt = ''

    if wait:
        logging.warn('unbalance brances: %s' % s)
        raise UnbalanceBrances
    if snt:
        sentences.append(snt)

    return sentences

def classify_sentence(s):
    u'''
    Return sentence type
    0 normal
    1 example
    2 quote
    3 link

    >>> classify_sentence(u"數量詞：(1) 物一組。")
    0
    >>> classify_sentence(u"(2) 物成雙。")
    0
    >>> classify_sentence(u"南宋孝宗遊幸杭州靈隱寺，有僧淨輝相隨，見寺前有飛來峰，問淨輝曰：「既是飛來，如何不飛去？」對曰：「一動不如一靜。」典出宋˙張端義˙貴耳集˙卷上。")
    0
    >>> classify_sentence(u"比喻多一事不如少一事，勸人行事謹慎小心，以靜制動。")
    0
    >>> classify_sentence(u"九牛二虎之力比喻極大的力量。")
    0
    >>> classify_sentence(u"宋朝李昉年老罷相，居京師，慕白居易與八位老人一同宴遊之舉，與張好問、李運、宋琪､武允成、贊寧、魏丕、楊徽之、朱昂宴集，稱為「九老會」。")
    0
    >>> classify_sentence(u"見宋˙洪邁˙容齋四筆˙卷十二˙至道九老。")
    0
    >>> classify_sentence(u"放在二疊字動詞之間，表行為是不費力或嘗試性的。")
    0

    >>> classify_sentence(u"如：「雙手動一動」、「問一問」、「隨便說一說」。")
    1

    >>> classify_sentence(u"水滸傳˙第三回：「史進便入茶坊裡來，揀一副座位坐了。」")
    2
    >>> classify_sentence(u"老殘遊記˙第五回：「看這于家死的實在可慘，又平白的受了人家一副金鐲子，心裡也有點過不去。」")
    2
    >>> classify_sentence(u"警世通言˙卷二十二˙宋小官團圓破氈笠：「況且下水順風，相去已百里之遙，一動不如一靜，勸你息了心罷！」")
    2
    >>> classify_sentence(u"紅樓夢˙第五十七回：「紫鵑停了半晌，自言自語的說道：『一動不如一靜，我們這裡就算好人家。』」")
    2
    >>> classify_sentence(u"九牛語本列子˙仲尼：「吾之力者，能裂犀兕之革，曳九牛之尾。」")
    2
    >>> classify_sentence(u"元˙鄭光祖˙三戰呂布˙楔子：「兄弟，你不知他靴尖點地，有九牛二虎之力，休要放他小歇。」")
    2
    >>> classify_sentence(u"官場現形記˙第二十一回：「後來又費九牛二虎之力，把個戒菸會保住，依舊做他的買賣。」")
    2

    >>> classify_sentence(u"亦作「格子」、「{[8e50]}子」。")
    3
    >>> classify_sentence(u"見「糖{[8ecf]}類」､「核{[8ecf]}」､「核{[8ecf]}酸」等條。")
    3
    >>> classify_sentence(u"俗稱為「沙丁魚」。")
    3


    # known incorrect
    >>> classify_sentence(u"二虎指春秋魯國的大力士管莊子刺二虎的故事，典出戰國策˙秦策二。")
    0
    '''

    if re.match(ur'^如：「(.+)」。', s):
        return 1
    if re.match(ur'^如：「(.+)」', s):
        return 1

    if re.match(ur'^(同|亦作|亦稱為|俗稱為|或作|亦作|通|或稱為|簡稱為|或譯作)「(.+?)」。', s):
        return 3

    if re.match(ur'見「(.+?)」等?條。', s):
        return 3

    if re.match(ur'^「(.+?)」的古字。', s):
        return 3
    if re.match(ur'^「(.+?)」的異體字（\d+）', s):
        return 3

    m = re.match(ur'^(.+?)：「(.+?)」$', s)
    if m:
        source, text = m.group(1, 2)
        if u'，' in source:
            return 0

        if re.search(ur'˙|．', source): # use dots to separate dynastry/book/author/etc.
            return 2 # sure
        if source in (u'說文解字',):
            return 2 # sure

        logging.info('not sure, 2: ' + s)
        return 2 # not sure

    return 0


def test_main():
    import doctest
    doctest.testmod()

if __name__ == '__main__':
    test_main()
