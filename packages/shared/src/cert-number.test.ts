import { describe, expect, it } from 'vitest';
import {
  CERT_NUMBER_REGEX,
  formatCertNumber,
  isValidCertNumber,
  parseCertNumber,
} from './cert-number';

describe('formatCertNumber', () => {
  it('pads standard numbers to nine digits', () => {
    expect(formatCertNumber(1, false)).toBe('000000001');
    expect(formatCertNumber(42, false)).toBe('000000042');
    expect(formatCertNumber(999_999_999, false)).toBe('999999999');
  });

  it('prefixes prototype numbers with P', () => {
    expect(formatCertNumber(1, true)).toBe('P000000001');
    expect(formatCertNumber(123_456_789, true)).toBe('P123456789');
  });

  it('rejects out-of-range or non-integer sequence values', () => {
    expect(() => formatCertNumber(0, false)).toThrow(RangeError);
    expect(() => formatCertNumber(-5, false)).toThrow(RangeError);
    expect(() => formatCertNumber(1_000_000_000, false)).toThrow(RangeError);
    expect(() => formatCertNumber(1.5, false)).toThrow(RangeError);
    expect(() => formatCertNumber(Number.NaN, false)).toThrow(RangeError);
  });
});

describe('parseCertNumber', () => {
  it('parses standard cert numbers', () => {
    expect(parseCertNumber('000000001')).toEqual({
      sequenceValue: 1,
      isPrototype: false,
    });
  });

  it('parses prototype cert numbers', () => {
    expect(parseCertNumber('P000000042')).toEqual({
      sequenceValue: 42,
      isPrototype: true,
    });
  });

  it('returns null for invalid input', () => {
    expect(parseCertNumber('')).toBeNull();
    expect(parseCertNumber('12345678')).toBeNull(); // 8 digits
    expect(parseCertNumber('1234567890')).toBeNull(); // 10 digits
    expect(parseCertNumber('p000000001')).toBeNull(); // lowercase p
    expect(parseCertNumber('PP00000001')).toBeNull();
    expect(parseCertNumber('00000000a')).toBeNull();
    expect(parseCertNumber(' 000000001')).toBeNull();
    expect(parseCertNumber('000000000')).toBeNull(); // sequence starts at 1
    expect(parseCertNumber('P000000000')).toBeNull();
  });
});

describe('isValidCertNumber', () => {
  it('accepts valid numbers and rejects invalid ones', () => {
    expect(isValidCertNumber('000000001')).toBe(true);
    expect(isValidCertNumber('P999999999')).toBe(true);
    expect(isValidCertNumber('000000000')).toBe(false);
    expect(isValidCertNumber('nonsense')).toBe(false);
  });
});

describe('CERT_NUMBER_REGEX', () => {
  it('matches full strings only', () => {
    expect(CERT_NUMBER_REGEX.test('000000001')).toBe(true);
    expect(CERT_NUMBER_REGEX.test('P000000001')).toBe(true);
    expect(CERT_NUMBER_REGEX.test('x000000001x')).toBe(false);
  });
});
