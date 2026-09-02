import { isValidCertNumber } from '@macgrading/shared';

/** One box, two behaviors: cert numbers go to the permalink, text goes to catalog search. */
export function searchDestination(rawInput: string): string {
  const trimmed = rawInput.trim();
  // Case-normalize prefix letters (t/p) on otherwise cert-shaped input.
  const match = /^([tp]{0,2})(\d{9})$/i.exec(trimmed);
  const normalized = match
    ? `${match[1].toUpperCase()}${match[2]}`
    : trimmed;
  if (isValidCertNumber(normalized)) {
    return `/cert/${normalized}`;
  }
  return `/catalog?q=${encodeURIComponent(trimmed)}`;
}
