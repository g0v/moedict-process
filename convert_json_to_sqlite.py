import sqlite3
import json
import logging

dict_id = 1 # moedict
word_to_id = {}

class DB:
    def __init__(self):
        self.conn = sqlite3.connect('dict-revised.sqlite3')

    def insert(self, sql, *bind):
        c = self.conn.cursor()
        try:
            c.execute(sql, bind)
        except sqlite3.InterfaceError:
            print sql, bind
            raise
        c.close()
        return c.lastrowid

    def insert_dict(self, table, dct):
        keys = dct.keys()

        sql = 'INSERT INTO %s (%s) VALUES(%s)' % (
                table,
                ','.join(keys),
                ','.join('?'*len(keys)))

        return self.insert(sql, *[dct[k] for k in keys])

    def query(self, sql, *bind):
        c = self.conn.cursor()
        c.execute(sql, bind)
        result = c.fetchall()
        c.close()
        return result

    def close(self):
        self.conn.commit()
        self.conn.close()

def dict_filter(dct, excludes=[], **argd):
    d = dict(dct)
    for k in excludes:
        if k in d:
            del d[k]
    d.update(argd)
    return d

def insert_db(entry, db):
    entry_id = db.insert_dict('entries',
            dict_filter(entry, excludes=['heteronyms'], dict_id=dict_id))
    word_to_id[entry['title']] = entry_id

    logging.debug('entry_id=%d' % entry_id)

    for i, h in enumerate(entry['heteronyms']):
        heteronym_id = db.insert_dict('heteronyms',
                dict_filter(h, excludes=['definitions'],
                    entry_id=entry_id, idx='%d' % i))
        logging.debug('heteronym_id=%d' % heteronym_id)

        for j, d in enumerate(h['definitions']):
            if 'quote' in d:
                d['quote'] = ','.join(d['quote'])
            if 'example' in d:
                d['example'] = ','.join(d['example'])
            if 'link' in d:
                d['link'] = ','.join(d['link'])
            d['idx'] = '%d' % j
            db.insert_dict('definitions', d)

def main():
    db = DB()
    try:
        for entry in json.load(file('dict-revised.json')):
            insert_db(entry, db)
    finally:
        db.close()


if __name__ == '__main__':
    main()
