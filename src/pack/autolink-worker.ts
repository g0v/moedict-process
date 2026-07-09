/// <reference lib="webworker" />
import type { GrokEntry } from './types';
import { autolinkLine, buildLenToRegexMap } from './autolink';
import { bucketIndex, isSkippedTitle } from './bucket';
import type { Lang } from './types';

export interface AutolinkJob {
  lang: Lang;
  entries: GrokEntry[];
  lenToRegex: Record<number, string>;
}

export interface AutolinkResult {
  lines: string[];
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<AutolinkJob>) => {
  const { lang, entries, lenToRegex } = event.data;
  const regexMap = buildLenToRegexMap(lenToRegex);
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const title = entry.t;
    if (title.length === 0) continue;
    if (isSkippedTitle(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    const bucket = bucketIndex(title, lang);
    lines.push(autolinkLine(bucket, title, entry, regexMap));
  }

  const result: AutolinkResult = { lines };
  self.postMessage(result);
};
