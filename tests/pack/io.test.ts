import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { PackWriter } from '~/pack/io';

describe('PackWriter', () => {
  let out: string;
  beforeEach(() => { out = fs.mkdtempSync(path.join(tmpdir(), 'pack-')); });
  afterEach(() => { fs.rmSync(out, { recursive: true, force: true }); });

  it('writes entry and bucket', () => {
    const writer = new PackWriter(out);
    writer.writeEntry('a', 7, '%u4E2D%u592E', '中央', '{"t":"中央"}');
    writer.finalize();
    expect(fs.existsSync(path.join(out, 'a', '中央.json'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'pack', '7.txt'))).toBe(true);
  });

  it('rejects IDS filenames for both file and bucket entry', () => {
    const writer = new PackWriter(out);
    const aDir = path.join(out, 'a');
    writer.writeEntry('a', 7, 'first', '中', '{"t":"中"}');
    writer.writeEntry('a', 7, 'ids', '⿰亻恩', '{"t":"⿰亻恩"}');
    writer.finalize();

    expect(fs.existsSync(path.join(aDir, '⿰亻恩.json'))).toBe(false);
    const bucket = fs.readFileSync(path.join(out, 'pack', '7.txt'), 'utf8');
    expect(bucket).toContain('"first":');
    expect(bucket).not.toContain('"ids":');
  });

  it('rejects an exact-string duplicate title for both file and bucket entry, matching legacy $seen{$file}++', () => {
    const writer = new PackWriter(out);
    const aDir = path.join(out, 'a');
    writer.writeEntry('a', 7, 'first', '中', '{"t":"中"}');
    writer.writeEntry('a', 7, 'duplicate', '中', '{"t":"中"}');
    writer.finalize();

    expect(fs.readdirSync(aDir).length).toBe(1);
    const bucket = fs.readFileSync(path.join(out, 'pack', '7.txt'), 'utf8');
    expect(bucket).toContain('"first":');
    expect(bucket).not.toContain('"duplicate":');
  });

  it('keeps an NFD-equivalent but exact-string-distinct title in the bucket, but skips its standalone per-title file (avoids a silent APFS overwrite)', () => {
    const writer = new PackWriter(out);
    const aDir = path.join(out, 'a');
    const nfc = 'é';
    const nfd = 'e\u0301';
    writer.writeEntry('a', 7, 'first', nfc, `{"t":"${nfc}"}`);
    writer.writeEntry('a', 7, 'duplicate', nfd, `{"t":"${nfd}"}`);
    writer.finalize();

    // Only the first NFD-normalized form gets a standalone file.
    expect(fs.readdirSync(aDir).length).toBe(1);
    expect(fs.existsSync(path.join(aDir, `${nfc}.json`))).toBe(true);

    // Both remain in the bucket — they are distinct dictionary entries.
    const bucket = fs.readFileSync(path.join(out, 'pack', '7.txt'), 'utf8');
    expect(bucket).toContain('"first":');
    expect(bucket).toContain('"duplicate":');
  });
});
