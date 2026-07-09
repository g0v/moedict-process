import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertNoPua } from './autolink';
import { canonicalJson } from './serializer';

type GeneratedIndexLang = 'a' | 'h';

export function compareUnicodeScalars(left: string, right: string): number {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const limit = Math.min(leftScalars.length, rightScalars.length);

  for (let index = 0; index < limit; index++) {
    const difference = leftScalars[index]!.codePointAt(0)! - rightScalars[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }

  return leftScalars.length - rightScalars.length;
}

export function writeGeneratedIndex(
  lang: GeneratedIndexLang,
  titles: readonly string[],
  outputDir: string,
): void {
  const index = [...new Set(titles)].sort(compareUnicodeScalars);
  const content = `${canonicalJson(index)}\n`;
  assertNoPua(content, `${lang}/index.json`);
  const langDir = path.join(outputDir, lang);
  fs.mkdirSync(langDir, { recursive: true });
  fs.writeFileSync(path.join(langDir, 'index.json'), content);
}
