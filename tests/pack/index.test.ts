import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { PackWriter } from '~/pack/io';
import { writeGeneratedIndex } from '~/pack/index';

function readJson(out: string, rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(out, rel), 'utf8'));
}

describe('writeGeneratedIndex', () => {
  let out: string;

  beforeEach(() => {
    out = fs.mkdtempSync(path.join(tmpdir(), 'pack-index-'));
  });

  afterEach(() => {
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('writes sorted unique Unicode-scalar titles', () => {
    writeGeneratedIndex('a', ['𠮷', '乙', '甲', '𐀀', '�', '甲'], out);
    expect(fs.readFileSync(path.join(out, 'a', 'index.json'), 'utf8')).toBe(
      '["乙","甲","�","𐀀","𠮷"]\n',
    );
    expect(readJson(out, 'a/index.json')).toEqual(['乙', '甲', '�', '𐀀', '𠮷']);
  });

  it('rejects only uncurated PUA and retains approved MOE variants', () => {
    expect(() => writeGeneratedIndex('h', ['\u{F0008}'], out)).toThrow('PUA');
    expect(() => writeGeneratedIndex('h', ['\u{F0009}'], out)).not.toThrow();
  });

  it('indexes both NFC and NFD forms of a title (bucket-distinct, matching legacy exact-string dedup)', () => {
    const writer = new PackWriter(out);
    const nfc = 'é';
    const nfd = 'e\u0301';
    expect(nfc).not.toBe(nfd);
    expect(nfc.normalize('NFD')).toBe(nfd);
    const first = writer.writeEntry('a', 0, nfc, nfc, `{"t":"${nfc}"}`);
    const second = writer.writeEntry('a', 0, nfd, nfd, `{"t":"${nfd}"}`);
    writeGeneratedIndex('a', [first, second].filter((title): title is string => title !== null), out);
    expect(readJson(out, 'a/index.json')).toEqual([nfd, nfc]);
  });

  it('omits an exact-string duplicate title rejected by the writer', () => {
    const writer = new PackWriter(out);
    const first = writer.writeEntry('a', 0, '中', '中', '{"t":"中"}');
    const duplicate = writer.writeEntry('a', 0, '中', '中', '{"t":"中"}');
    writeGeneratedIndex('a', [first, duplicate].filter((title): title is string => title !== null), out);
    expect(readJson(out, 'a/index.json')).toEqual(['中']);
  });
});
