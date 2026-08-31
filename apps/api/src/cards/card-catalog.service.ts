import { CardSummary } from '@macgrading/shared';

/**
 * Boundary to the CardboardTens card catalog. Stub-backed until the real
 * API exists — swapping implementations is a one-line provider change
 * in CardsModule (see spec: CardboardTens integration).
 */
export abstract class CardCatalogService {
  abstract search(query: string): Promise<CardSummary[]>;
  abstract getById(cardboardTensId: string): Promise<CardSummary | null>;
}
