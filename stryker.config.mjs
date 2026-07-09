/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'command',
  commandRunner: {
    command: 'bun test',
  },
  mutate: [
    'src/semantic.ts',
    'src/parse.ts',
    'src/dedup.ts',
    'src/normalize.ts',
    'src/excel.ts',
    'src/process.ts',
    'src/convert-to-sqlite.ts',
  ],
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  coverageAnalysis: 'off',
  thresholds: { high: 85, low: 70, break: 65 },
  reporters: ['progress', 'clear-text', 'html'],
  timeoutMS: 60000,
  concurrency: 4,
};

export default config;
