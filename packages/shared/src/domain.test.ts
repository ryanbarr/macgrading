import { describe, expect, it } from 'vitest';
import { CERT_STATUSES, CERT_COUNTER_TYPES, ROLES } from './domain';
import type {
  CardDetailDto,
  CardSummary,
  CertDto,
  CertListDto,
  LoginResponseDto,
} from './domain';

describe('CardDetailDto', () => {
  it('is a superset of CardSummary', () => {
    const detail: CardDetailDto = {
      cardboardTensId: 'base1-4',
      cardName: 'Charizard',
      setName: 'Base',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokémon',
      cardImageUrl: 'https://img/large.png',
      cardThumbUrl: 'https://img/small.png',
      variants: ['Holofoil', '1st Edition'],
      rarity: 'Rare Holo',
      supertype: 'Pokémon',
      subtypes: ['Stage 2'],
      types: ['Fire'],
      artist: 'Mitsuhiro Arita',
      hp: '120',
      languageCode: 'EN',
      nationalPokedexNumbers: [6],
      setSeries: 'Base',
      setTotal: 102,
      setReleaseDate: '1999-01-09',
      originalName: null,
      originalSetName: null,
    };
    const summary: CardSummary = detail; // assignability is the contract
    expect(summary.cardName).toBe('Charizard');
    expect(detail.variants).toContain('Holofoil');
  });
});

describe('CardSummary', () => {
  it('accepts an optional thumbnail url', () => {
    const withThumb: CardSummary = {
      cardboardTensId: 'base1-4',
      cardName: 'Charizard',
      setName: 'Base',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokémon',
      cardImageUrl: 'https://img/large.png',
      cardThumbUrl: 'https://img/small.png',
    };
    const withoutThumb: CardSummary = { ...withThumb, cardThumbUrl: undefined };
    expect(withThumb.cardThumbUrl).toBe('https://img/small.png');
    expect(withoutThumb.cardThumbUrl).toBeUndefined();
  });
});

describe('domain constants', () => {
  it('enumerates the spec values', () => {
    expect(ROLES).toEqual(['ADMIN', 'TEAM_MEMBER']);
    expect(CERT_STATUSES).toEqual(['PENDING_GRADE', 'GRADED']);
    expect(CERT_COUNTER_TYPES).toEqual([
      'STANDARD',
      'PROTOTYPE',
      'TEST_STANDARD',
      'TEST_PROTOTYPE',
    ]);
  });

  it('CertDto carries decimal grades as strings', () => {
    // Type-level check: this must compile with grade as string | null.
    const cert: CertDto = {
      certNumber: 'P000000001',
      isPrototype: true,
      isTest: false,
      status: 'GRADED',
      cardboardTensId: 'cbt_123',
      cardName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokemon',
      cardImageUrl: null,
      variants: ['Holofoil'],
      grade: '10',
      gradeName: 'Mac Daddy',
      gradedAt: '2026-08-31T17:00:00.000Z',
      createdAt: '2026-08-31T16:00:00.000Z',
      photos: [],
    };
    expect(cert.grade).toBe('10');
  });
});

describe('CertListDto', () => {
  it('wraps items with pagination', () => {
    const list: CertListDto = { items: [], page: 1, pageSize: 20, total: 0 };
    expect(list.total).toBe(0);
  });
});

describe('LoginResponseDto', () => {
  it('type-checks a literal with an AuthUserDto role', () => {
    // Type-level check: this must compile — user.role narrows to the shared Role union.
    const response: LoginResponseDto = {
      accessToken: 'jwt.token.here',
      user: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    };
    expect(response.user.role).toBe('TEAM_MEMBER');
  });
});
