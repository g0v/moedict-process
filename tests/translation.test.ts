import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const FIXTURES = path.join(REPO_ROOT, 'tests/fixtures/translation');
const SCRIPTS = path.join(REPO_ROOT, 'scripts/translation');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-translation-'));
  tempDirs.push(dir);
  return dir;
}

function runPython(script: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const proc = Bun.spawnSync(['python3', script, ...args], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
    status: proc.exitCode ?? 1,
  };
}

describe('translation scripts', () => {
  it('xml2txt.py converts CFDICT XML snippet to cedict-format lines', () => {
    const outDir = mkTempDir();
    const output = path.join(outDir, 'cfdict.txt');
    const result = runPython(path.join(SCRIPTS, 'xml2txt.py'), [
      '--input-xml',
      path.join(FIXTURES, 'cfdict-snippet.xml'),
      '--output-txt',
      output,
    ]);
    expect(result.status).toBe(0);
    const expected = fs.readFileSync(path.join(FIXTURES, 'cfdict-snippet.expected.txt'), 'utf8');
    expect(fs.readFileSync(output, 'utf8')).toBe(expected);
  });

  it('txt2json.py merges cedict/cfdict/handedict into moedict JSON', () => {
    const outDir = mkTempDir();
    const output = path.join(outDir, 'moe-translation.json');
    const result = runPython(path.join(SCRIPTS, 'txt2json.py'), [
      '--cedict',
      path.join(FIXTURES, 'cedict-snippet.txt'),
      '--cfdict',
      path.join(FIXTURES, 'cfdict-snippet.txt'),
      '--handedict',
      path.join(FIXTURES, 'handedict-snippet.txt'),
      '--moedict',
      path.join(FIXTURES, 'moedict-snippet.json'),
      '--output',
      output,
    ]);
    expect(result.status).toBe(0);
    const actual = JSON.parse(fs.readFileSync(output, 'utf8'));
    const expected = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'moedict-snippet.expected.json'), 'utf8'),
    );
    expect(actual).toEqual(expected);
  });

  it('csld2json.py merges translations into CSLD moedict JSON', () => {
    const outDir = mkTempDir();
    const output = path.join(outDir, 'csld-translation.json');
    const result = runPython(path.join(SCRIPTS, 'csld2json.py'), [
      '--cedict',
      path.join(FIXTURES, 'cedict-snippet.txt'),
      '--cfdict',
      path.join(FIXTURES, 'cfdict-snippet.txt'),
      '--handedict',
      path.join(FIXTURES, 'handedict-snippet.txt'),
      '--moedict',
      path.join(FIXTURES, 'csld-snippet.json'),
      '--output',
      output,
    ]);
    expect(result.status).toBe(0);
    const actual = JSON.parse(fs.readFileSync(output, 'utf8'));
    const expected = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'csld-snippet.expected.json'), 'utf8'),
    );
    expect(actual).toEqual(expected);
  });
});
