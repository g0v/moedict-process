import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { buildSpecialPacks, buildCategoryFiles } from '~/pack/special';

// Legacy fixture a/ specials still embed plane-15 PUA; happy-path tests use
// synthetic PUA-free inputs. Rejection is covered by tests/pack/pua-gate.test.ts.

describe('buildSpecialPacks', () => {
  let out: string;
  beforeEach(() => {
    out = fs.mkdtempSync(path.join(tmpdir(), 'special-'));
  });
  afterEach(() => {
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('builds @.txt with literal "@" and escaped radical keys', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    fs.writeFileSync(path.join(aDst, '@.json'), JSON.stringify([['一', '丨']]));
    fs.writeFileSync(path.join(aDst, '@一.json'), JSON.stringify(['丁', '七']));
    buildSpecialPacks('a', out);
    const body = fs.readFileSync(path.join(out, 'pack', '@.txt'), 'utf8');
    expect(body.startsWith('{"@":')).toBe(true);
    expect(body).toContain('"@%u4E00":');
    expect(body).not.toMatch(/^\{\n/);
  });

  it('builds =.txt with escaped equals keys', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    fs.writeFileSync(path.join(aDst, '=地名.json'), JSON.stringify(['臺北', '高雄']));
    buildSpecialPacks('a', out);
    const body = fs.readFileSync(path.join(out, 'pack', '=.txt'), 'utf8');
    expect(body.startsWith('{"%3D%u5730%u540D":')).toBe(true);
    expect(body).not.toMatch(/^\{,/);
    expect(body).not.toMatch(/^\{\n/);
  });

  it('includes @.json as literal "@" key', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    fs.writeFileSync(path.join(aDst, '@.json'), JSON.stringify([['甲']]));
    buildSpecialPacks('a', out);
    const body = fs.readFileSync(path.join(out, 'pack', '@.txt'), 'utf8');
    expect(body.startsWith('{"@":')).toBe(true);
  });

  it('skips =.json when building =.txt', () => {
    const aDst = path.join(out, 'a');
    fs.mkdirSync(aDst, { recursive: true });
    // =.json would be first in sort; if comma logic were wrong we'd emit "{,".
    fs.writeFileSync(path.join(aDst, '=.json'), JSON.stringify(['成語']));
    fs.writeFileSync(path.join(aDst, '=地名.json'), JSON.stringify(['臺北']));
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
