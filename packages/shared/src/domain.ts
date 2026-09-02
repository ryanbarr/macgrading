export const ROLES = ['ADMIN', 'TEAM_MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const CERT_STATUSES = ['PENDING_GRADE', 'GRADED'] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export const CERT_COUNTER_TYPES = ['STANDARD', 'PROTOTYPE'] as const;
export type CertCounterType = (typeof CERT_COUNTER_TYPES)[number];

/** A card as returned by the card catalog (live CardboardTens API or stub). */
export interface CardSummary {
  cardboardTensId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  releaseYear: number | null;
  category: string | null;
  cardImageUrl: string | null;
  /** Small image suited to list thumbnails; optional display-only hint. */
  cardThumbUrl?: string | null;
}

/**
 * Full card detail as returned by the catalog — a superset of the mint
 * snapshot. Everything CardboardTens provides, for the pre-mint detail view.
 */
export interface CardDetailDto extends CardSummary {
  variants: string[];
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  types: string[];
  artist: string | null;
  hp: string | null;
  languageCode: string | null;
  nationalPokedexNumbers: number[];
  setSeries: string | null;
  setTotal: number | null;
  setReleaseDate: string | null;
  /** Original (non-English) card name when it differs from cardName. */
  originalName: string | null;
  /** Original (non-English) set name when it differs from setName. */
  originalSetName: string | null;
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
  /** Variant labels frozen at mint time (display form, e.g. "Reverse Holo"). */
  variants: string[];
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

export interface AuthUserDto {
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;
export type AllowedPhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

export interface PresignResponseDto {
  uploadUrl: string;
  objectKey: string;
}
