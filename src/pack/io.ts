import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Lang } from './types';
import { filenameForTitle, FileTitleAcceptor } from './bucket';
import { cLocaleCompare } from './serializer';

const PACK_DIR: Record<Lang, string> = {
  a: 'pack',
  t: 'ptck',
  h: 'phck',
  c: 'pcck',
};

export class PackWriter {
  private acceptors = new Map<Lang, FileTitleAcceptor>();
  private prepack = new Map<string, string[]>();
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  writeEntry(
    lang: Lang,
    bucket: number,
    bucketTitle: string,
    fileTitle: string,
    payload: string,
  ): string | null {
    let acceptor = this.acceptors.get(lang);
    if (!acceptor) {
      acceptor = new FileTitleAcceptor();
      this.acceptors.set(lang, acceptor);
    }
    if (!acceptor.acceptFileTitle(fileTitle)) return null;

    const filename = filenameForTitle(fileTitle);
    const langDir = path.join(this.outputDir, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const entryPath = path.join(langDir, `${filename}.json`);
    // Legacy link2pack.pl substitution before writing.
    const processedPayload = payload.replace(/`\{~/g, '{');
    fs.writeFileSync(entryPath, processedPayload);

    const key = `${lang}:${bucket}`;
    if (!this.prepack.has(key)) this.prepack.set(key, []);
    this.prepack.get(key)!.push(`\n,"${bucketTitle}":${processedPayload}`);
    return fileTitle;
  }

  finalize(): void {
    for (const [key, parts] of this.prepack) {
      const [lang, bucket] = key.split(':') as [Lang, string];
      const dir = path.join(this.outputDir, PACK_DIR[lang]);
      fs.mkdirSync(dir, { recursive: true });
      parts.sort(cLocaleCompare);
      let body = parts.join('');
      body = body.replace(/^\n,/, '{');
      body += '\n}\n';
      fs.writeFileSync(path.join(dir, `${bucket}.txt`), body);
    }
  }
}
