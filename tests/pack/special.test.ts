import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { buildSpecialPacks, buildCategoryFiles } from '~/pack/special';

const FIXTURE_ROOT = path.join(import.meta.dir, 'fixtures', 'legacy');

describe('buildSpecialPacks', () => {
  let out: string;
  beforeEach(() => { out = fs.mkdtempSync(path.join(tmpdir(), 'special-')); });
  afterEach(() => { fs.rmSync(out, { recursive: true, force: true }); });

  it('builds @.txt from fixture a/ special JSON files', () => {
    const aSrc = path.join(FIXTURE_ROOT, 'a');
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    for (const name of fs.readdirSync(aSrc)) {
      if (name.startsWith('@') && name.endsWith('.json')) {
        fs.copyFileSync(path.join(aSrc, name), path.join(aDst, name));
      }
    }
    buildSpecialPacks('a', out);
    const atTxt = path.join(out, 'pack', '@.txt');
    expect(fs.existsSync(atTxt)).toBe(true);
    const body = fs.readFileSync(atTxt, 'utf8');
    expect(body.startsWith('{"@":')).toBe(true);
    expect(body).toContain('"@%u4E00":');
  });

  it('builds =.txt with escaped equals keys', () => {
    const aSrc = path.join(FIXTURE_ROOT, 'a');
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    for (const name of fs.readdirSync(aSrc)) {
      if (name.startsWith('=') && name.endsWith('.json')) {
        fs.copyFileSync(path.join(aSrc, name), path.join(aDst, name));
      }
    }
    buildSpecialPacks('a', out);
    const eqTxt = path.join(out, 'pack', '=.txt');
    expect(fs.existsSync(eqTxt)).toBe(true);
    const body = fs.readFileSync(eqTxt, 'utf8');
    expect(body.startsWith('{"%3D')).toBe(true);
    expect(body).toContain('"%3D%u5730%u540D":');
    expect(body).not.toMatch(/^\{,/);
    expect(body).not.toMatch(/^\{\n/);
  });

  it('includes @.json as literal "@" key', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'a', '@.json'), path.join(aDst, '@.json'));
    buildSpecialPacks('a', out);
    const body = fs.readFileSync(path.join(out, 'pack', '@.txt'), 'utf8');
    expect(body.startsWith('{"@":')).toBe(true);
  });

  it('skips =.json when building =.txt', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'a', '=.json'), path.join(aDst, '=.json'));
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'a', '=地名.json'), path.join(aDst, '=地名.json'));
    buildSpecialPacks('a', out);
    const body = fs.readFileSync(path.join(out, 'pack', '=.txt'), 'utf8');
    expect(body.startsWith('{"%3D%u5730%u540D":')).toBe(true);
    expect(body).toContain('"%3D%u5730%u540D":');
    expect(body).not.toContain('"成語"');
  });
});

describe('buildCategoryFiles', () => {
  it('writes =name files with JSON arrays', () => {
    const out = fs.mkdtempSync(path.join(tmpdir(), 'cat-'));
    try {
      buildCategoryFiles([{ name: '測試', entries: ['甲', '乙'] }], out);
      const content = fs.readFileSync(path.join(out, '=測試'), 'utf8');
      expect(JSON.parse(content)).toEqual(['甲', '乙']);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});