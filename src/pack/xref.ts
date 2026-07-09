import * as fs from 'node:fs';
import * as path from 'node:path';
import hakkaPua from './data/hakka-pua.json';
import { assertNoPua } from './autolink';
import { codepointCount } from './codepoint';
import { canonicalJson } from './serializer';

type StringMap = Record<string, string>;

function append(map: StringMap, key: string, value: string): void {
  map[key] = map[key] === undefined ? value : `${map[key]},${value}`;
}

function writeJson(outputDir: string, lang: 'a' | 't' | 'h', name: string, value: unknown): void {
  const content = `${canonicalJson(value)}\n`;
  assertNoPua(content, `${lang}/${name}`);
  const dir = path.join(outputDir, lang);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function normalizedHakkaWip(raw: string): Array<Record<string, string>> {
  const replaced = raw.replace(/\{\[([0-9a-f]{4})\]\}/gi, (token, hex) =>
    hakkaPua[hex.toUpperCase() as keyof typeof hakkaPua] ?? token,
  );
  return JSON.parse(replaced) as Array<Record<string, string>>;
}

function terms(value: string): string[] {
  return value
    .replace(/[、　]/g, ',')
    .replace(/\d+\./g, '')
    .replace(/^,+|,+$/g, '')
    .split(',');
}

function normalizeTitle(value: string): string {
  return value.replace(/[【】]/g, '');
}
function linkMandarin(text: string, titles: readonly string[]): string {
  let linked = '';
  for (let offset = 0; offset < text.length; ) {
    const match = titles.find((title) => text.startsWith(title, offset));
    if (match) {
      linked += `\`${match}~`;
      offset += match.length;
    } else {
      const point = text.codePointAt(offset)!;
      const character = String.fromCodePoint(point);
      linked += character;
      offset += character.length;
    }
  }
  return linked;
}

export function writeXrefs(
  inputDir: string,
  outputDir: string,
  mandarinTitles: ReadonlySet<string>,
): void {
  const a: Record<string, StringMap> = {};
  const linkableTitles = [...mandarinTitles].sort(
    (left, right) => codepointCount(right) - codepointCount(left) || left.localeCompare(right),
  );

  const twblgPath = path.join(inputDir, 'x-華語對照表.csv');
  if (fs.existsSync(twblgPath)) {
    const aToT: StringMap = {};
    const tToA: StringMap = {};
    append(aToT, '萌', '發穎');
    append(tToA, '發穎', '萌');
    for (const row of fs.readFileSync(twblgPath, 'utf8').replace(/^\uFEFF/, '').split('\n').slice(1)) {
      const [mandarin, , taiwanese] = row.replace(/\r$/, '').split(',', 3);
      if (!mandarin || taiwanese === undefined || !mandarinTitles.has(mandarin) || /\d/.test(taiwanese)) continue;
      const forward = taiwanese === mandarin ? '' : taiwanese;
      const reverse = taiwanese === mandarin ? '' : mandarin;
      if (aToT[mandarin]?.split(',').includes(forward)) continue;
      append(aToT, mandarin, forward);
      append(tToA, taiwanese, reverse);
    }
    a.t = aToT;
    writeJson(outputDir, 't', 'xref.json', { a: tToA });
  }

  const hakkaPath = path.join(inputDir, 'work-in-progress.json');
  if (fs.existsSync(hakkaPath)) {
    const mToH: StringMap = {};
    const hToM: StringMap = {};
    for (const entry of normalizedHakkaWip(fs.readFileSync(hakkaPath, 'utf8'))) {
      const title = normalizeTitle(entry['詞目'] ?? '');
      const correspondence = entry['對應華語'];
      if (!title || !correspondence) continue;
      for (const target of terms(correspondence)) {
        if (mandarinTitles.has(target)) append(mToH, target, target === title ? '' : title);
        const linked = linkMandarin(target, linkableTitles);
        append(hToM, title, linked === `\`${title}~` ? '' : linked);
      }
    }
    a.h = mToH;
    writeJson(outputDir, 'h', 'xref.json', { a: hToM });
  }

  if (Object.keys(a).length > 0) writeJson(outputDir, 'a', 'xref.json', a);
}
