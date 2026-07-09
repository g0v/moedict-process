/// <reference lib="webworker" />
import type { GrokEntry } from './types';
import { autolinkLine, buildLenToRegexMap } from './autolink';

export interface AutolinkCandidate {
  entry: GrokEntry;
  bucket: number;
  title: string;
}

export interface AutolinkJob {
  entries: AutolinkCandidate[];
  lenToRegex: Record<number, string>;
}

export interface AutolinkResult {
  lines: string[];
}
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<AutolinkJob>) => {
  const { entries, lenToRegex } = event.data;
  const regexMap = buildLenToRegexMap(lenToRegex);
  const lines: string[] = [];
  for (const { entry, bucket, title } of entries) {
    lines.push(autolinkLine(bucket, title, entry, regexMap));
  }

  const result: AutolinkResult = { lines };
  self.postMessage(result);
};
