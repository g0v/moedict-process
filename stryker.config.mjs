/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  mutate: [
    'src/semantic.ts',
    'src/parse.ts',
    'src/dedup.ts',
    'src/normalize.ts',
  ],
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  coverageAnalysis: 'perTest',
  thresholds: { high: 85, low: 70, break: 65 },
  reporters: ['progress', 'clear-text', 'html'],
  timeoutMS: 30000,
  concurrency: 4,
};

export default config;
