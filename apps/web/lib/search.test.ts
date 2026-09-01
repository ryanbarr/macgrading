import { describe, expect, it } from 'vitest';
import { searchDestination } from './search';

describe('searchDestination', () => {
  it('routes valid cert numbers to the cert page', () => {
    expect(searchDestination('000000001')).toBe('/cert/000000001');
    expect(searchDestination('P000000042')).toBe('/cert/P000000042');
  });

  it('normalizes a lowercase p prefix', () => {
    expect(searchDestination('p000000042')).toBe('/cert/P000000042');
  });

  it('trims surrounding whitespace', () => {
    expect(searchDestination('  000000001  ')).toBe('/cert/000000001');
  });

  it('routes everything else to catalog search', () => {
    expect(searchDestination('charizard')).toBe('/catalog?q=charizard');
    expect(searchDestination('base set')).toBe('/catalog?q=base%20set');
    expect(searchDestination('12345678')).toBe('/catalog?q=12345678'); // 8 digits
    expect(searchDestination('')).toBe('/catalog?q=');
  });
});
