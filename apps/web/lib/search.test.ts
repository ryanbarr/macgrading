import { describe, expect, it } from 'vitest';
import { searchDestination } from './search';

describe('searchDestination', () => {
  it('routes valid cert numbers to the cert page', () => {
    expect(searchDestination('000000001')).toBe('/cert/000000001');
    expect(searchDestination('P000000042')).toBe('/cert/P000000042');
  });

  it('normalizes lowercase prefix letters', () => {
    expect(searchDestination('p000000042')).toBe('/cert/P000000042');
    expect(searchDestination('t000000007')).toBe('/cert/T000000007');
    expect(searchDestination('tp000000003')).toBe('/cert/TP000000003');
    expect(searchDestination('Tp000000003')).toBe('/cert/TP000000003');
  });

  it('rejects malformed prefix orders as catalog searches', () => {
    expect(searchDestination('pt000000003')).toBe('/catalog?q=pt000000003');
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
