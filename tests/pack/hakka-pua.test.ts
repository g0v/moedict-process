import { describe, expect, it } from 'bun:test';
import { normalizeHakkaPua } from '~/pack/hakka-pua';

describe('normalizeHakkaPua', () => {
  it('converts WIP placeholder tokens', () => {
    expect(normalizeHakkaPua('【{[F305]}仔】')).toBe('【𠊎仔】');
  });

  it('rejects an unmapped WIP token', () => {
    expect(() => normalizeHakkaPua('{[FFFF]}')).toThrow('unknown Hakka PUA token');
  });
});
