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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moedict-translation-order-'));
  tempDirs.push(dir);
  return dir;
}

function runPython(
  script: string,
  args: string[],
): { stdout: string; stderr: string; status: number } {
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

function pyEval(code: string): string {
  const proc = Bun.spawnSync(
    [
      'python3',
      '-c',
      `import sys; sys.path.insert(0, ${JSON.stringify(SCRIPTS)}); ${code}`,
    ],
    { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' },
  );
  if ((proc.exitCode ?? 1) !== 0) {
    throw new Error(new TextDecoder().decode(proc.stderr) || 'python failed');
  }
  return new TextDecoder().decode(proc.stdout).trim();
}

describe('normalize_pinyin', () => {
  it('matches numbered CEDICT pinyin to MOE tone-marked pinyin', () => {
    const out = pyEval(`
from fwdict import normalize_pinyin
pairs = [
  ('niǎo', 'niao3'),
  ('diǎo', 'diao3'),
  ('zhāo', 'zhao1'),
  ('zhuó', 'zhuo2'),
  ('hé', 'he2'),
  ('hè', 'he4'),
]
print(all(normalize_pinyin(a) == normalize_pinyin(b) for a,b in pairs))
`);
    expect(out).toBe('True');
  });

  it('treats unmarked MOE syllables as neutral tone 5', () => {
    const out = pyEval(`
from fwdict import normalize_pinyin
print(normalize_pinyin('zhe') == normalize_pinyin('zhe5'))
print(normalize_pinyin('de') == normalize_pinyin('de5'))
print(normalize_pinyin('lǎo zi') == normalize_pinyin('lao3 zi5'))
`);
    for (const line of out.split('\n')) expect(line).toBe('True');
  });

  it('unifies ü / v / u: spellings', () => {
    const out = pyEval(`
from fwdict import normalize_pinyin
print(normalize_pinyin('nǚ') == normalize_pinyin('nv3'))
print(normalize_pinyin('nǚ') == normalize_pinyin('nu:3'))
print(normalize_pinyin('lǜ') == normalize_pinyin('lv4'))
print(normalize_pinyin('lǜ') == normalize_pinyin('lu:4'))
`);
    for (const line of out.split('\n')) expect(line).toBe('True');
  });

  it("preserves syllable boundaries so xī'ān does not collapse into xiān", () => {
    // Finding: dropping apostrophes/spaces would merge these distinct readings.
    // Unmarked xi'an is neutral+neutral under unmarked→5, not first-tone.
    const out = pyEval(`
from fwdict import normalize_pinyin
print(normalize_pinyin("xī'ān") == normalize_pinyin('xi1 an1'))
print(normalize_pinyin('xī ān') == normalize_pinyin('xi1 an1'))
print(normalize_pinyin("xī'ān") == normalize_pinyin('xian1'))
print(normalize_pinyin('xiān') == normalize_pinyin('xian1'))
print(normalize_pinyin("xi'an") == normalize_pinyin('xi1 an1'))
`);
    const lines = out.split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('True');
    expect(lines[2]).toBe('False');
    expect(lines[3]).toBe('True');
    expect(lines[4]).toBe('False');
  });

  it('treats equivalent whitespace runs as the same boundary', () => {
    // No heuristic syllabification of boundary-less tone-marked multisyllables
    // (tiáopèi): that would last-tone-wins and collide distinct readings.
    const out = pyEval(`
from fwdict import normalize_pinyin
print(normalize_pinyin('tiáo pèi') == normalize_pinyin('tiao2 pei4'))
print(normalize_pinyin('tiáo  pèi') == normalize_pinyin('tiao2 pei4'))
print(normalize_pinyin('tiáo\tpèi') == normalize_pinyin('tiao2 pei4'))
print(normalize_pinyin('shi2ke4') == normalize_pinyin('shi2 ke4'))
print(normalize_pinyin('xī ān') == normalize_pinyin('xiān'))
`);
    const lines = out.split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('True');
    expect(lines[2]).toBe('True');
    expect(lines[3]).toBe('True'); // rare compact CEDICT split on tone digits
    expect(lines[4]).toBe('False');
  });
});

describe('order_glosses multiset invariant', () => {
  it('is a permutation: same multiset out as in', () => {
    const out = pyEval(`
from fwdict import order_glosses
from collections import Counter
groups = [
  {'pinyin': 'diao3', 'defs': ['variant of 屌[diao3]', 'penis', '']},
  {'pinyin': 'niao3', 'defs': ['bird', 'CL', '']},
]
hets = [{'pinyin': 'niǎo'}, {'pinyin': 'diǎo'}]
ordered = order_glosses(groups, hets)
flat = [d for g in groups for d in g['defs']]
print(Counter(ordered) == Counter(flat))
print(ordered[0])
print(len(ordered) == len(flat))
`);
    const lines = out.split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('bird');
    expect(lines[2]).toBe('True');
  });

  it('keeps source order and does not blank when no pinyin matches', () => {
    // Fail-safe (deliberate): unmatched source pinyin must not drop glosses.
    const out = pyEval(`
from fwdict import order_glosses
groups = [{'pinyin': 'wu2 ju4', 'defs': ['unmatched-only source gloss', 'second']}]
hets = [{'pinyin': 'qqq'}]
print(order_glosses(groups, hets))
`);
    expect(out).toBe("['unmatched-only source gloss', 'second']");
  });
});

describe('txt2json reading-ordered glosses', () => {
  it('orders 鳥 / 和 / 著 leads by MOE first reading and preserves Deutsch bird lead', () => {
    const outDir = mkTempDir();
    const output = path.join(outDir, 'out.json');
    const result = runPython(path.join(SCRIPTS, 'txt2json.py'), [
      '--cedict',
      path.join(FIXTURES, 'reading-order-cedict.txt'),
      '--cfdict',
      path.join(FIXTURES, 'reading-order-cfdict.txt'),
      '--handedict',
      path.join(FIXTURES, 'reading-order-handedict.txt'),
      '--moedict',
      path.join(FIXTURES, 'reading-order-moedict.json'),
      '--output',
      output,
    ]);
    expect(result.status).toBe(0);
    const actual = JSON.parse(fs.readFileSync(output, 'utf8')) as Array<
      Record<string, unknown>
    >;
    const expected = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'reading-order-expected.json'), 'utf8'),
    );
    expect(actual).toEqual(expected);

    const byTitle = Object.fromEntries(actual.map((e) => [e.title as string, e]));
    expect(byTitle['鳥']?.English).toBe('bird');
    expect(byTitle['鳥']?.francais).toBe('oiseau');
    expect(byTitle['鳥']?.Deutsch).toBe('Vogel (S, Zool)');
    expect(byTitle['和']?.English).toBe('and');
    expect(byTitle['著']?.English).toBe('to wear (clothes)');
    expect(byTitle['了']?.English).toBe('to finish');
    // fail-safe: unmatched source pinyin still attached
    expect(byTitle['無據']?.English).toBe('unmatched-only source gloss');
  });
});
