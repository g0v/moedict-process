import codecs
import re

fontmap_mapping = {}
fontmap_re = None

def init():
    global fontmap_re

    for line in codecs.open('fontmap.txt', 'r', 'utf8'):
        line = re.sub(ur'#.*$', '', line).strip()
        if not line:
            continue
        cols = line.split()
        if len(cols) < 2:
            continue
        fontmap_mapping[cols[0]] = cols[1]

    fontmap_re = '|'.join(fontmap_mapping.keys())

def substitute(s):
    def mapping(m):
        return fontmap_mapping[m.group(1)]
    s = re.sub(r'<img src="images/('+fontmap_re+').jpg" border="0" />(?:&nbsp;)', mapping, s)
    return s

