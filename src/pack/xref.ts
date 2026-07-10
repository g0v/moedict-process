import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeHakkaPua } from './hakka-pua';
import { assertNoPua, HAKKA_LITERAL_PUA } from './autolink';
import { codepointCount } from './codepoint';
import { canonicalJson } from './serializer';

type StringMap = Record<string, string>;

function append(map: StringMap, key: string, value: string): void {
  map[key] = map[key] === undefined ? value : `${map[key]},${value}`;
}

function writeJson(outputDir: string, lang: 'a' | 't' | 'h', name: string, value: unknown): void {
  const content = `${canonicalJson(value)}\n`;
  assertNoPua(content, `${lang}/${name}`, lang === 'h' ? HAKKA_LITERAL_PUA : undefined);
  const dir = path.join(outputDir, lang);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function normalizedHakkaWip(raw: string): Array<Record<string, string>> {
  return JSON.parse(normalizeHakkaPua(raw)) as Array<Record<string, string>>;
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
function buildLinkCandidates(titles: ReadonlySet<string>): Map<string, string[]> {
  const candidates = new Map<string, string[]>();
  for (const title of titles) {
    const first = Array.from(title)[0];
    if (first === undefined) continue;
    const group = candidates.get(first);
    if (group) group.push(title);
    else candidates.set(first, [title]);
  }
  for (const group of candidates.values()) {
    group.sort((left, right) => codepointCount(right) - codepointCount(left) || (left < right ? -1 : left > right ? 1 : 0));
  }
  return candidates;
}

function linkMandarin(text: string, candidates: ReadonlyMap<string, readonly string[]>): string {
  let linked = '';
  for (let offset = 0; offset < text.length; ) {
    const first = String.fromCodePoint(text.codePointAt(offset)!);
    const match = candidates.get(first)?.find((title) => text.startsWith(title, offset));
    if (match) {
      linked += `\`${match}~`;
      offset += match.length;
    } else {
      linked += first;
      offset += first.length;
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
  const linkCandidates = buildLinkCandidates(mandarinTitles);

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
        const linked = linkMandarin(target, linkCandidates);
        append(hToM, title, linked === `\`${title}~` ? '' : linked);
      }
    }
    a.h = mToH;
    writeJson(outputDir, 'h', 'xref.json', { a: hToM });
  }

  if (Object.keys(a).length > 0) writeJson(outputDir, 'a', 'xref.json', a);
}
