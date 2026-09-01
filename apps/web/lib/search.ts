import { isValidCertNumber } from '@macgrading/shared';

/** One box, two behaviors: cert numbers go to the permalink, text goes to catalog search. */
export function searchDestination(rawInput: string): string {
  const trimmed = rawInput.trim();
  const normalized = /^p\d{9}$/.test(trimmed) ? `P${trimmed.slice(1)}` : trimmed;
  if (isValidCertNumber(normalized)) {
    return `/cert/${normalized}`;
  }
  return `/catalog?q=${encodeURIComponent(trimmed)}`;
}
