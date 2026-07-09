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

  it('skips NFD-duplicate and IDS filenames without writing files or bucket entries', () => {
    const writer = new PackWriter(out);
    const aDir = path.join(out, 'a');
    writer.writeEntry('a', 7, 'first', 'é', '{"t":"é"}');
    writer.writeEntry('a', 7, 'duplicate', 'e\u0301', '{"t":"e\u0301"}');
    writer.writeEntry('a', 7, 'ids', '⿰亻恩', '{"t":"⿰亻恩"}');
    writer.finalize();

    const files = fs.readdirSync(aDir);
    expect(files.length).toBe(1);
    expect(fs.existsSync(path.join(aDir, '⿰亻恩.json'))).toBe(false);

    const bucket = fs.readFileSync(path.join(out, 'pack', '7.txt'), 'utf8');
    expect(bucket).toContain('"first":');
    expect(bucket).not.toContain('"duplicate":');
    expect(bucket).not.toContain('"ids":');
  });
});
