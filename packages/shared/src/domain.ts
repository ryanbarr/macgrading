export const ROLES = ['ADMIN', 'TEAM_MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const CERT_STATUSES = ['PENDING_GRADE', 'GRADED'] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export const CERT_COUNTER_TYPES = ['STANDARD', 'PROTOTYPE'] as const;
export type CertCounterType = (typeof CERT_COUNTER_TYPES)[number];

/** A card as returned by the card catalog (CardboardTens stub for now). */
export interface CardSummary {
  cardboardTensId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  releaseYear: number | null;
  category: string | null;
  cardImageUrl: string | null;
}

export interface CertPhotoDto {
  id: string;
  url: string;
  sortOrder: number;
}

/**
 * The public wire shape of a certification. Dates are ISO-8601 strings;
 * decimal grades travel as strings, never floats.
 */
export interface CertDto {
  certNumber: string;
  isPrototype: boolean;
  status: CertStatus;
  cardboardTensId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  releaseYear: number | null;
  category: string | null;
  cardImageUrl: string | null;
  grade: string | null;
  gradeName: string | null;
  gradedAt: string | null;
  createdAt: string;
  photos: CertPhotoDto[];
}

export interface GradeNameDto {
  gradeValue: string;
  name: string;
}

export interface CertListDto {
  items: CertDto[];
  page: number;
  pageSize: number;
  total: number;
}
