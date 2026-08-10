import { afterAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeAudioBopomofo, runPack } from '~/pack/pipeline';

interface Reading {
  bopomofo: string;
  pinyin: string;
}

interface PackedReading {
  b: string;
  p: string;
  '='?: string;
}

const roots: string[] = [];

function reading(bopomofo: string, pinyin: string): Reading {
  return { bopomofo, pinyin };
}

async function packReadings(
  title: string,
  readings: Reading[],
  audioMap: Record<string, string>,
): Promise<PackedReading[]> {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'audio-binding-'));
  roots.push(root);
  const inputDir = path.join(root, 'input');
  const outputDir = path.join(root, 'output');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(
    path.join(inputDir, 'dict-revised.json'),
    JSON.stringify([
      {
        title,
        heteronyms: readings.map((item) => ({
          ...item,
          definitions: [{ def: '測試義。' }],
        })),
      },
    ]),
  );
  fs.writeFileSync(
    path.join(inputDir, 'dict-concised.audio.json'),
    JSON.stringify(audioMap),
  );

  await runPack({ lang: 'a', inputDir, outputDir, concurrency: 1 });
  const packed = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'a', `${title}.json`), 'utf8'),
  ) as { h: PackedReading[] };
  return packed.h;
}

function audioByPhoneticIdentity(
  readings: PackedReading[],
): Record<string, string | null> {
  return Object.fromEntries(
    readings.map((item) => [
      JSON.stringify([item.b, item.p]),
      item['='] ?? null,
    ]),
  );
}

function expectSingleOwner(
  readings: PackedReading[],
  audioId: string,
  bopomofo: string,
): void {
  const owners = readings.filter((item) => item['='] === audioId);
  expect(owners).toHaveLength(1);
  expect(owners[0]?.b).toBe(bopomofo);
}

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

describe('Mandarin audio binding', () => {
  it('canonicalizes only source-equivalent Zhuyin separator variants', () => {
    expect(normalizeAudioBopomofo('ㄉㄧㄠˋ ㄆㄟˋ')).toBe('ㄉㄧㄠˋㄆㄟˋ');
    expect(normalizeAudioBopomofo('ㄉㄧㄠˋ　ㄆㄟˋ')).toBe('ㄉㄧㄠˋㄆㄟˋ');
    expect(normalizeAudioBopomofo('ㄉㄧㄠˋㄆㄟˋ')).toBe('ㄉㄧㄠˋㄆㄟˋ');
    expect(normalizeAudioBopomofo('ㄌㄠˇ ˙ㄗ')).toBe('ㄌㄠˇ˙ㄗ');
    expect(normalizeAudioBopomofo(' ㄇㄣˊ　')).toBe('ㄇㄣˊ');

    // A separator after a toneless first-tone syllable is phonetic structure,
    // not formatting: stripping all whitespace would merge these readings.
    expect(normalizeAudioBopomofo('ㄒㄧ　ㄢ')).not.toBe(
      normalizeAudioBopomofo('ㄒㄧㄢ'),
    );
  });

  it('is invariant under heteronym reordering', async () => {
    const readings = [
      reading('ㄊㄧㄠˊ ㄆㄟˋ', 'tiáo pèi'),
      reading('ㄉㄧㄠˋ ㄆㄟˋ', 'diào pèi'),
    ];
    const audioMap = { '調配.ㄉㄧㄠˋㄆㄟˋ': '1190000050' };

    const original = await packReadings('調配', readings, audioMap);
    const reordered = await packReadings('調配', [...readings].reverse(), audioMap);

    expect(audioByPhoneticIdentity(reordered)).toEqual(
      audioByPhoneticIdentity(original),
    );
  });

  it('binds 調配 audio to exactly the diào pèi reading', async () => {
    const packed = await packReadings(
      '調配',
      [
        reading('ㄊㄧㄠˊ ㄆㄟˋ', 'tiáo pèi'),
        reading('ㄉㄧㄠˋ ㄆㄟˋ', 'diào pèi'),
      ],
      { '調配.ㄉㄧㄠˋㄆㄟˋ': '1190000050' },
    );

    // The audio source explicitly keys 1190000050 as 調配.ㄉㄧㄠˋㄆㄟˋ.
    expectSingleOwner(packed, '1190000050', 'ㄉㄧㄠˋ ㄆㄟˋ');
  });

  it('binds 老子 audio to exactly the neutral-tone zi reading', async () => {
    const packed = await packReadings(
      '老子',
      [
        reading('ㄌㄠˇ ㄗˇ', 'lǎo zǐ'),
        reading('ㄌㄠˇ ˙ㄗ', 'lǎo zi'),
      ],
      { '老子.ㄌㄠˇ˙ㄗ': '179200119' },
    );

    expectSingleOwner(packed, '179200119', 'ㄌㄠˇ ˙ㄗ');
  });

  it('binds 老公 audio to lǎo gōng, not the neutral-tone eunuch reading', async () => {
    const packed = await packReadings(
      '老公',
      [
        reading('ㄌㄠˇ ˙ㄍㄨㄥ', 'lǎo gong'),
        reading('ㄌㄠˇ ㄍㄨㄥ', 'lǎo gōng'),
      ],
      { '老公.ㄌㄠˇㄍㄨㄥ': '179200072' },
    );

    expectSingleOwner(packed, '179200072', 'ㄌㄠˇ ㄍㄨㄥ');
    expect(packed.find((item) => item.b === 'ㄌㄠˇ ˙ㄍㄨㄥ')?.['=']).toBeUndefined();
  });

  it('attaches none when normalization leaves two possible owners', async () => {
    const packed = await packReadings(
      '同音',
      [
        reading('ㄊㄨㄥˊ ㄧㄣ', 'tóng yīn'),
        reading('ㄊㄨㄥˊ　ㄧㄣ', 'tóngyin-alt'),
      ],
      { '同音.ㄊㄨㄥˊㄧㄣ': 'ambiguous-audio' },
    );

    // The map has no pinyin, so two candidate records sharing canonical
    // Zhuyin make ownership undecidable; duplicating the recording is worse.
    expect(packed.every((item) => item['='] === undefined)).toBe(true);
  });

  it('attaches no audio when a title-only map cannot justify an owner', async () => {
    const packed = await packReadings(
      '無據',
      [reading('ㄨˊ ㄐㄩˋ', 'wú jù'), reading('ㄨˋ ㄐㄩˋ', 'wù jù')],
      { 無據: 'fixture-audio' },
    );

    expect(packed.every((item) => item['='] === undefined)).toBe(true);
  });
});
