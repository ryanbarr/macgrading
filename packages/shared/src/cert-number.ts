export const CERT_NUMBER_DIGITS = 9;
export const MAX_CERT_SEQUENCE = 999_999_999;

/** Matches a complete cert number: nine digits, optional single P prefix. */
export const CERT_NUMBER_REGEX = /^P?\d{9}$/;

export interface ParsedCertNumber {
  sequenceValue: number;
  isPrototype: boolean;
}

export function formatCertNumber(
  sequenceValue: number,
  isPrototype: boolean,
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
  return isPrototype ? `P${digits}` : digits;
}

export function parseCertNumber(input: string): ParsedCertNumber | null {
  if (!CERT_NUMBER_REGEX.test(input)) {
    return null;
  }
  const isPrototype = input.startsWith('P');
  const sequenceValue = Number(isPrototype ? input.slice(1) : input);
  if (sequenceValue < 1) {
    return null;
  }
  return { sequenceValue, isPrototype };
}

export function isValidCertNumber(input: string): boolean {
  return parseCertNumber(input) !== null;
}
