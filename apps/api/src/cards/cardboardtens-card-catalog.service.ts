import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardSummary } from '@macgrading/shared';
import { CardCatalogService } from './card-catalog.service';

interface CardboardTensSet {
  id: string;
  name: string;
  nameEn: string;
  series: string;
  releaseDate: string;
  total: number;
}

interface CardboardTensCard {
  id: string;
  name: string;
  nameEn: string;
  languageCode: string | null;
  number: string;
  rarity: string | null;
  set: CardboardTensSet;
  images: { small: string | null; large: string | null };
  variants: string[];
  supertype: string | null;
  subtypes: string[];
  types: string[];
  nationalPokedexNumbers: number[];
  artist: string | null;
  hp: string | null;
}

interface CardboardTensSearchResponse {
  cards: CardboardTensCard[];
  total: number;
  page: number;
}

const DEFAULT_BASE_URL = 'https://www.cardboardtens.com/api/v1';
const SEARCH_LIMIT = 25;
const MAX_RETRY_AFTER_SECONDS = 5;
const SERVER_ERROR_RETRY_SECONDS = 0.5;

/**
 * Live CardboardTens Developer API implementation of the card catalog.
 * Selected by CardsModule only when CARDBOARDTENS_API_KEY is configured;
 * the stub serves otherwise. Read-only: search + single-card lookup.
 */
@Injectable()
export class CardboardTensCardCatalogService extends CardCatalogService {
  private readonly logger = new Logger(CardboardTensCardCatalogService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    super();
    this.apiKey = config.getOrThrow<string>('CARDBOARDTENS_API_KEY');
    this.baseUrl = (
      config.get<string>('CARDBOARDTENS_API_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/$/, '');
  }

  async search(query: string): Promise<CardSummary[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(SEARCH_LIMIT),
    });
    const body = await this.request<CardboardTensSearchResponse>(
      `/cards?${params.toString()}`,
    );
    return body.cards.map((card) => this.toCardSummary(card));
  }

  async getById(cardboardTensId: string): Promise<CardSummary | null> {
    const body = await this.request<CardboardTensCard | null>(
      `/cards/${encodeURIComponent(cardboardTensId)}`,
      { nullOn404: true },
    );
    return body ? this.toCardSummary(body) : null;
  }

  private async request<T>(
    path: string,
    options: { nullOn404?: boolean } = {},
    attempt = 0,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (response.status === 404 && options.nullOn404) {
      return null as T;
    }
    if (response.status === 401) {
      throw new Error(
        'CardboardTens rejected the API key — check CARDBOARDTENS_API_KEY',
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 1) {
      const retryAfterSeconds =
        response.status === 429
          ? Math.min(
              Number(response.headers.get('Retry-After') ?? 1) || 1,
              MAX_RETRY_AFTER_SECONDS,
            )
          : SERVER_ERROR_RETRY_SECONDS;
      this.logger.warn(
        `CardboardTens responded ${response.status}; retrying in ${retryAfterSeconds}s`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfterSeconds * 1000),
      );
      return this.request<T>(path, options, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`CardboardTens API error ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private toCardSummary(card: CardboardTensCard): CardSummary {
    const releaseYear = Number(card.set.releaseDate?.slice(0, 4));
    return {
      cardboardTensId: card.id,
      cardName: card.nameEn,
      setName: card.set.nameEn,
      cardNumber:
        card.set.total > 0 ? `${card.number}/${card.set.total}` : card.number,
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
      category: 'Pokémon',
      cardImageUrl: card.images.large ?? card.images.small,
    };
  }
}
