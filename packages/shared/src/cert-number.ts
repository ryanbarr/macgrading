export const CERT_NUMBER_DIGITS = 9;
export const MAX_CERT_SEQUENCE = 999_999_999;

/**
 * Matches a complete cert number: nine digits, optional single T prefix
 * (test cert) and/or single P prefix (prototype), in that order:
 * 000000001, P000000001, T000000001, TP000000001.
 */
export const CERT_NUMBER_REGEX = /^T?P?\d{9}$/;

export interface ParsedCertNumber {
  sequenceValue: number;
  isPrototype: boolean;
  isTest: boolean;
}

export function formatCertNumber(
  sequenceValue: number,
  isPrototype: boolean,
  isTest = false,
): string {
  if (
    !Number.isInteger(sequenceValue) ||
    sequenceValue < 1 ||
    sequenceValue > MAX_CERT_SEQUENCE
  ) {
    throw new RangeError(
      `cert sequence value must be an integer in [1, ${MAX_CERT_SEQUENCE}], got ${sequenceValue}`,
    );
  }
  const digits = String(sequenceValue).padStart(CERT_NUMBER_DIGITS, '0');
  return `${isTest ? 'T' : ''}${isPrototype ? 'P' : ''}${digits}`;
}

export function parseCertNumber(input: string): ParsedCertNumber | null {
  if (!CERT_NUMBER_REGEX.test(input)) {
    return null;
  }
  const isTest = input.startsWith('T');
  const isPrototype = input.includes('P');
  const sequenceValue = Number(
    input.slice((isTest ? 1 : 0) + (isPrototype ? 1 : 0)),
  );
  if (sequenceValue < 1) {
    return null;
  }
  return { sequenceValue, isPrototype, isTest };
}

export function isValidCertNumber(input: string): boolean {
  return parseCertNumber(input) !== null;
}
