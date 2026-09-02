import { CardDetailDto } from '@macgrading/shared';

/**
 * Boundary to the CardboardTens card catalog. Both methods return the full
 * detail (a superset of the mint snapshot, CardSummary) so the pre-mint
 * detail view needs no extra fetch.
 */
export abstract class CardCatalogService {
  abstract search(query: string): Promise<CardDetailDto[]>;
  abstract getById(cardboardTensId: string): Promise<CardDetailDto | null>;
}
